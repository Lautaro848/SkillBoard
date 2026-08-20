import { Form } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import {
  aptitudSchema,
  catalogoNombreSchema,
  puestoSchema,
  tipoCertificadoSchema,
} from "~/lib/validation/catalogos";
import type { Route } from "./+types/catalogos";

const TIPOS = ["departamentos", "puestos", "aptitudes", "tipos_certificado"] as const;
type Tipo = (typeof TIPOS)[number];

const ETIQUETAS: Record<Tipo, string> = {
  departamentos: "Departamentos",
  puestos: "Puestos",
  aptitudes: "Aptitudes",
  tipos_certificado: "Tipos de certificado",
};

function tipoValido(valor: string | null): Tipo {
  return TIPOS.includes(valor as Tipo) ? (valor as Tipo) : "departamentos";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context);
  const tipo = tipoValido(new URL(request.url).searchParams.get("tipo"));

  const [{ data: items }, { data: departamentos }] = await Promise.all([
    supabase.from(tipo).select("*").order("nombre"),
    tipo === "puestos" ? supabase.from("departamentos").select("id, nombre").order("nombre") : Promise.resolve({ data: [] }),
  ]);

  return { tipo, items: items ?? [], departamentos: departamentos ?? [] };
}

// Cuenta cuántos empleados (o certificados) dependen de la fila antes de dejar
// borrarla, con el mensaje que enseña que pide 03-modulos-y-alcance.md.
async function contarUsos(
  supabase: ReturnType<typeof createSupabaseServerClient>["supabase"],
  tipo: Tipo,
  id: string,
) {
  switch (tipo) {
    case "departamentos": {
      const { count } = await supabase
        .from("empleados")
        .select("*", { count: "exact", head: true })
        .eq("departamento_id", id)
        .is("eliminado_en", null);
      return count ?? 0;
    }
    case "puestos": {
      const { count } = await supabase
        .from("empleados")
        .select("*", { count: "exact", head: true })
        .eq("puesto_id", id)
        .is("eliminado_en", null);
      return count ?? 0;
    }
    case "aptitudes": {
      const { count } = await supabase
        .from("empleado_aptitudes")
        .select("*", { count: "exact", head: true })
        .eq("aptitud_id", id);
      return count ?? 0;
    }
    case "tipos_certificado": {
      const { count } = await supabase
        .from("certificados")
        .select("*", { count: "exact", head: true })
        .eq("tipo_id", id)
        .is("eliminado_en", null);
      return count ?? 0;
    }
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request, context);
  const formData = await request.formData();
  const tipo = tipoValido(formData.get("tipo") as string);
  const intent = formData.get("intent");

  if (intent === "eliminar") {
    const id = formData.get("id") as string;
    const usos = await contarUsos(supabase, tipo, id);
    if (usos > 0) {
      const sustantivo = tipo === "aptitudes" ? "empleados con esta aptitud cargada" : tipo === "tipos_certificado" ? "certificados cargados" : "empleados";
      return {
        error: `Está asignado a ${usos} ${sustantivo}. Reasignalos antes de eliminarlo.`,
      };
    }
    await supabase.from(tipo).delete().eq("id", id);
    return { ok: true };
  }

  const raw = Object.fromEntries(formData);
  const schema =
    tipo === "puestos"
      ? puestoSchema
      : tipo === "aptitudes"
        ? aptitudSchema
        : tipo === "tipos_certificado"
          ? tipoCertificadoSchema
          : catalogoNombreSchema;

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: Object.values(parsed.error.flatten().fieldErrors)[0]?.[0] ?? "Datos inválidos" };
  }

  const columnas: Record<string, unknown> = { nombre: parsed.data.nombre };
  if ("departamentoId" in parsed.data && parsed.data.departamentoId) {
    columnas.departamento_id = parsed.data.departamentoId;
  }
  if ("categoria" in parsed.data) columnas.categoria = parsed.data.categoria;
  if ("requiereVencimiento" in parsed.data) columnas.requiere_vencimiento = parsed.data.requiereVencimiento;
  if ("diasAlerta" in parsed.data) columnas.dias_alerta = parsed.data.diasAlerta;

  const { error } = await supabase.from(tipo).insert(columnas);
  if (error) {
    const duplicado = error.message.includes("duplicate") || error.code === "23505";
    return { error: duplicado ? "Ya existe un elemento con ese nombre." : "No se pudo guardar." };
  }
  return { ok: true };
}

export default function Catalogos({ loaderData, actionData }: Route.ComponentProps) {
  const { tipo, items, departamentos } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Catálogos</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Puestos, departamentos, aptitudes y tipos de certificado que usa toda la empresa.
        </p>
      </div>

      <nav className="flex gap-1 border-b border-[var(--color-border)]">
        {TIPOS.map((t) => (
          <a
            key={t}
            href={`?tipo=${t}`}
            className={`px-3 py-2 text-sm ${
              t === tipo
                ? "border-b-2 border-[var(--color-primary)] font-medium text-[var(--color-primary)]"
                : "text-[var(--color-text-muted)]"
            }`}
          >
            {ETIQUETAS[t]}
          </a>
        ))}
      </nav>

      {actionData?.error && (
        <p className="rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-sm text-[var(--color-danger)]">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] p-4">
        <input type="hidden" name="tipo" value={tipo} />
        <div>
          <label className="text-sm font-medium" htmlFor="nombre">
            Nombre *
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            className="mt-1 block rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          />
        </div>

        {tipo === "puestos" && (
          <div>
            <label className="text-sm font-medium" htmlFor="departamentoId">
              Departamento
            </label>
            <select
              id="departamentoId"
              name="departamentoId"
              className="mt-1 block rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
            >
              <option value="">Sin asignar</option>
              {departamentos.map((d: { id: string; nombre: string }) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {tipo === "aptitudes" && (
          <div>
            <label className="text-sm font-medium" htmlFor="categoria">
              Categoría *
            </label>
            <select
              id="categoria"
              name="categoria"
              required
              className="mt-1 block rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
            >
              <option value="tecnica">Técnica</option>
              <option value="operativa">Operativa</option>
              <option value="administrativa">Administrativa</option>
              <option value="blanda">Blanda</option>
            </select>
          </div>
        )}

        {tipo === "tipos_certificado" && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requiereVencimiento" value="true" defaultChecked />
              Vence
            </label>
            <div>
              <label className="text-sm font-medium" htmlFor="diasAlerta">
                Días de alerta
              </label>
              <input
                id="diasAlerta"
                name="diasAlerta"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
                className="mt-1 block w-24 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          className="rounded-md bg-[var(--color-primary)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary-contrast)]"
        >
          Agregar
        </button>
      </Form>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]">
          Todavía no cargaste {ETIQUETAS[tipo].toLowerCase()}.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {items.map((item: { id: string; nombre: string }) => (
            <li key={item.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>{item.nombre}</span>
              <Form method="post">
                <input type="hidden" name="tipo" value={tipo} />
                <input type="hidden" name="intent" value="eliminar" />
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="text-[var(--color-text-muted)] underline">
                  Eliminar
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
