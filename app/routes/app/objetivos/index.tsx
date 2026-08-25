import { useState } from "react";
import { Form, useFetcher } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { cargarObjetivos } from "~/lib/objetivos.server";
import { formatearFecha, formatearValor, type ObjetivoCalculado } from "~/lib/cumplimiento";
import {
  ETIQUETAS_PERIODICIDAD,
  ETIQUETAS_PESO,
  ETIQUETAS_UNIDAD,
  medicionSchema,
  objetivoSchema,
} from "~/lib/validation/objetivos";
import type { Route } from "./+types/index";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const verCerrados = new URL(request.url).searchParams.get("cerrados") === "1";
  const { indice, medicionesPorObjetivo } = await cargarObjetivos(supabase, empresaId, !verCerrados);

  return {
    objetivos: indice.objetivos,
    mediciones: Object.fromEntries(medicionesPorObjetivo),
    verCerrados,
  };
}

interface Errores {
  _form?: string[];
  [campo: string]: string[] | undefined;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId, userId } = await requireSesion(request, context);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "medir") {
    const parsed = medicionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { errores: parsed.error.flatten().fieldErrors as Errores };
    }
    // Cada medición es una fila nueva: nunca se sobrescribe, para que el
    // gráfico de evolución tenga historia real (02-modelo-de-datos.md).
    const { error } = await supabase.from("objetivo_mediciones").insert({
      empresa_id: empresaId,
      objetivo_id: parsed.data.objetivoId,
      fecha: parsed.data.fecha.toISOString().slice(0, 10),
      valor: parsed.data.valor,
      nota: parsed.data.nota || null,
      cargado_por: userId,
    });
    if (error) return { errores: { _form: ["No pudimos guardar la medición."] } as Errores };
    return { ok: true };
  }

  if (intent === "cerrar") {
    await supabase
      .from("objetivos")
      .update({ estado: "cerrado" })
      .eq("id", formData.get("objetivoId") as string)
      .eq("empresa_id", empresaId);
    return { ok: true };
  }

  const raw = Object.fromEntries(formData);
  const parsed = objetivoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errores: parsed.error.flatten().fieldErrors as Errores,
      valores: raw as Record<string, string>,
    };
  }

  const { error } = await supabase.from("objetivos").insert({
    empresa_id: empresaId,
    nombre: parsed.data.nombre,
    descripcion: parsed.data.descripcion || null,
    periodicidad: parsed.data.periodicidad,
    periodo_inicio: parsed.data.periodoInicio.toISOString().slice(0, 10),
    periodo_fin: parsed.data.periodoFin.toISOString().slice(0, 10),
    unidad: parsed.data.unidad,
    valor_inicial: parsed.data.valorInicial,
    valor_objetivo: parsed.data.valorObjetivo,
    direccion: parsed.data.direccion,
    peso: parsed.data.peso,
    responsable_id: userId,
  });

  if (error) {
    return {
      errores: { _form: ["No pudimos guardar el objetivo."] } as Errores,
      valores: raw as Record<string, string>,
    };
  }
  return { ok: true };
}

