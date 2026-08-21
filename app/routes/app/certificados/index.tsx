import { useState } from "react";
import { Form, Link } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { cargarCertificados, type CertificadoConEmpleado } from "~/lib/certificados.server";
import { EstadoCert } from "~/components/estado-certificado";
import type { Route } from "./+types/index";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const params = new URL(request.url).searchParams;

  const filtros = {
    tipo: params.get("tipo") ?? "",
    departamento: params.get("departamento") ?? "",
    puesto: params.get("puesto") ?? "",
    q: params.get("q") ?? "",
  };

  const [{ certificados, faltantes }, { data: tipos }, { data: departamentos }, { data: puestos }] =
    await Promise.all([
      cargarCertificados(supabase, empresaId),
      supabase.from("tipos_certificado").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    ]);

  const termino = filtros.q.trim().toLowerCase();
  const pasaFiltros = (c: CertificadoConEmpleado) =>
    (!filtros.tipo || c.tipoId === filtros.tipo) &&
    (!filtros.departamento || c.departamentoId === filtros.departamento) &&
    (!filtros.puesto || c.puestoId === filtros.puesto) &&
    (!termino ||
      c.empleadoNombre.toLowerCase().includes(termino) ||
      c.empleadoIdInterno.toLowerCase().includes(termino));

  const filtrados = certificados.filter(pasaFiltros);
  const porFecha = (a: CertificadoConEmpleado, b: CertificadoConEmpleado) =>
    (a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999);

  return {
    // Vencidos primero, del más antiguo al más reciente: lo más urgente arriba.
    vencidos: filtrados.filter((c) => c.estado === "vencido").sort(porFecha),
    porVencer: filtrados
      .filter((c) => c.estado === "vence_hoy" || c.estado === "por_vencer")
      .sort(porFecha),
    vigentes: filtrados
      .filter((c) => c.estado === "vigente" || c.estado === "sin_vencimiento")
      .sort(porFecha),
    faltantes: faltantes.filter(
      (f) =>
        (!filtros.tipo || f.tipoId === filtros.tipo) &&
        (!termino ||
          f.empleadoNombre.toLowerCase().includes(termino) ||
          f.empleadoIdInterno.toLowerCase().includes(termino)),
    ),
    tipos: tipos ?? [],
    departamentos: departamentos ?? [],
    puestos: puestos ?? [],
    filtros,
    hayAlgunCertificado: certificados.length > 0,
  };
}

