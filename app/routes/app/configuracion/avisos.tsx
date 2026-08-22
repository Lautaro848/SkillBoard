import { Form } from "react-router";
import { z } from "zod";
import { requireSesion } from "~/lib/sesion.server";
import type { Route } from "./+types/avisos";

const avisosSchema = z.object({
  // Un email por línea; vacío significa "a los administradores de la empresa".
  destinatarios: z.string().optional().default(""),
  diasAnticipacion: z.coerce.number().int().min(1).max(365),
  frecuencia: z.enum(["diaria", "semanal", "desactivada"]),
});

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  const [{ data: config }, { data: corridas }, { data: admins }] = await Promise.all([
    supabase
      .from("config_avisos")
      .select("destinatarios, dias_anticipacion, frecuencia")
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("avisos_enviados")
      .select("enviado_en, estado, vencidos, por_vencer, faltantes, detalle")
      .eq("empresa_id", empresaId)
      .order("enviado_en", { ascending: false })
      .limit(5),
    supabase
      .from("membresias")
      .select("perfiles(email)")
      .eq("empresa_id", empresaId)
      .eq("estado", "activa")
      .in("rol", ["propietario", "administrador"]),
  ]);

  return {
    config: config ?? { destinatarios: [], dias_anticipacion: 30, frecuencia: "diaria" },
    corridas: corridas ?? [],
    // PostgREST devuelve el embed como arreglo cuando no puede garantizar
    // cardinalidad 1, así que se normalizan los dos casos.
    adminsEmails: (admins ?? [])
      .flatMap((m: { perfiles?: unknown }) =>
        Array.isArray(m.perfiles) ? m.perfiles : m.perfiles ? [m.perfiles] : [],
      )
      .map((p) => (p as { email?: string }).email)
      .filter((e): e is string => Boolean(e)),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const formData = await request.formData();
  const parsed = avisosSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Datos inválidos" };
  }

  const destinatarios = parsed.data.destinatarios
    .split(/[\n,]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const invalido = destinatarios.find((e) => !z.string().email().safeParse(e).success);
  if (invalido) return { error: `"${invalido}" no es un email válido.` };

  const { error } = await supabase.from("config_avisos").upsert(
    {
      empresa_id: empresaId,
      destinatarios,
      dias_anticipacion: parsed.data.diasAnticipacion,
      frecuencia: parsed.data.frecuencia,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "empresa_id" },
  );

  if (error) return { error: "No pudimos guardar la configuración." };
  return { ok: true };
}

const ESTADO_CORRIDA: Record<string, string> = {
  enviado: "Enviado",
  sin_novedades: "Sin novedades",
  error: "Error",
};

export default function Avisos({ loaderData, actionData }: Route.ComponentProps) {
  const { config, corridas, adminsEmails } = loaderData;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-seccion font-semibold text-texto">Avisos de vencimiento</h1>
        <p className="text-menor text-secundario">
          Un solo email por día con todo lo que requiere atención: vencidos, por vencer y obligatorios sin
          cargar.
        </p>
      </div>

      {actionData?.error && (
        <p className="rounded-control border border-error/30 bg-error/5 p-3 text-menor text-error">
          {actionData.error}
        </p>
      )}
      {actionData?.ok && (
        <p className="rounded-control border border-exito/30 bg-exito/5 p-3 text-menor text-exito">
          Configuración guardada.
        </p>
      )}

      <Form method="post" className="flex flex-col gap-4 rounded-tarjeta border border-borde-decorativo p-4">
        <div>
          <label className="text-menor font-medium" htmlFor="destinatarios">
            Destinatarios
          </label>
          <textarea
            id="destinatarios"
            name="destinatarios"
            rows={3}
            defaultValue={(config.destinatarios ?? []).join("\n")}
            placeholder="Un email por línea"
            className="mt-1 block w-full rounded-control border border-borde-decorativo px-3 py-2 text-menor"
          />
          <p className="mt-1 text-auxiliar text-secundario">
            Si lo dejás vacío, el aviso va a los administradores de la empresa
            {adminsEmails.length > 0 && `: ${adminsEmails.join(", ")}`}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-menor font-medium" htmlFor="diasAnticipacion">
              Días de anticipación
            </label>
            <input
              id="diasAnticipacion"
              name="diasAnticipacion"
              type="number"
              min={1}
              max={365}
              defaultValue={config.dias_anticipacion}
              className="mt-1 block w-full rounded-control border border-borde-decorativo px-3 py-2 text-menor"
            />
            <p className="mt-1 text-auxiliar text-secundario">
              Cada tipo de certificado puede tener su propio umbral; este es el tope general.
            </p>
          </div>

          <div>
            <label className="text-menor font-medium" htmlFor="frecuencia">
              Frecuencia
            </label>
            <select
              id="frecuencia"
              name="frecuencia"
              defaultValue={config.frecuencia}
              className="mt-1 block w-full rounded-control border border-borde-decorativo px-3 py-2 text-menor"
            >
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal (lunes)</option>
              <option value="desactivada">Desactivada</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-fit rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
        >
          Guardar
        </button>
      </Form>

      <section>
        <h2 className="text-menor font-medium text-texto">Últimos envíos</h2>
        {corridas.length === 0 ? (
          <p className="mt-2 rounded-tarjeta border border-dashed border-borde-decorativo p-4 text-center text-menor text-secundario">
            Todavía no corrió ningún aviso. El primero sale mañana a las 08:00.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-borde-decorativo rounded-tarjeta border border-borde-decorativo">
            {corridas.map((c: any, i: number) => (
              <li key={i} className="px-4 py-2 text-menor">
                <div className="flex items-center justify-between">
                  <span>{new Date(c.enviado_en).toLocaleString("es-AR")}</span>
                  <span
                    style={{
                      color:
                        c.estado === "error"
                          ? "var(--color-error)"
                          : c.estado === "enviado"
                            ? "var(--color-exito)"
                            : "var(--color-secundario)",
                    }}
                  >
                    {ESTADO_CORRIDA[c.estado] ?? c.estado}
                  </span>
                </div>
                <p className="text-auxiliar text-secundario">
                  {c.vencidos} vencidos · {c.por_vencer} por vencer · {c.faltantes} faltantes
                </p>
                {c.detalle && <p className="mt-0.5 text-auxiliar text-error">{c.detalle}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
