import { useState } from "react";
import { Link, redirect, useFetcher, useSearchParams } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { Avatar } from "~/components/avatar";
import { urlFirmada } from "~/lib/storage.server";
import { NIVEL_ETIQUETAS } from "~/lib/validation/empleados";
import type { Route } from "./+types/perfil";

const ETIQUETAS_ESTADO: Record<string, string> = { activo: "Activo", licencia: "Licencia", baja: "Baja" };

function antiguedad(fechaIngreso: string): string {
  const dias = Math.floor((Date.now() - new Date(fechaIngreso).getTime()) / 86_400_000);
  const anios = Math.floor(dias / 365.25);
  if (anios < 1) return "Menos de 1 año";
  return `${anios} ${anios === 1 ? "año" : "años"}`;
}

const ORDEN_ESTADO_CERT: Record<string, number> = { vencido: 0, vence_hoy: 1, por_vencer: 2, vigente: 3, sin_vencimiento: 4 };
const ETIQUETAS_ESTADO_CERT: Record<string, string> = {
  vencido: "Vencido",
  vence_hoy: "Vence hoy",
  por_vencer: "Por vencer",
  vigente: "Vigente",
  sin_vencimiento: "Sin vencimiento",
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const empleadoId = params.id;

  const [{ data: empleado }, { data: aptitudes }, { data: certificados }, { data: auditoria }] = await Promise.all([
    supabase
      .from("empleados")
      .select("*, puestos(nombre), departamentos(nombre)")
      .eq("id", empleadoId)
      .eq("empresa_id", empresaId)
      .single(),
    supabase
      .from("empleado_aptitudes")
      .select("nivel, validado_en, aptitudes(nombre), perfiles(nombre, apellido)")
      .eq("empleado_id", empleadoId),
    supabase
      .from("v_certificados")
      .select("*, tipos_certificado(nombre)")
      .eq("empleado_id", empleadoId)
      .order("dias_restantes", { ascending: true, nullsFirst: false }),
    supabase
      .from("auditoria")
      .select("accion, creado_en, usuario_id, perfiles(nombre, apellido)")
      .eq("entidad", "empleados")
      .eq("entidad_id", empleadoId)
      .order("creado_en", { ascending: false })
      .limit(20),
  ]);

  if (!empleado) throw new Response("No encontrado", { status: 404 });

  const fotoUrlFirmada = empleado.foto_url ? await urlFirmada(supabase, empleado.foto_url) : null;

  const certificadosConUrl = await Promise.all(
    (certificados ?? []).map(async (c: any) => ({
      ...c,
      archivoUrlFirmada: c.archivo_url ? await urlFirmada(supabase, c.archivo_url) : null,
    })),
  );
  certificadosConUrl.sort((a: any, b: any) => (ORDEN_ESTADO_CERT[a.estado] ?? 9) - (ORDEN_ESTADO_CERT[b.estado] ?? 9));

  return {
    empleado,
    fotoUrlFirmada,
    aptitudes: aptitudes ?? [],
    certificados: certificadosConUrl,
    auditoria: auditoria ?? [],
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, empresaId, rol } = await requireSesion(request, context);
  if (rol !== "propietario" && rol !== "administrador") {
    return { error: "No tenés permiso para eliminar empleados." };
  }

  await supabase
    .from("empleados")
    .update({ eliminado_en: new Date().toISOString() })
    .eq("id", params.id)
    .eq("empresa_id", empresaId);

  throw redirect("/empleados");
}

const PESTANIAS = ["datos", "aptitudes", "certificados", "historial", "actividad"] as const;
type Pestania = (typeof PESTANIAS)[number];
const ETIQUETAS_TAB: Record<Pestania, string> = {
  datos: "Datos",
  aptitudes: "Aptitudes",
  certificados: "Certificados",
  historial: "Historial",
  actividad: "Actividad",
};

