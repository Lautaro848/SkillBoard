import { datosPorToken } from "~/lib/carrusel.server";
import type { Route } from "./+types/tv-datos";

// Ruta de datos pura: sin componente, así devuelve JSON de verdad. Es lo que
// la TV vuelve a pedir cada 30 segundos para enterarse de altas, bajas y
// cambios de configuración sin que nadie tenga que reiniciarla.
//
// No registra el acceso en auditoría: eso pasa una sola vez, cuando se abre
// la pantalla. Si no, una TV prendida todo el día escribiría la misma línea
// 2.880 veces.
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const resultado = await datosPorToken(request, context, params.token, false);

  // Tres respuestas distintas a propósito. 404 es "este enlace ya no vale" y
  // apaga la pantalla; 503 es "no pudimos consultar" y la deja girando con lo
  // último que tenía. Devolver 404 ante un corte de red apagaría una TV por
  // diez segundos de internet mala.
  const estados = { ok: 200, no_existe: 404, error: 503 } as const;

  return Response.json(resultado.estado === "ok" ? resultado.datos : null, {
    status: estados[resultado.estado],
    headers: { "Cache-Control": "no-store" },
  });
}