export default function Certificados({ loaderData }: Route.ComponentProps) {
  const { vencidos, porVencer, vigentes, faltantes, tipos, departamentos, puestos, filtros, hayAlgunCertificado } =
    loaderData;
  const [vigentesAbierto, setVigentesAbierto] = useState(false);

  const hayFiltros = Boolean(filtros.tipo || filtros.departamento || filtros.puesto || filtros.q);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Certificados</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Qué está vencido, qué está por vencer y qué falta cargar.
        </p>
      </div>

      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="text-sm font-medium" htmlFor="q">
            Empleado
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filtros.q}
            placeholder="Nombre o ID interno"
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          />
        </div>
        <Selector label="Tipo" name="tipo" valor={filtros.tipo} opciones={tipos} />
        <Selector label="Departamento" name="departamento" valor={filtros.departamento} opciones={departamentos} />
        <Selector label="Puesto" name="puesto" valor={filtros.puesto} opciones={puestos} />
        <button type="submit" className="rounded-md border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium">
          Filtrar
        </button>
        {hayFiltros && (
          <a href="/certificados" className="py-1.5 text-sm text-[var(--color-text-muted)] underline">
            Limpiar
          </a>
        )}
      </Form>

      {!hayAlgunCertificado && faltantes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Todavía no cargaste certificados. Se cargan desde el perfil de cada empleado, en la pestaña
            Certificados.
          </p>
          <Link
            to="/empleados"
            className="mt-4 inline-block rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]"
          >
            Ir a Empleados
          </Link>
        </div>
      ) : (
        <>
          <Bloque
            id="vencidos"
            titulo="Vencidos"
            cantidad={vencidos.length}
            tono="danger"
            vacio="Ningún certificado vencido."
          >
            {vencidos.map((c) => (
              <FilaCertificado key={c.id} c={c} />
            ))}
          </Bloque>

          <Bloque
            id="por-vencer"
            titulo="Por vencer"
            cantidad={porVencer.length}
            tono="warning"
            vacio="Ningún certificado por vencer en el plazo configurado."
          >
            {porVencer.map((c) => (
              <FilaCertificado key={c.id} c={c} />
            ))}
          </Bloque>

          {faltantes.length > 0 && (
            <Bloque
              id="faltantes"
              titulo="Obligatorios sin cargar"
              cantidad={faltantes.length}
              tono="danger"
              vacio=""
              descripcion="El puesto de estos empleados exige un certificado que todavía no está registrado."
            >
              {faltantes.map((f) => (
                <li
                  key={`${f.empleadoId}-${f.tipoId}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3 last:border-0"
                >
                  <div>
                    <Link to={`/empleados/${f.empleadoId}`} className="text-sm font-medium text-[var(--color-primary)]">
                      {f.empleadoNombre}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {f.empleadoIdInterno} · {f.puestoNombre}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{f.tipoNombre}</span>
                    <Link
                      to={`/empleados/${f.empleadoId}/certificados/nuevo`}
                      className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-medium"
                    >
                      Cargar
                    </Link>
                  </div>
                </li>
              ))}
            </Bloque>
          )}

          {/* Plegado por defecto: lo que está bien no necesita ocupar pantalla. */}
          <div className="rounded-lg border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setVigentesAbierto((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              aria-expanded={vigentesAbierto}
            >
              <span className="font-medium text-[var(--color-text)]">Vigentes ({vigentes.length})</span>
              <span aria-hidden className="text-[var(--color-text-muted)]">
                {vigentesAbierto ? "−" : "+"}
              </span>
            </button>
            {vigentesAbierto && (
              <ul className="border-t border-[var(--color-border)]">
                {vigentes.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-[var(--color-text-muted)]">Ninguno.</li>
                ) : (
                  vigentes.map((c) => <FilaCertificado key={c.id} c={c} />)
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Bloque({
  id,
  titulo,
  cantidad,
  tono,
  vacio,
  descripcion,
  children,
}: {
  // Ancla para que las tarjetas del panel caigan directo en el bloque.
  id?: string;
  titulo: string;
  cantidad: number;
  tono: "danger" | "warning";
  vacio: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  const color = tono === "danger" ? "var(--color-danger)" : "var(--color-warning)";
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-[var(--color-border)]">
      <header
        className="flex flex-col gap-0.5 border-b border-[var(--color-border)] px-4 py-3"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <h2 className="font-medium" style={{ color }}>
          {titulo} ({cantidad})
        </h2>
        {descripcion && <p className="text-xs text-[var(--color-text-muted)]">{descripcion}</p>}
      </header>
      {cantidad === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{vacio}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  );
}

function FilaCertificado({ c }: { c: CertificadoConEmpleado }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3 last:border-0">
      <div>
        <Link to={`/empleados/${c.empleado_id}?tab=certificados`} className="text-sm font-medium text-[var(--color-primary)]">
          {c.empleadoNombre}
        </Link>
        <p className="text-xs text-[var(--color-text-muted)]">
          {c.empleadoIdInterno} · {c.tipoNombre}
          {c.numero && ` · N.° ${c.numero}`}
        </p>
      </div>
      <EstadoCert estado={c.estado} diasRestantes={c.dias_restantes} />
    </li>
  );
}

function Selector({
  label,
  name,
  valor,
  opciones,
}: {
  label: string;
  name: string;
  valor: string;
  opciones: { id: string; nombre: string }[];
}) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={valor}
        className="mt-1 block rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
