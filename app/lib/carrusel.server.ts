import type { AppLoadContext } from "react-router";
import { createSupabaseServerClient, createSupabaseServiceClient } from "~/lib/supabase.server";
import { urlFirmada, urlesFirmadas } from "~/lib/storage.server";
import { getEnv } from "~/lib/env.server";
import type { DatosCarrusel } from "~/lib/carrusel";

// La IP real detrás de un proxy. Cloudflare y Vercel ponen la suya; el resto
// cae a x-forwarded-for, del que se toma el primer valor (el cliente).
export function ipDelRequest(request: Request): string | null {
  const directa = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  if (directa) return directa;
  const reenviada = request.headers.get("x-forwarded-for");
  return reenviada ? reenviada.split(",")[0].trim() : null;
}

// Un token que ya no existe y una base que no responde NO son lo mismo, y la
// TV reacciona distinto a cada uno: con el primero se apaga, con el segundo
// sigue girando con los últimos datos hasta que vuelva. Confundirlos dejaría
// una pantalla apagada para siempre por un corte de red de diez segundos.
export type Resultado =
  | { estado: "ok"; datos: DatosCarrusel }
  | { estado: "no_existe" }
  | { estado: "error" };

// Los datos de la TV NO salen de una consulta a las tablas: salen de la
// función `carrusel_datos`, que es la única que puede leerlos sin sesión y
// que solo devuelve los campos permitidos. Ver 0012_carrusel.sql.
export async function datosPorToken(
  request: Request,
  context: AppLoadContext | undefined,
  token: string,
  registrarAcceso: boolean,
): Promise<Resultado> {
  const { supabase } = createSupabaseServerClient(request, context);

  try {
    const { data, error } = await supabase.rpc("carrusel_datos", {
      p_token: token,
      p_ip: registrarAcceso ? ipDelRequest(request) : null,
      p_registrar: registrarAcceso,
    });

    if (error) return { estado: "error" };
    // La función devuelve null solo cuando el token no existe, fue rotado o
    // el carrusel está apagado: ahí sí corresponde cortar.
    if (!data) return { estado: "no_existe" };

    const datos = data as DatosCarrusel;
    return { estado: "ok", datos: { ...datos, ...(await conFotos(context, datos)) } };
  } catch {
    return { estado: "error" };
  }
}

// Las fotos viven en un bucket privado y la TV no tiene sesión, así que las
// firma el servidor. Vida de dos horas: la pantalla vuelve a pedir los datos
// cada 30 segundos, así que los enlaces se renuevan solos mucho antes de
// vencer.
//
// Sin SUPABASE_SERVICE_ROLE_KEY cargada no se pueden firmar. En ese caso la
// TV muestra el avatar de iniciales en vez de romperse: nunca un hueco.
async function conFotos(
  context: AppLoadContext | undefined,
  datos: DatosCarrusel,
): Promise<Partial<DatosCarrusel>> {
  if (!getEnv(context).SUPABASE_SERVICE_ROLE_KEY) return {};

  const servicio = createSupabaseServiceClient(context);

  const [logoUrl, fotos] = await Promise.all([
    datos.carrusel.logoKey ? urlFirmada(servicio, datos.carrusel.logoKey, 7200) : null,
    urlesFirmadas(
      servicio,
      datos.empleados.map((e) => e.fotoKey).filter((k): k is string => Boolean(k)),
      7200,
    ),
  ]);

  return {
    carrusel: { ...datos.carrusel, logoUrl },
    empleados: datos.empleados.map((e) => ({
      ...e,
      fotoUrl: e.fotoKey ? (fotos.get(e.fotoKey) ?? null) : null,
    })),
  };
}
