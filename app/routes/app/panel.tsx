import { data, Form, Link } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { cargarCertificados } from "~/lib/certificados.server";
import { cargarObjetivosBase } from "~/lib/objetivos.server";
import { BarrasHorizontales, type DatoBarra } from "~/components/barras";
import {
  compararConAnterior,
  formatearFecha,
  formatearValor,
  indiceAlCorte,
  objetivoEnRango,
  type ObjetivoCalculado,
} from "~/lib/cumplimiento";
import {
  corteDe,
  esClavePeriodo,
  ETIQUETAS_PERIODO,
  rangoPeriodo,
  type ClavePeriodo,
} from "~/lib/periodos";
import type { Route } from "./+types/panel";

const COOKIE_PERIODO = "sb_panel_periodo";
const DIAS_AVISO = 30;

function leerCookie(request: Request, nombre: string): string | null {
  const crudo = request.headers.get("Cookie") ?? "";
  for (const parte of crudo.split(";")) {
    const [clave, ...resto] = parte.trim().split("=");
    if (clave === nombre) return decodeURIComponent(resto.join("="));
  }
  return null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  // El período elegido se recuerda entre sesiones: quien mira el trimestre no
  // tiene que volver a elegirlo cada vez que entra.
  const pedido = new URL(request.url).searchParams.get("periodo");
  const guardado = leerCookie(request, COOKIE_PERIODO);
  const periodo: ClavePeriodo = esClavePeriodo(pedido)
    ? pedido
    : esClavePeriodo(guardado)
      ? guardado
      : "mes";

  const headers = new Headers();
  if (esClavePeriodo(pedido) && pedido !== guardado) {
    headers.append(
      "Set-Cookie",
      `${COOKIE_PERIODO}=${periodo}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`,
    );
  }

  const hoy = new Date();
  const actual = rangoPeriodo(periodo, hoy, 0);
  const anterior = rangoPeriodo(periodo, hoy, -1);

  const [{ data: empleados }, { data: departamentos }, certs, objetivos] = await Promise.all([
    supabase
      .from("empleados")
      .select("id, estado, departamento_id")
      .eq("empresa_id", empresaId)
      .is("eliminado_en", null),
    supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    cargarCertificados(supabase, empresaId),
    // Sin filtrar por estado: un objetivo cerrado dentro del período mirado
    // igual formó parte de ese período.
    cargarObjetivosBase(supabase, empresaId, false),
  ]);

  const activos = (empleados ?? []).filter((e) => e.estado === "activo");

  const nombrePorDepartamento = new Map((departamentos ?? []).map((d) => [d.id as string, d.nombre as string]));
  const conteoPorDepartamento = new Map<string, number>();
  for (const e of activos) {
    const clave = e.departamento_id ?? "";
    conteoPorDepartamento.set(clave, (conteoPorDepartamento.get(clave) ?? 0) + 1);
  }
  const distribucion: DatoBarra[] = [...conteoPorDepartamento.entries()]
    .map(([id, valor]) => ({
      clave: id || "sin-departamento",
      etiqueta: id ? (nombrePorDepartamento.get(id) ?? "Departamento eliminado") : "Sin departamento",
      valor,
      href: id ? `/empleados?estado=activo&departamento=${id}` : undefined,
    }))
    .sort((a, b) => b.valor - a.valor);

  const vencidos = certs.certificados.filter((c) => c.estado === "vencido");
  const porVencer = certs.certificados.filter(
    (c) => c.dias_restantes !== null && c.dias_restantes >= 0 && c.dias_restantes <= DIAS_AVISO,
  );

  // El índice del período anterior se reconstruye con las mediciones que
  // existían al cierre de ese período, no con las de hoy. Si no había
  // ninguna, queda en null y el panel lo dice en lugar de inventarlo.
  const enActual = objetivos.base.filter((o) => objetivoEnRango(o, actual.inicio, actual.fin));
  const enAnterior = objetivos.base.filter((o) => objetivoEnRango(o, anterior.inicio, anterior.fin));

  const indice = indiceAlCorte(enActual, objetivos.medicionesPorObjetivo, corteDe(actual, hoy));
  const indiceAnterior = indiceAlCorte(enAnterior, objetivos.medicionesPorObjetivo, anterior.fin);

  return data(
    {
      periodo,
      etiquetaPeriodo: actual.etiqueta,
      etiquetaAnterior: anterior.etiqueta,
      totales: {
        empleadosActivos: activos.length,
        certificadosVencidos: vencidos.length,
        certificadosPorVencer: porVencer.length,
        obligatoriosFaltantes: certs.faltantes.length,
      },
      distribucion,
      indice: indice.indice,
      medibles: indice.medibles,
      // Los más atrasados primero: lo que necesita atención va arriba.
      objetivos: [...indice.objetivos].sort((a, b) => (a.cumplimiento ?? 999) - (b.cumplimiento ?? 999)),
      comparacion: compararConAnterior(indice.indice, indiceAnterior.indice),
      hayEmpleados: (empleados ?? []).length > 0,
    },
    { headers },
  );
}