export default function Objetivos({ loaderData, actionData }: Route.ComponentProps) {
  const { objetivos, mediciones, verCerrados } = loaderData;
  const [mostrandoForm, setMostrandoForm] = useState(false);
  const errores = actionData?.errores;

  // Los más atrasados primero: lo que necesita atención va arriba.
  const ordenados = [...objetivos].sort(
    (a, b) => (a.cumplimiento ?? 999) - (b.cumplimiento ?? 999),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-seccion font-semibold text-texto">Objetivos</h1>
          <p className="text-menor text-secundario">
            Lo que la empresa se propone medir. De acá sale el índice de cumplimiento del panel.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={verCerrados ? "/objetivos" : "/objetivos?cerrados=1"}
            className="boton boton-secundario"
          >
            {verCerrados ? "Ver solo activos" : "Ver todos"}
          </a>
          <button
            type="button"
            onClick={() => setMostrandoForm((v) => !v)}
            className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
          >
            {mostrandoForm ? "Cancelar" : "Nuevo objetivo"}
          </button>
        </div>
      </div>

      {errores?._form && (
        <p className="rounded-control border border-error/30 bg-error/5 p-3 text-menor text-error">
          {errores._form[0]}
        </p>
      )}

      {mostrandoForm && <FormularioObjetivo errores={errores} valores={actionData?.valores} />}

      {ordenados.length === 0 ? (
        <EstadoVacioObjetivos onCrear={() => setMostrandoForm(true)} />
      ) : (
        <ul className="flex flex-col gap-3">
          {ordenados.map((o) => (
            <TarjetaObjetivo key={o.id} o={o} mediciones={mediciones[o.id] ?? []} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Sin objetivos, el panel NO muestra un índice inventado ni gráficos de
// ejemplo: explica qué es un objetivo con casos concretos y ofrece crear el
// primero (03-modulos-y-alcance.md, módulo 5).
function EstadoVacioObjetivos({ onCrear }: { onCrear: () => void }) {
  return (
    <div className="rounded-tarjeta border border-dashed border-borde-decorativo p-8">
      <h2 className="font-medium text-texto">Todavía no definiste objetivos</h2>
      <p className="mt-1 text-menor text-secundario">
        Un objetivo es algo medible que la empresa se propone en un período: un número de partida, una meta y
        una fecha. SkillBoard no inventa métricas — mide lo que vos cargás.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          { t: "Reducir accidentes", d: "De 8 a 3 por trimestre" },
          { t: "Certificaciones al día", d: "Del 70% al 100% este mes" },
          { t: "Horas de capacitación", d: "De 0 a 120 horas en el año" },
        ].map((e) => (
          <div key={e.t} className="rounded-control border border-borde-decorativo p-3">
            <p className="text-menor font-medium">{e.t}</p>
            <p className="text-auxiliar text-secundario">{e.d}</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onCrear}
        className="mt-4 rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
      >
        Crear el primer objetivo
      </button>
    </div>
  );
}

function TarjetaObjetivo({ o, mediciones }: { o: ObjetivoCalculado; mediciones: { fecha: string; valor: number }[] }) {
  const [midiendo, setMidiendo] = useState(false);
  const fetcher = useFetcher();

  const pct = o.cumplimiento;
  const color =
    pct === null
      ? "var(--color-secundario)"
      : pct >= 90
        ? "var(--color-exito)"
        : pct >= 60
          ? "var(--color-advertencia)"
          : "var(--color-error)";

  return (
    <li className="rounded-tarjeta border border-borde-decorativo p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-texto">{o.nombre}</h3>
          <p className="text-auxiliar text-secundario">
            {ETIQUETAS_PERIODICIDAD[o.periodicidad ?? ""] ?? ""} · {formatearFecha(o.periodoInicio)} al{" "}
            {formatearFecha(o.periodoFin)} · Peso {o.peso}
          </p>
        </div>
        <div className="text-right">
          {pct === null ? (
            <span className="text-menor text-secundario">Sin medir</span>
          ) : (
            <>
              <span className="text-seccion font-semibold" style={{ color }}>
                {Math.round(pct)}
              </span>
              <span className="text-menor text-secundario">/100</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-auxiliar text-secundario">
          <span>
            {formatearValor(o.valorInicial, o.unidad)} →{" "}
            {o.valorActual !== null ? <strong>{formatearValor(o.valorActual, o.unidad)}</strong> : "sin medir"} →{" "}
            {formatearValor(o.valorObjetivo, o.unidad)}
          </span>
          <span>{Math.round(o.avanceEsperado * 100)}% del tiempo transcurrido</span>
        </div>
        {/* Dos barras: lo avanzado y, encima, la marca de dónde debería ir. */}
        <div className="relative mt-1 h-2 rounded-full bg-borde-decorativo">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.min(Math.max(o.avanceReal, 0), 1) * 100}%`, backgroundColor: color }}
          />
          <div
            className="absolute -inset-y-1 w-0.5 bg-texto"
            style={{ left: `${o.avanceEsperado * 100}%` }}
            title="Dónde debería ir hoy"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-auxiliar">
        <button
          type="button"
          onClick={() => setMidiendo((v) => !v)}
          className="boton boton-secundario"
        >
          {midiendo ? "Cancelar" : "Cargar medición"}
        </button>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="cerrar" />
          <input type="hidden" name="objetivoId" value={o.id} />
          <button type="submit" className="text-secundario underline">
            Cerrar objetivo
          </button>
        </fetcher.Form>
        {mediciones.length > 0 && (
          <span className="text-secundario">
            {mediciones.length} {mediciones.length === 1 ? "medición" : "mediciones"} · última el{" "}
            {formatearFecha(mediciones[mediciones.length - 1].fecha)}
          </span>
        )}
      </div>

      {midiendo && (
        <Form method="post" className="mt-3 flex flex-wrap items-end gap-3 rounded-control bg-fondo p-3">
          <input type="hidden" name="intent" value="medir" />
          <input type="hidden" name="objetivoId" value={o.id} />
          <div>
            <label className="text-auxiliar font-medium" htmlFor={`valor-${o.id}`}>
              Valor actual
            </label>
            <input
              id={`valor-${o.id}`}
              name="valor"
              type="number"
              step="any"
              required
              className="campo mt-1 w-32"
            />
          </div>
          <div>
            <label className="text-auxiliar font-medium" htmlFor={`fecha-${o.id}`}>
              Fecha
            </label>
            <input
              id={`fecha-${o.id}`}
              name="fecha"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="campo mt-1"
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="text-auxiliar font-medium" htmlFor={`nota-${o.id}`}>
              Nota
            </label>
            <input
              id={`nota-${o.id}`}
              name="nota"
              className="campo mt-1"
            />
          </div>
          <button
            type="submit"
            className="rounded-control bg-primario px-3 py-1.5 text-menor font-medium text-white"
          >
            Guardar
          </button>
        </Form>
      )}
    </li>
  );
}

function FormularioObjetivo({
  errores,
  valores = {},
}: {
  errores?: Errores;
  valores?: Record<string, string>;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const enTresMeses = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  return (
    <Form method="post" className="flex flex-col gap-4 rounded-tarjeta border border-borde-decorativo p-4" noValidate>
      <p className="text-auxiliar text-secundario">
        Los campos marcados con <span aria-hidden>*</span> son obligatorios.
      </p>

      <Campo label="Nombre" name="nombre" required defaultValue={valores.nombre} errores={errores?.nombre} />
      <Campo label="Descripción" name="descripcion" defaultValue={valores.descripcion} errores={errores?.descripcion} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Selector label="Periodicidad" name="periodicidad" opciones={ETIQUETAS_PERIODICIDAD} defaultValue={valores.periodicidad ?? "mensual"} />
        <Campo label="Desde" name="periodoInicio" type="date" required defaultValue={valores.periodoInicio ?? hoy} errores={errores?.periodoInicio} />
        <Campo label="Hasta" name="periodoFin" type="date" required defaultValue={valores.periodoFin ?? enTresMeses} errores={errores?.periodoFin} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Selector label="Unidad" name="unidad" opciones={ETIQUETAS_UNIDAD} defaultValue={valores.unidad ?? "cantidad"} />
        <Campo label="Valor inicial" name="valorInicial" type="number" required defaultValue={valores.valorInicial ?? "0"} errores={errores?.valorInicial} />
        <Campo label="Meta" name="valorObjetivo" type="number" required defaultValue={valores.valorObjetivo} errores={errores?.valorObjetivo} />
        <Selector
          label="Dirección"
          name="direccion"
          opciones={{ aumentar: "Aumentar", disminuir: "Disminuir" }}
          defaultValue={valores.direccion ?? "aumentar"}
        />
      </div>

      <div className="max-w-xs">
        <Selector
          label="Importancia"
          name="peso"
          opciones={ETIQUETAS_PESO}
          defaultValue={valores.peso ?? "3"}
        />
        <p className="mt-1 text-auxiliar text-secundario">
          Pondera cuánto influye este objetivo en el índice general.
        </p>
      </div>

      <button
        type="submit"
        className="w-fit rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
      >
        Crear objetivo
      </button>
    </Form>
  );
}

function Campo({
  label,
  name,
  type = "text",
  defaultValue,
  errores,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  errores?: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-menor font-medium" htmlFor={name}>
        {label} {required && "*"}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        required={required}
        defaultValue={defaultValue}
        className="campo mt-1"
      />
      {errores?.[0] && <p className="mt-1 text-auxiliar text-error">{errores[0]}</p>}
    </div>
  );
}

function Selector({
  label,
  name,
  opciones,
  defaultValue,
}: {
  label: string;
  name: string;
  opciones: Record<string | number, string>;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="text-menor font-medium" htmlFor={name}>
        {label} *
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="campo mt-1"
      >
        {Object.entries(opciones).map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
