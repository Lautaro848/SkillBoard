import { useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { Avatar } from "~/components/avatar";
import { urlFirmada } from "~/lib/storage.server";
import type { Route } from "./+types/index";

const RANGOS_ANTIGUEDAD: Record<string, { desde?: string; hasta?: string }> = {
  "menos-1": { desde: haceAnios(1) },
  "1-3": { desde: haceAnios(3), hasta: haceAnios(1) },
  "3-5": { desde: haceAnios(5), hasta: haceAnios(3) },
  "5-10": { desde: haceAnios(10), hasta: haceAnios(5) },
  "mas-10": { hasta: haceAnios(10) },
};

function haceAnios(n: number): string {
  const fecha = new Date();
  fecha.setFullYear(fecha.getFullYear() - n);
  return fecha.toISOString().slice(0, 10);
}

function antiguedad(fechaIngreso: string): string {
  const dias = Math.floor((Date.now() - new Date(fechaIngreso).getTime()) / 86_400_000);
  const anios = Math.floor(dias / 365.25);
  if (anios < 1) return "Menos de 1 año";
  return `${anios} ${anios === 1 ? "año" : "años"}`;
}

const PEOR: Record<string, number> = { vencido: 3, por_vencer: 2, vence_hoy: 2, vigente: 1, sin_vencimiento: 1 };

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const url = new URL(request.url);
  const params = url.searchParams;

  const q = params.get("q") ?? "";
  const puesto = params.get("puesto") ?? "";
  const departamento = params.get("departamento") ?? "";
  const estado = params.get("estado") ?? "";
  const antiguedadFiltro = params.get("antiguedad") ?? "";
  const certificadosFiltro = params.get("certificados") ?? "";
  const porPagina = Number(params.get("porPagina") ?? 25);
  const pagina = Math.max(1, Number(params.get("pagina") ?? 1));

  let idsPorCertificado: string[] | null = null;
  if (certificadosFiltro) {
    const [{ data: empleadosIds }, { data: certs }] = await Promise.all([
      supabase.from("empleados").select("id").eq("empresa_id", empresaId).is("eliminado_en", null),
      supabase.from("v_certificados").select("empleado_id, estado").eq("empresa_id", empresaId),
    ]);
    const peorPorEmpleado = new Map<string, string>();
    for (const c of certs ?? []) {
      const actual = peorPorEmpleado.get(c.empleado_id);
      if (!actual || PEOR[c.estado] > PEOR[actual]) peorPorEmpleado.set(c.empleado_id, c.estado);
    }
    idsPorCertificado = (empleadosIds ?? [])
      .map((e) => e.id as string)
      .filter((id) => {
        const peor = peorPorEmpleado.get(id);
        if (certificadosFiltro === "sin_certificados") return !peor;
        if (certificadosFiltro === "vencido") return peor === "vencido";
        if (certificadosFiltro === "por_vencer") return peor === "por_vencer" || peor === "vence_hoy";
        if (certificadosFiltro === "vigente") return peor === "vigente" || peor === "sin_vencimiento";
        return true;
      });
  }

  let query = supabase
    .rpc("buscar_empleados", { p_termino: q }, { count: "exact" })
    .eq("empresa_id", empresaId);

  if (puesto) query = query.eq("puesto_id", puesto);
  if (departamento) query = query.eq("departamento_id", departamento);
  if (estado) query = query.eq("estado", estado);
  const rango = RANGOS_ANTIGUEDAD[antiguedadFiltro];
  if (rango?.desde) query = query.gte("fecha_ingreso", rango.desde);
  if (rango?.hasta) query = query.lt("fecha_ingreso", rango.hasta);
  if (idsPorCertificado) query = query.in("id", idsPorCertificado);

  const desde = (pagina - 1) * porPagina;
  const { data: empleados, count } = await query
    .order("apellido")
    .order("nombre")
    .range(desde, desde + porPagina - 1);

  const ids = (empleados ?? []).map((e: any) => e.id);
  const { data: certsPagina } = ids.length
    ? await supabase.from("v_certificados").select("empleado_id, estado").in("empleado_id", ids)
    : { data: [] };

  const indicadorPorEmpleado = new Map<string, string>();
  for (const id of ids) {
    const propios = (certsPagina ?? []).filter((c) => c.empleado_id === id);
    const vencidos = propios.filter((c) => c.estado === "vencido").length;
    const porVencer = propios.filter((c) => c.estado === "por_vencer" || c.estado === "vence_hoy").length;
    if (vencidos > 0) indicadorPorEmpleado.set(id, `${vencidos} vencido${vencidos === 1 ? "" : "s"}`);
    else if (porVencer > 0) indicadorPorEmpleado.set(id, `${porVencer} por vencer`);
    else if (propios.length > 0) indicadorPorEmpleado.set(id, "Vigentes");
    else indicadorPorEmpleado.set(id, "Sin certificados");
  }

  const empleadosConFoto = await Promise.all(
    (empleados ?? []).map(async (e: any) => ({
      ...e,
      fotoUrlFirmada: e.foto_url ? await urlFirmada(supabase, e.foto_url, 300) : null,
    })),
  );

  const [{ data: puestos }, { data: departamentos }] = await Promise.all([
    supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
  ]);

  return {
    empleados: empleadosConFoto,
    total: count ?? 0,
    indicadorPorEmpleado: Object.fromEntries(indicadorPorEmpleado),
    puestos: puestos ?? [],
    departamentos: departamentos ?? [],
    filtros: { q, puesto, departamento, estado, antiguedad: antiguedadFiltro, certificados: certificadosFiltro, porPagina, pagina },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const ids = (formData.get("ids") as string).split(",").filter(Boolean);

  if (intent === "bulk-departamento") {
    await supabase.from("empleados").update({ departamento_id: formData.get("valor") }).in("id", ids).eq("empresa_id", empresaId);
  } else if (intent === "bulk-estado") {
    await supabase.from("empleados").update({ estado: formData.get("valor") }).in("id", ids).eq("empresa_id", empresaId);
  }

  return { ok: true, cantidad: ids.length };
}

const ETIQUETAS_ANTIGUEDAD: Record<string, string> = {
  "menos-1": "Menos de 1 año",
  "1-3": "1 a 3 años",
  "3-5": "3 a 5 años",
  "5-10": "5 a 10 años",
  "mas-10": "Más de 10 años",
};
const ETIQUETAS_CERTIFICADOS: Record<string, string> = {
  vigente: "Todos vigentes",
  por_vencer: "Con alguno por vencer",
  vencido: "Con alguno vencido",
  sin_certificados: "Sin certificados",
};
const ETIQUETAS_ESTADO: Record<string, string> = { activo: "Activo", licencia: "Licencia", baja: "Baja" };

export default function Empleados({ loaderData }: Route.ComponentProps) {
  const { empleados, total, indicadorPorEmpleado, puestos, departamentos, filtros } = loaderData;
  const totalPaginas = Math.max(1, Math.ceil(total / filtros.porPagina));
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  function alternarSeleccion(id: string) {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  }

  function alternarTodos() {
    setSeleccion((actual) => (actual.size === empleados.length ? new Set() : new Set(empleados.map((e: any) => e.id))));
  }

  const empleadosSeleccionados = empleados.filter((e: any) => seleccion.has(e.id));

  const chips: { clave: string; texto: string }[] = [];
  if (filtros.puesto) chips.push({ clave: "puesto", texto: puestos.find((p: any) => p.id === filtros.puesto)?.nombre ?? "" });
  if (filtros.departamento) chips.push({ clave: "departamento", texto: departamentos.find((d: any) => d.id === filtros.departamento)?.nombre ?? "" });
  if (filtros.estado) chips.push({ clave: "estado", texto: ETIQUETAS_ESTADO[filtros.estado] });
  if (filtros.antiguedad) chips.push({ clave: "antiguedad", texto: ETIQUETAS_ANTIGUEDAD[filtros.antiguedad] });
  if (filtros.certificados) chips.push({ clave: "certificados", texto: ETIQUETAS_CERTIFICADOS[filtros.certificados] });

  function paramsActuales(): URLSearchParams {
    const params = new URLSearchParams();
    if (filtros.q) params.set("q", filtros.q);
    if (filtros.puesto) params.set("puesto", filtros.puesto);
    if (filtros.departamento) params.set("departamento", filtros.departamento);
    if (filtros.estado) params.set("estado", filtros.estado);
    if (filtros.antiguedad) params.set("antiguedad", filtros.antiguedad);
    if (filtros.certificados) params.set("certificados", filtros.certificados);
    if (filtros.porPagina !== 25) params.set("porPagina", String(filtros.porPagina));
    return params;
  }

  function quitarFiltro(clave: string) {
    const params = paramsActuales();
    params.delete(clave);
    return `?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* En celular el título y las acciones se apilan: uno al lado del otro
          los deja a los dos ilegibles. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-seccion font-semibold text-texto">Empleados</h1>
        <div className="flex flex-wrap gap-2">
          <Link to="/empleados/importar" className="boton boton-secundario">
            Importar planilla
          </Link>
          <Link to="/empleados/nuevo" className="boton boton-principal">
            Nuevo empleado
          </Link>
        </div>
      </div>

      {/* En celular seis filtros apilados son casi una pantalla entera antes
          de llegar al primer empleado, y la tarea principal en el teléfono es
          justamente consultar a alguien. Por eso se pliegan acá y quedan
          siempre visibles de tablet para arriba. */}
      <button
        type="button"
        onClick={() => setFiltrosAbiertos((v) => !v)}
        className="boton boton-secundario self-start sm:hidden"
        aria-expanded={filtrosAbiertos}
        aria-controls="filtros"
      >
        {filtrosAbiertos ? "Ocultar filtros" : "Filtros"}
        {chips.length > 0 && ` (${chips.length})`}
      </button>

      <Form
        method="get"
        id="filtros"
        className={`${filtrosAbiertos ? "grid" : "hidden"} grid-cols-1 items-end gap-3 sm:grid sm:grid-cols-2 lg:flex lg:flex-wrap`}
      >
        <div className="lg:min-w-56 lg:flex-1">
          <label className="text-menor font-medium" htmlFor="q">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={filtros.q} placeholder="Nombre, apellido o ID interno" className="campo mt-1" />
        </div>
        <FiltroSelect label="Puesto" name="puesto" valor={filtros.puesto} opciones={puestos} />
        <FiltroSelect label="Departamento" name="departamento" valor={filtros.departamento} opciones={departamentos} />
        <div>
          <label className="text-menor font-medium" htmlFor="estado">
            Estado
          </label>
          <select id="estado" name="estado" defaultValue={filtros.estado} className="campo mt-1">
            <option value="">Todos</option>
            {Object.entries(ETIQUETAS_ESTADO).map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-menor font-medium" htmlFor="antiguedad">
            Antigüedad
          </label>
          <select id="antiguedad" name="antiguedad" defaultValue={filtros.antiguedad} className="campo mt-1">
            <option value="">Todas</option>
            {Object.entries(ETIQUETAS_ANTIGUEDAD).map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-menor font-medium" htmlFor="certificados">
            Certificados
          </label>
          <select id="certificados" name="certificados" defaultValue={filtros.certificados} className="campo mt-1">
            <option value="">Todos</option>
            {Object.entries(ETIQUETAS_CERTIFICADOS).map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="boton boton-secundario">
          Filtrar
        </button>
      </Form>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            // El borde es lo único que dice que esto se puede tocar para
            // quitar el filtro, así que va con el borde de control (4,76:1) y
            // no con el decorativo. La píldora se mantiene: no es un botón.
            <a key={c.clave} href={quitarFiltro(c.clave)} className="flex items-center gap-1 rounded-full border border-borde px-3 py-1 text-auxiliar">
              {c.texto} <span aria-hidden>×</span>
            </a>
          ))}
        </div>
      )}

      {seleccion.size > 0 && (
        <BarraAcciones
          seleccionados={empleadosSeleccionados}
          puestos={puestos}
          departamentos={departamentos}
          onTerminar={() => setSeleccion(new Set())}
        />
      )}

      {empleados.length === 0 ? (
        <p className="rounded-tarjeta border border-dashed border-borde-decorativo p-8 text-center text-menor text-secundario">
          {total === 0 && chips.length === 0 && !filtros.q
            ? "Todavía no cargaste empleados. Podés sumarlos de a uno o importar una planilla."
            : "Ningún empleado coincide con los filtros aplicados."}
        </p>
      ) : (
        <>
          {/* Nada de desplazamiento horizontal en una tabla: es lo primero que
              rompe la usabilidad en tablet (05-sistema-de-diseno.md §4). Esta
              tiene nueve columnas, así que por debajo de 1024 px cada fila se
              convierte en una tarjeta apilada. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {empleados.map((e: any) => (
              <li key={e.id} className="tarjeta p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={seleccion.has(e.id)}
                    onChange={() => alternarSeleccion(e.id)}
                    aria-label={`Seleccionar a ${e.nombre} ${e.apellido}`}
                    className="mt-1"
                  />
                  <Avatar nombre={e.nombre} apellido={e.apellido} idInterno={e.id_interno} fotoUrl={e.fotoUrlFirmada} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/empleados/${e.id}`} className="text-cuerpo font-medium text-primario">
                      {e.apellido}, {e.nombre}
                    </Link>
                    <p className="text-auxiliar text-secundario">
                      {e.id_interno} · {ETIQUETAS_ESTADO[e.estado]}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-borde-decorativo pt-3 text-menor">
                  <Dato etiqueta="Puesto" valor={puestos.find((p: any) => p.id === e.puesto_id)?.nombre ?? "—"} />
                  <Dato etiqueta="Departamento" valor={departamentos.find((d: any) => d.id === e.departamento_id)?.nombre ?? "—"} />
                  <Dato etiqueta="Antigüedad" valor={antiguedad(e.fecha_ingreso)} />
                  <Dato etiqueta="Certificados" valor={indicadorPorEmpleado[e.id]} />
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-tarjeta border border-borde-decorativo lg:block">
            <table className="w-full text-menor">
              <thead className="border-b border-borde-decorativo bg-superficie text-left text-auxiliar uppercase text-secundario">
                <tr>
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={seleccion.size > 0 && seleccion.size === empleados.length} onChange={alternarTodos} aria-label="Seleccionar todos" />
                  </th>
                  <th className="px-4 py-3"></th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">ID interno</th>
                  <th className="px-4 py-3">Puesto</th>
                  <th className="px-4 py-3">Departamento</th>
                  <th className="px-4 py-3">Antigüedad</th>
                  <th className="px-4 py-3">Certificados</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((e: any) => (
                  <tr key={e.id} className="border-b border-borde-decorativo last:border-0 hover:bg-fondo">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={seleccion.has(e.id)} onChange={() => alternarSeleccion(e.id)} aria-label={`Seleccionar a ${e.nombre} ${e.apellido}`} />
                    </td>
                    <td className="px-4 py-3">
                      <Avatar nombre={e.nombre} apellido={e.apellido} idInterno={e.id_interno} fotoUrl={e.fotoUrlFirmada} size={32} />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/empleados/${e.id}`} className="font-medium text-primario">
                        {e.apellido}, {e.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{e.id_interno}</td>
                    <td className="px-4 py-3">{puestos.find((p: any) => p.id === e.puesto_id)?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">{departamentos.find((d: any) => d.id === e.departamento_id)?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">{antiguedad(e.fecha_ingreso)}</td>
                    <td className="px-4 py-3">{indicadorPorEmpleado[e.id]}</td>
                    <td className="px-4 py-3">{ETIQUETAS_ESTADO[e.estado]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-menor text-secundario">
          <span>{total} empleados</span>
          <div className="flex items-center gap-2">
            {filtros.pagina > 1 && (
              <a href={paginaUrl(filtros.pagina - 1)} className="underline">
                Anterior
              </a>
            )}
            <span>
              Página {filtros.pagina} de {totalPaginas}
            </span>
            {filtros.pagina < totalPaginas && (
              <a href={paginaUrl(filtros.pagina + 1)} className="underline">
                Siguiente
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function paginaUrl(pagina: number) {
    const params = paramsActuales();
    params.set("pagina", String(pagina));
    return `?${params.toString()}`;
  }
}

type AccionLote = "" | "departamento" | "estado" | "exportar";

// "Toda acción en lote muestra un resumen previo... antes de aplicarse"
// (03-modulos-y-alcance.md módulo 2): por eso hay un paso de confirmación
// intermedio en vez de aplicar apenas se elige el valor.
function BarraAcciones({
  seleccionados,
  puestos,
  departamentos,
  onTerminar,
}: {
  seleccionados: any[];
  puestos: { id: string; nombre: string }[];
  departamentos: { id: string; nombre: string }[];
  onTerminar: () => void;
}) {
  const [accion, setAccion] = useState<AccionLote>("");
  const [valor, setValor] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const fetcher = useFetcher();

  const nombreValor =
    accion === "departamento"
      ? departamentos.find((d) => d.id === valor)?.nombre
      : accion === "estado"
        ? ETIQUETAS_ESTADO[valor]
        : undefined;

  function aplicar() {
    fetcher.submit(
      { intent: accion === "departamento" ? "bulk-departamento" : "bulk-estado", ids: seleccionados.map((e) => e.id).join(","), valor },
      { method: "post" },
    );
    setConfirmando(false);
    onTerminar();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde-decorativo bg-superficie p-3 text-menor">
      <span className="font-medium">{seleccionados.length} seleccionados</span>

      {!confirmando ? (
        <>
          <select
            value={accion}
            onChange={(e) => {
              setAccion(e.target.value as AccionLote);
              setValor("");
            }}
            className="campo"
          >
            <option value="">Elegir acción...</option>
            <option value="departamento">Cambiar departamento</option>
            <option value="estado">Cambiar estado</option>
            <option value="exportar">Exportar a Excel</option>
          </select>

          {accion === "departamento" && (
            <select value={valor} onChange={(e) => setValor(e.target.value)} className="campo">
              <option value="">Elegir...</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          )}
          {accion === "estado" && (
            <select value={valor} onChange={(e) => setValor(e.target.value)} className="campo">
              <option value="">Elegir...</option>
              {Object.entries(ETIQUETAS_ESTADO).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          )}

          {accion === "exportar" ? (
            <button
              type="button"
              onClick={async () => {
                const { exportarEmpleados } = await import("~/lib/exportar-empleados.client");
                exportarEmpleados(seleccionados, puestos, departamentos);
              }}
              className="rounded-control bg-primario px-3 py-1 font-medium text-white"
            >
              Descargar
            </button>
          ) : (
            <button
              type="button"
              disabled={!accion || !valor}
              onClick={() => setConfirmando(true)}
              className="rounded-control bg-primario px-3 py-1 font-medium text-white disabled:opacity-50"
            >
              Continuar
            </button>
          )}
        </>
      ) : (
        <>
          <span>
            Vas a cambiar el {accion === "departamento" ? "departamento" : "estado"} de {seleccionados.length} empleados a{" "}
            <strong>{nombreValor}</strong>.
          </span>
          <button type="button" onClick={() => setConfirmando(false)} className="rounded-control px-3 py-1">
            Cancelar
          </button>
          <button type="button" onClick={aplicar} disabled={fetcher.state !== "idle"} className="rounded-control bg-primario px-3 py-1 font-medium text-white">
            Confirmar
          </button>
        </>
      )}

      <button type="button" onClick={onTerminar} className="ml-auto text-secundario underline">
        Cancelar selección
      </button>
    </div>
  );
}

function FiltroSelect({ label, name, valor, opciones }: { label: string; name: string; valor: string; opciones: { id: string; nombre: string }[] }) {
  return (
    <div>
      <label className="text-menor font-medium" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={valor} className="campo mt-1">
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

// Par etiqueta/valor de las tarjetas del celular. La etiqueta va arriba y en
// chico: en una columna angosta, ponerla al lado deja el valor sin lugar.
function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-auxiliar text-secundario">{etiqueta}</dt>
      <dd className="truncate text-texto">{valor}</dd>
    </div>
  );
}