export default function Panel({ loaderData }: Route.ComponentProps) {
  const {
    periodo,
    etiquetaPeriodo,
    etiquetaAnterior,
    totales,
    distribucion,
    indice,
    medibles,
    objetivos,
    comparacion,
    hayEmpleados,
  } = loaderData;

  if (!hayEmpleados) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Todavía no cargaste empleados</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-text-muted)]">
          El panel se arma con lo que cargues: mientras no haya gente, no hay nada real que mostrar acá.
          Podés sumarlos de a uno o importar una planilla.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            to="/empleados/nuevo"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]"
          >
            Cargar el primer empleado
          </Link>
          <Link
            to="/empleados/importar"
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            Importar planilla
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Panel</h1>
          <p className="text-sm text-[var(--color-text-muted)] first-letter:uppercase">{etiquetaPeriodo}</p>
        </div>
        {/* Los filtros van en una sola fila arriba de los gráficos. */}
        <Form method="get" className="flex items-end gap-2">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)]" htmlFor="periodo">
              Período
            </label>
            <select
              id="periodo"
              name="periodo"
              defaultValue={periodo}
              className="mt-1 block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
            >
              {Object.entries(ETIQUETAS_PERIODO).map(([clave, etiqueta]) => (
                <option key={clave} value={clave}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium"
          >
            Aplicar
          </button>
        </Form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta
          titulo="Empleados activos"
          valor={totales.empleadosActivos}
          to="/empleados?estado=activo"
          detalle="En actividad hoy"
        />
        <Tarjeta
          titulo="Certificados vencidos"
          valor={totales.certificadosVencidos}
          to="/certificados#vencidos"
          detalle="Ya pasaron su fecha de vencimiento"
          tono={totales.certificadosVencidos > 0 ? "danger" : "neutro"}
        />
        <Tarjeta
          titulo={`Vencen en ${DIAS_AVISO} días`}
          valor={totales.certificadosPorVencer}
          to="/certificados#por-vencer"
          detalle="Todavía hay tiempo de renovarlos"
          tono={totales.certificadosPorVencer > 0 ? "warning" : "neutro"}
        />
        <Tarjeta
          titulo="Obligatorios sin cargar"
          valor={totales.obligatoriosFaltantes}
          to="/certificados#faltantes"
          detalle="El puesto los exige y no están registrados"
          tono={totales.obligatoriosFaltantes > 0 ? "danger" : "neutro"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Indice
          indice={indice}
          medibles={medibles}
          comparacion={comparacion}
          etiquetaAnterior={etiquetaAnterior}
          hayObjetivos={objetivos.length > 0}
        />

        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Empleados activos por departamento</h2>
          {distribucion.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              No hay empleados activos para distribuir.
            </p>
          ) : (
            <div className="mt-4">
              <BarrasHorizontales datos={distribucion} sufijo="empleados activos" />
            </div>
          )}
        </section>
      </div>

      {objetivos.length > 0 && (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Objetivos del período</h2>
            <Link to="/objetivos" className="text-sm text-[var(--color-primary)] underline">
              Ver todos
            </Link>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Ordenados por lo que más atrasado está respecto del ritmo esperado.
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {objetivos.map((o) => (
              <FilaObjetivo key={o.id} o={o} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const TONOS = {
  neutro: "var(--color-text)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
} as const;

function Tarjeta({
  titulo,
  valor,
  to,
  detalle,
  tono = "neutro",
}: {
  titulo: string;
  valor: number;
  to: string;
  detalle: string;
  tono?: keyof typeof TONOS;
}) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-primary)]"
    >
      <p className="text-sm text-[var(--color-text-muted)]">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: TONOS[tono] }}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{detalle}</p>
    </Link>
  );
}

function Indice({
  indice,
  medibles,
  comparacion,
  etiquetaAnterior,
  hayObjetivos,
}: {
  indice: number | null;
  medibles: number;
  comparacion: { texto: string; direccion: "sube" | "baja" | "igual" | "sin_dato" };
  etiquetaAnterior: string;
  hayObjetivos: boolean;
}) {
  // Sin objetivos medidos no hay índice. No se muestra un número de relleno
  // ni un gráfico de ejemplo: se explica qué falta para que exista.
  if (indice === null) {
    return (
      <section className="rounded-lg border border-dashed border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Índice de cumplimiento</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          {hayObjetivos
            ? "Hay objetivos cargados en este período, pero ninguno tiene mediciones todavía. El índice aparece cuando cargues el primer valor."
            : "Todavía no hay objetivos en este período. El índice compara lo que la empresa se propuso contra el ritmo al que va, así que necesita al menos un objetivo con mediciones."}
        </p>
        <Link
          to="/objetivos"
          className="mt-4 inline-block rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]"
        >
          {hayObjetivos ? "Cargar una medición" : "Crear un objetivo"}
        </Link>
      </section>
    );
  }

  const color = indice >= 90 ? "var(--color-success)" : indice >= 60 ? "var(--color-warning)" : "var(--color-danger)";
  const estado = indice >= 90 ? "Al ritmo previsto" : indice >= 60 ? "Algo por debajo del ritmo" : "Por debajo del ritmo";
  const FLECHAS = { sube: "↑", baja: "↓", igual: "=", sin_dato: "" } as const;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">Índice de cumplimiento</h2>
      {/* Figura protagonista: el número es el gráfico. */}
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-6xl font-semibold tabular-nums leading-none" style={{ color }}>
          {indice}
        </span>
        <span className="text-lg text-[var(--color-text-muted)]">/100</span>
      </p>
      <p className="mt-2 text-sm font-medium" style={{ color }}>
        {estado}
      </p>
      {/* La flecha nunca va sola: siempre con el texto que dice cuánto cambió. */}
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {comparacion.direccion !== "sin_dato" && (
          <span aria-hidden className="mr-1">
            {FLECHAS[comparacion.direccion]}
          </span>
        )}
        {comparacion.texto}
        {comparacion.direccion !== "sin_dato" && ` (${etiquetaAnterior})`}
      </p>
      <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
        Promedio ponderado de {medibles} {medibles === 1 ? "objetivo medido" : "objetivos medidos"}. Compara el
        avance real contra el que correspondería al tiempo transcurrido; los objetivos sin mediciones quedan fuera
        en lugar de contar como cero.
      </p>
    </section>
  );
}