export default function PerfilEmpleado({ loaderData }: Route.ComponentProps) {
  const { empleado, fotoUrlFirmada, aptitudes, certificados, auditoria } = loaderData;
  const [searchParams] = useSearchParams();
  const pestania = (searchParams.get("tab") as Pestania) ?? "datos";

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm text-[var(--color-text-muted)]">
        <Link to="/empleados" className="underline">
          Empleados
        </Link>{" "}
        › {empleado.nombre} {empleado.apellido}
      </nav>

      <div className="flex items-center gap-4 rounded-lg border border-[var(--color-border)] p-4">
        <Avatar nombre={empleado.nombre} apellido={empleado.apellido} idInterno={empleado.id_interno} fotoUrl={fotoUrlFirmada} size={64} />
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">
            {empleado.nombre} {empleado.apellido}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {empleado.puestos?.nombre ?? "Sin puesto"} · {empleado.departamentos?.nombre ?? "Sin departamento"} · {empleado.id_interno} ·{" "}
            {antiguedad(empleado.fecha_ingreso)} · {ETIQUETAS_ESTADO[empleado.estado]}
          </p>
        </div>
        <Link to={`/empleados/${empleado.id}/editar`} className="ml-auto rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
          Editar
        </Link>
        <BotonEliminar nombreCompleto={`${empleado.nombre} ${empleado.apellido}`} />
      </div>

      <nav className="flex gap-1 border-b border-[var(--color-border)]">
        {PESTANIAS.map((p) => (
          <a
            key={p}
            href={`?tab=${p}`}
            className={`px-3 py-2 text-sm ${
              p === pestania
                ? "border-b-2 border-[var(--color-primary)] font-medium text-[var(--color-primary)]"
                : "text-[var(--color-text-muted)]"
            }`}
          >
            {ETIQUETAS_TAB[p]}
          </a>
        ))}
      </nav>

      {pestania === "datos" && (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Dato label="Email" valor={empleado.email ?? "—"} />
          <Dato label="Teléfono" valor={empleado.telefono ?? "—"} />
          <Dato label="Fecha de nacimiento" valor={formatearFecha(empleado.fecha_nacimiento)} />
          <Dato label="Fecha de ingreso" valor={formatearFecha(empleado.fecha_ingreso)} />
          <Dato label="Observaciones" valor={empleado.observaciones || "—"} />
        </dl>
      )}

      {pestania === "aptitudes" && (
        <>
          {aptitudes.length === 0 ? (
            <EstadoVacio texto="Todavía no se cargaron aptitudes. Las aptitudes permiten que Tukson asigne tareas con criterio." />
          ) : (
            <ul className="flex flex-col gap-3">
              {aptitudes.map((a: any, i: number) => (
                <li key={i} className="rounded-lg border border-[var(--color-border)] p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{a.aptitudes?.nombre}</span>
                    <span className="text-[var(--color-text-muted)]">{NIVEL_ETIQUETAS[a.nivel]}</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className="h-1.5 flex-1 rounded-full"
                        style={{ backgroundColor: n <= a.nivel ? "var(--color-primary)" : "var(--color-border)" }}
                      />
                    ))}
                  </div>
                  {a.perfiles && (
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Validado por {a.perfiles.nombre} {a.perfiles.apellido} el {formatearFecha(a.validado_en)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {pestania === "certificados" && (
        <>
          {certificados.length === 0 ? (
            <EstadoVacio texto="Todavía no se cargaron certificados. (La carga se habilita en la Fase 2.)" />
          ) : (
            <ul className="flex flex-col gap-3">
              {certificados.map((c: any) => (
                <li
                  key={c.id}
                  className={`rounded-lg border p-3 ${
                    c.estado === "vencido" ? "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5" : "border-[var(--color-border)]"
                  }`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.tipos_certificado?.nombre}</span>
                    <span
                      className={
                        c.estado === "vencido"
                          ? "text-[var(--color-danger)]"
                          : c.estado === "por_vencer" || c.estado === "vence_hoy"
                            ? "text-[var(--color-warning)]"
                            : "text-[var(--color-success)]"
                      }
                    >
                      {ETIQUETAS_ESTADO_CERT[c.estado]}
                      {c.dias_restantes != null && c.estado !== "vigente" && ` (${Math.abs(c.dias_restantes)} días)`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    N.° {c.numero ?? "—"} · Emitido {formatearFecha(c.fecha_emision)}
                    {c.fecha_vencimiento && ` · Vence ${formatearFecha(c.fecha_vencimiento)}`}
                  </p>
                  {c.archivoUrlFirmada && (
                    <a href={c.archivoUrlFirmada} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-[var(--color-primary)] underline">
                      Ver archivo
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {pestania === "historial" && (
        <EstadoVacio texto="Todavía no hay asignaciones de Tukson para este empleado. (Se habilita en la Fase 5.)" />
      )}

      {pestania === "actividad" && (
        <>
          {auditoria.length === 0 ? (
            <EstadoVacio texto="Sin actividad registrada todavía." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {auditoria.map((a: any, i: number) => (
                <li key={i} className="rounded-md border border-[var(--color-border)] px-3 py-2">
                  <span className="font-medium">{a.accion}</span> por {a.perfiles ? `${a.perfiles.nombre} ${a.perfiles.apellido}` : "sistema"} ·{" "}
                  {formatearFecha(a.creado_en)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5">{valor}</dd>
    </div>
  );
}

function EstadoVacio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]">{texto}</p>;
}

function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

// Pide el nombre completo escrito, no solo un "confirmar" genérico
// (03-modulos-y-alcance.md, criterio de aceptación del módulo 2).
function BotonEliminar({ nombreCompleto }: { nombreCompleto: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const fetcher = useFetcher();
  const coincide = texto.trim() === nombreCompleto;

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="rounded-md border border-[var(--color-danger)]/40 px-4 py-2 text-sm font-medium text-[var(--color-danger)]">
        Eliminar
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-[var(--color-surface)] p-5">
        <h2 className="font-semibold text-[var(--color-text)]">Eliminar empleado</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Escribí <strong>{nombreCompleto}</strong> para confirmar. Sus certificados e historial se conservan para auditoría.
        </p>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="mt-3 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setAbierto(false)} className="rounded-md px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <fetcher.Form method="post">
            <button
              type="submit"
              disabled={!coincide || fetcher.state !== "idle"}
              className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Eliminar
            </button>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}
