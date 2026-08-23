import { useState } from "react";
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

  const [{ data: items }, { data: departamentos }, { data: puestos }] = await Promise.all([
    supabase.from(tipo).select("*").order("nombre"),
    tipo === "puestos" ? supabase.from("departamentos").select("id, nombre").order("nombre") : Promise.resolve({ data: [] }),
    // Los tipos de certificado necesitan la lista de puestos para poder
    // marcar cuáles lo exigen (obligatorio_para_puestos).
    tipo === "tipos_certificado"
      ? supabase.from("puestos").select("id, nombre").order("nombre")
      : Promise.resolve({ data: [] }),
  ]);

  return { tipo, items: items ?? [], departamentos: departamentos ?? [], puestos: puestos ?? [] };
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

  // Marca qué puestos exigen este tipo de certificado. De acá sale el bloque
  // "Obligatorios sin cargar" de /certificados: un certificado que nunca se
  // cargó no aparecería en ninguna lista sin esto.
  if (intent === "obligatoriedad") {
    const id = formData.get("id") as string;
    const puestosIds = formData.getAll("puestoObligatorio").map(String).filter(Boolean);
    const { error } = await supabase
      .from("tipos_certificado")
      .update({ obligatorio_para_puestos: puestosIds })
      .eq("id", id);
    if (error) return { error: "No se pudo guardar la obligatoriedad." };
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
  const { tipo, items, departamentos, puestos } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-seccion font-semibold text-texto">Catálogos</h1>
        <p className="text-menor text-secundario">
          Puestos, departamentos, aptitudes y tipos de certificado que usa toda la empresa.
        </p>
      </div>

      <nav className="flex flex-wrap items-center gap-1 border-b border-borde-decorativo">
        {TIPOS.map((t) => (
          <a
            key={t}
            href={`?tipo=${t}`}
            className={`px-3 py-2 text-menor ${
              t === tipo
                ? "border-b-2 border-primario font-medium text-primario"
                : "text-secundario"
            }`}
          >
            {ETIQUETAS[t]}
          </a>
        ))}
        <a href="/configuracion/reglas" className="ml-auto px-3 py-2 text-menor text-secundario">
          Reglas de Tukson →
        </a>
        <a href="/configuracion/avisos" className="px-3 py-2 text-menor text-secundario">
          Avisos de vencimiento →
        </a>
      </nav>

      {actionData?.error && (
        <p className="rounded-control border border-error/30 bg-error/5 p-3 text-menor text-error">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="flex flex-wrap items-end gap-3 rounded-tarjeta border border-borde-decorativo p-4">
        <input type="hidden" name="tipo" value={tipo} />
        <div>
          <label className="text-menor font-medium" htmlFor="nombre">
            Nombre *
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            className="mt-1 block rounded-control border border-borde-decorativo px-3 py-1.5 text-menor"
          />
        </div>

        {tipo === "puestos" && (
          <div>
            <label className="text-menor font-medium" htmlFor="departamentoId">
              Departamento
            </label>
            <select
              id="departamentoId"
              name="departamentoId"
              className="mt-1 block rounded-control border border-borde-decorativo px-3 py-1.5 text-menor"
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
            <label className="text-menor font-medium" htmlFor="categoria">
              Categoría *
            </label>
            <select
              id="categoria"
              name="categoria"
              required
              className="mt-1 block rounded-control border border-borde-decorativo px-3 py-1.5 text-menor"
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
            <label className="flex items-center gap-2 text-menor">
              <input type="checkbox" name="requiereVencimiento" value="true" defaultChecked />
              Vence
            </label>
            <div>
              <label className="text-menor font-medium" htmlFor="diasAlerta">
                Días de alerta
              </label>
              <input
                id="diasAlerta"
                name="diasAlerta"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
                className="mt-1 block w-24 rounded-control border border-borde-decorativo px-3 py-1.5 text-menor"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          className="rounded-control bg-primario px-4 py-1.5 text-menor font-medium text-white"
        >
          Agregar
        </button>
      </Form>

      {items.length === 0 ? (
        <p className="rounded-tarjeta border border-dashed border-borde-decorativo p-6 text-center text-menor text-secundario">
          Todavía no cargaste {ETIQUETAS[tipo].toLowerCase()}.
        </p>
      ) : (
        <ul className="divide-y divide-borde-decorativo rounded-tarjeta border border-borde-decorativo">
          {items.map((item: any) => (
            <li key={item.id} className="px-4 py-2 text-menor">
              <div className="flex items-center justify-between">
                <span>
                  {item.nombre}
                  {tipo === "tipos_certificado" && !item.requiere_vencimiento && (
                    <span className="ml-2 text-auxiliar text-secundario">(no vence)</span>
                  )}
                </span>
                <Form method="post">
                  <input type="hidden" name="tipo" value={tipo} />
                  <input type="hidden" name="intent" value="eliminar" />
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="text-secundario underline">
                    Eliminar
                  </button>
                </Form>
              </div>

              {tipo === "tipos_certificado" && puestos.length > 0 && (
                <Obligatoriedad item={item} puestos={puestos} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Los puestos marcados acá hacen que el certificado se exija a todo empleado
// con ese puesto, y que aparezca en "Obligatorios sin cargar" si falta.
function Obligatoriedad({
  item,
  puestos,
}: {
  item: { id: string; obligatorio_para_puestos?: string[] | null };
  puestos: { id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const marcados: string[] = item.obligatorio_para_puestos ?? [];

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-auxiliar text-secundario underline"
        aria-expanded={abierto}
      >
        Obligatorio para {marcados.length === 0 ? "ningún puesto" : `${marcados.length} puesto${marcados.length === 1 ? "" : "s"}`}
      </button>

      {abierto && (
        <Form method="post" className="mt-2 rounded-control bg-fondo p-3">
          <input type="hidden" name="tipo" value="tipos_certificado" />
          <input type="hidden" name="intent" value="obligatoriedad" />
          <input type="hidden" name="id" value={item.id} />
          <div className="flex flex-wrap gap-3">
            {puestos.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-auxiliar">
                <input
                  type="checkbox"
                  name="puestoObligatorio"
                  value={p.id}
                  defaultChecked={marcados.includes(p.id)}
                />
                {p.nombre}
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="mt-3 rounded-control bg-primario px-3 py-1 text-auxiliar font-medium text-white"
          >
            Guardar
          </button>
        </Form>
      )}
    </div>
  );
}