function FilaObjetivo({ o }: { o: ObjetivoCalculado }) {
  const pct = o.cumplimiento;
  const color =
    pct === null
      ? "var(--color-text-muted)"
      : pct >= 90
        ? "var(--color-success)"
        : pct >= 60
          ? "var(--color-warning)"
          : "var(--color-danger)";
  // El color nunca lleva solo el significado: siempre va con la etiqueta.
  const estado = pct === null ? "Sin medir" : pct >= 90 ? "Al día" : pct >= 60 ? "Atrasado" : "Muy atrasado";

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-text)]">{o.nombre}</span>
        <span className="text-sm" style={{ color }}>
          {estado}
          {pct !== null && <span className="ml-2 tabular-nums font-semibold">{Math.round(pct)}/100</span>}
        </span>
      </div>
      {/* Barra doble: lo avanzado y, encima, la marca de dónde debería ir hoy. */}
      <div
        className="relative mt-2 h-4 rounded-[4px] bg-[var(--color-dato-fondo)]"
        title={`${o.nombre}: ${formatearValor(o.valorInicial, o.unidad)} → ${
          o.valorActual !== null ? formatearValor(o.valorActual, o.unidad) : "sin medir"
        } → ${formatearValor(o.valorObjetivo, o.unidad)}. Debería ir por el ${Math.round(o.avanceEsperado * 100)}%.`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-r-[4px]"
          style={{ width: `${Math.min(Math.max(o.avanceReal, 0), 1) * 100}%`, backgroundColor: color }}
        />
        {/* Anillo de 2px contra la superficie para que la marca se lea encima. */}
        <div
          className="absolute inset-y-[-3px] w-0.5 bg-[var(--color-text)] ring-2 ring-[var(--color-surface)]"
          style={{ left: `${o.avanceEsperado * 100}%` }}
        />
      </div>
      <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[var(--color-text-muted)]">
        <span>
          {formatearValor(o.valorInicial, o.unidad)} →{" "}
          {o.valorActual !== null ? (
            <strong className="font-medium text-[var(--color-text)]">
              {formatearValor(o.valorActual, o.unidad)}
            </strong>
          ) : (
            "sin medir"
          )}{" "}
          → {formatearValor(o.valorObjetivo, o.unidad)}
        </span>
        <span>
          {Math.round(o.avanceEsperado * 100)}% del tiempo · hasta el {formatearFecha(o.periodoFin)}
        </span>
      </p>
    </li>
  );
}
