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
      <div className="rounded-tarjeta border border-dashed border-borde-decorativo p-8 text-center">
        <h1 className="text-tarjeta font-semibold text-texto">Todavía no cargaste empleados</h1>
        <p className="mx-auto mt-1 max-w-md text-menor text-secundario">
          El panel se arma con lo que cargues: mientras no haya gente, no hay nada real que mostrar acá.
          Podés sumarlos de a uno o importar una planilla.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            to="/empleados/nuevo"
            className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
          >
            Cargar el primer empleado
          </Link>
          <Link
            to="/empleados/importar"
            className="rounded-control border border-borde-decorativo px-4 py-2 text-menor font-medium"
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
          <h1 className="text-seccion font-semibold text-texto">Panel</h1>
          <p className="text-menor text-secundario first-letter:uppercase">{etiquetaPeriodo}</p>
        </div>
        {/* Los filtros van en una sola fila arriba de los gráficos. */}
        <Form method="get" className="flex items-end gap-2">
          <div>
            <label className="text-auxiliar font-medium text-secundario" htmlFor="periodo">
              Período
            </label>
            <select
              id="periodo"
              name="periodo"
              defaultValue={periodo}
              className="mt-1 block rounded-control border border-borde-decorativo bg-superficie px-3 py-1.5 text-menor"
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
            className="rounded-control border border-borde-decorativo px-4 py-1.5 text-menor font-medium"
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

        <section className="rounded-tarjeta border border-borde-decorativo bg-superficie p-5">
          <h2 className="text-menor font-semibold text-texto">Empleados activos por departamento</h2>
          {distribucion.length === 0 ? (
            <p className="mt-3 text-menor text-secundario">
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
        <section className="rounded-tarjeta border border-borde-decorativo bg-superficie p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-menor font-semibold text-texto">Objetivos del período</h2>
            <Link to="/objetivos" className="text-menor text-primario underline">
              Ver todos
            </Link>
          </div>
          <p className="mt-1 text-auxiliar text-secundario">
            Ordenados por lo que más atrasado está respecto del ritmo esperado. 100 es ir al ritmo previsto; la
            marca vertical en cada barra es dónde debería estar hoy.
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
  neutro: "var(--color-texto)",
  warning: "var(--color-advertencia)",
  danger: "var(--color-error)",
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
      className="block rounded-tarjeta border border-borde-decorativo bg-superficie p-4 hover:border-primario"
    >
      <p className="text-menor text-secundario">{titulo}</p>
      <p className="mt-1 text-pantalla font-semibold tabular-nums" style={{ color: TONOS[tono] }}>
        {valor}
      </p>
      <p className="mt-1 text-auxiliar text-secundario">{detalle}</p>
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
      <section className="rounded-tarjeta border border-dashed border-borde-decorativo p-5">
        <h2 className="text-menor font-semibold text-texto">Índice de cumplimiento</h2>
        <p className="mt-2 text-menor text-secundario">
          {hayObjetivos
            ? "Hay objetivos cargados en este período, pero ninguno tiene mediciones todavía. El índice aparece cuando cargues el primer valor."
            : "Todavía no hay objetivos en este período. El índice compara lo que la empresa se propuso contra el ritmo al que va, así que necesita al menos un objetivo con mediciones."}
        </p>
        <Link
          to="/objetivos"
          className="mt-4 inline-block rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
        >
          {hayObjetivos ? "Cargar una medición" : "Crear un objetivo"}
        </Link>
      </section>
    );
  }

  const color = indice >= 90 ? "var(--color-exito)" : indice >= 60 ? "var(--color-advertencia)" : "var(--color-error)";
  const estado = indice >= 90 ? "Al ritmo previsto" : indice >= 60 ? "Algo por debajo del ritmo" : "Por debajo del ritmo";
  const FLECHAS = { sube: "↑", baja: "↓", igual: "=", sin_dato: "" } as const;

  return (
    <section className="rounded-tarjeta border border-borde-decorativo bg-superficie p-5">
      <h2 className="text-menor font-semibold text-texto">Índice de cumplimiento</h2>
      {/* Figura protagonista: el número es el gráfico. Sin "/100": el índice
          puede pasarse de 100 cuando se va adelantado, así que esa escala
          mentiría. Qué significa 100 lo explica el pie de la tarjeta. */}
      <p className="mt-3">
        <span className="text-figura font-semibold tabular-nums leading-none" style={{ color }}>
          {indice}
        </span>
      </p>
      <p className="mt-2 text-menor font-medium" style={{ color }}>
        {estado}
      </p>
      {/* La flecha nunca va sola: siempre con el texto que dice cuánto cambió. */}
      <p className="mt-1 text-menor text-secundario">
        {comparacion.direccion !== "sin_dato" && (
          <span aria-hidden className="mr-1">
            {FLECHAS[comparacion.direccion]}
          </span>
        )}
        {comparacion.texto}
        {comparacion.direccion !== "sin_dato" && ` (${etiquetaAnterior})`}
      </p>
      <p className="mt-3 border-t border-borde-decorativo pt-3 text-auxiliar text-secundario">
        Promedio ponderado de {medibles} {medibles === 1 ? "objetivo medido" : "objetivos medidos"}. Compara el
        avance real contra el que correspondería al tiempo transcurrido: 100 es ir exactamente al ritmo previsto y
        se puede pasar de 100 si se va adelantado (se topea en 125). Los objetivos sin mediciones quedan fuera en
        lugar de contar como cero.
      </p>
    </section>
  );
}

function FilaObjetivo({ o }: { o: ObjetivoCalculado }) {
  const pct = o.cumplimiento;
  const color =
    pct === null
      ? "var(--color-secundario)"
      : pct >= 90
        ? "var(--color-exito)"
        : pct >= 60
          ? "var(--color-advertencia)"
          : "var(--color-error)";
  // El color nunca lleva solo el significado: siempre va con la etiqueta.
  const estado = pct === null ? "Sin medir" : pct >= 90 ? "Al día" : pct >= 60 ? "Atrasado" : "Muy atrasado";

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-menor font-medium text-texto">{o.nombre}</span>
        <span className="text-menor" style={{ color }}>
          {estado}
          {pct !== null && <span className="ml-2 tabular-nums font-semibold">{Math.round(pct)}</span>}
        </span>
      </div>
      {/* Barra doble: lo avanzado y, encima, la marca de dónde debería ir hoy. */}
      <div
        className="relative mt-2 h-4 rounded-dato bg-borde-decorativo"
        title={`${o.nombre}: ${formatearValor(o.valorInicial, o.unidad)} → ${
          o.valorActual !== null ? formatearValor(o.valorActual, o.unidad) : "sin medir"
        } → ${formatearValor(o.valorObjetivo, o.unidad)}. Debería ir por el ${Math.round(o.avanceEsperado * 100)}%.`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-r-dato"
          style={{ width: `${Math.min(Math.max(o.avanceReal, 0), 1) * 100}%`, backgroundColor: color }}
        />
        {/* Anillo de 2px contra la superficie para que la marca se lea encima. */}
        <div
          className="absolute -inset-y-1 w-0.5 bg-texto ring-2 ring-superficie"
          style={{ left: `${o.avanceEsperado * 100}%` }}
        />
      </div>
      <p className="mt-1 flex flex-wrap justify-between gap-2 text-auxiliar text-secundario">
        <span>
          {formatearValor(o.valorInicial, o.unidad)} →{" "}
          {o.valorActual !== null ? (
            <strong className="font-medium text-texto">
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
