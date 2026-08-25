import { useEffect, useState } from "react";
import { Aviso } from "~/components/ui/estados";
import { useFetcher } from "react-router";
import { Link } from "react-router";
import {
  COLUMNAS,
  catalogosFaltantes,
  proponerMapeo,
  validarFilas,
  type FilaImportacion,
  type Mapeo,
} from "~/lib/importar-empleados";
import { leerArchivoEmpleados } from "~/lib/leer-archivo-empleados.client";
import { descargarPlantilla } from "~/lib/plantilla-empleados.client";
import { descargarReporteErrores } from "~/lib/reporte-errores.client";

interface Opcion {
  id: string;
  nombre: string;
}

interface Props {
  puestos: Opcion[];
  departamentos: Opcion[];
  idsExistentes: string[];
}

type Paso = "subir" | "mapear" | "previsualizar" | "resultado";

export function ImportarWizard({ puestos: puestosIniciales, departamentos: departamentosIniciales, idsExistentes }: Props) {
  const [paso, setPaso] = useState<Paso>("subir");
  // Los catálogos pueden crecer sin salir de la pantalla, así que viven en
  // estado y no directo en las props.
  const [puestos, setPuestos] = useState(puestosIniciales);
  const [departamentos, setDepartamentos] = useState(departamentosIniciales);
    const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<Record<string, string>[]>([]);
  const [numerosDeFila, setNumerosDeFila] = useState<number[]>([]);
  // El archivo queda guardado para poder releerlo si la persona elige otra
  // hoja: volver a pedírselo sería hacerle repetir el paso anterior.
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<string[]>([]);
  const [hoja, setHoja] = useState("");
  const [filaEncabezados, setFilaEncabezados] = useState(1);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [filas, setFilas] = useState<FilaImportacion[]>([]);
  const fetcher = useFetcher<{ creados: number; fallidos: { fila: number; motivo: string }[] }>();
  // Un fetcher aparte para crear catálogos: comparte la ruta con la
  // importación pero es otra operación, y mezclarlos haría que el resultado
  // de una pisara el de la otra.
  const fetcherCatalogos = useFetcher<{
    puestos: Opcion[];
    departamentos: Opcion[];
    rechazados: string[];
  }>();

  async function cargar(file: File, hojaPedida?: string) {
    setLeyendo(true);
    setErrorLectura(null);
    try {
      const leido = await leerArchivoEmpleados(file, hojaPedida);
      setHojas(leido.hojas);
      setHoja(leido.hoja);

      if (leido.encabezados.length === 0) {
        setErrorLectura(
          leido.hojas.length > 1
            ? `En la hoja "${leido.hoja}" no encontramos una tabla. Probá con otra: el archivo tiene ${leido.hojas.length} hojas.`
            : "No encontramos una tabla en el archivo. Tiene que haber una fila con los nombres de las columnas y los empleados debajo.",
        );
        return;
      }

      setArchivo(file);
      setEncabezados(leido.encabezados);
      setFilasCrudas(leido.filas);
      setNumerosDeFila(leido.numerosDeFila);
      setFilaEncabezados(leido.filaEncabezados);
      setMapeo(proponerMapeo(leido.encabezados));
      setPaso("mapear");
    } catch {
      setErrorLectura("No pudimos leer el archivo. Probá exportarlo nuevamente como .xlsx o .csv.");
    } finally {
      setLeyendo(false);
    }
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await cargar(file);
  }

  function revalidar(catalogos?: { puestos: Opcion[]; departamentos: Opcion[] }) {
    const validadas = validarFilas(
      filasCrudas,
      mapeo,
      {
        puestos: catalogos?.puestos ?? puestos,
        departamentos: catalogos?.departamentos ?? departamentos,
        idsExistentes: new Set(idsExistentes.map((id) => id.toUpperCase())),
      },
      numerosDeFila,
    );
    setFilas(validadas);
    return validadas;
  }

  function continuarAPrevisualizacion() {
    revalidar();
    setPaso("previsualizar");
  }

  function importar() {
    const validas = filas
      .map((f) => (f.empresaListaParaImportar && f.datosParaGuardar ? { fila: f.fila, datos: f.datosParaGuardar } : null))
      .filter((f) => f !== null);
    // El payload es JSON plano en tiempo de ejecución; el cast evita que TS
    // exija una firma de índice explícita en DatosEmpleadoResueltos solo
    // para satisfacer el tipo JsonValue de fetcher.submit.
     
    fetcher.submit({ filas: validas } as any, {
      method: "post" as const,
      encType: "application/json" as const,
    });
    setPaso("resultado");
  }

  const creandoCatalogos = fetcherCatalogos.state !== "idle";

  // Qué puestos y departamentos nombra el archivo que la empresa no tiene.
  // Se recalcula en cada render: apenas se crean, la lista queda vacía sola.
  const faltantes = catalogosFaltantes(filasCrudas, mapeo, { puestos, departamentos });
  const totalFaltantes = faltantes.puestos.length + faltantes.departamentos.length;

  // Crea los catálogos que faltan y vuelve a validar con los nuevos.
  //
  // Es una escritura, así que no pasa sin que la persona la pida: primero ve
  // exactamente qué se va a crear y recién después aprieta el botón
  // (03-modulos-y-alcance.md, Regla 2: resumen antes de aplicar).
  function crearFaltantes() {
    setErrorCatalogos(null);

    // El departamento con el que aparece cada puesto, para que el puesto
    // nuevo no quede sin área.
    const departamentoDelPuesto = new Map<string, string>();
    for (const fila of filasCrudas) {
      const p = mapeo.puesto ? (fila[mapeo.puesto] ?? "").trim() : "";
      const d = mapeo.departamento ? (fila[mapeo.departamento] ?? "").trim() : "";
      if (p && !departamentoDelPuesto.has(p)) departamentoDelPuesto.set(p, d);
    }

    fetcherCatalogos.submit(
      {
        intent: "crear-catalogos",
        departamentos: faltantes.departamentos,
        puestos: faltantes.puestos.map((nombre) => ({
          nombre,
          departamento: departamentoDelPuesto.get(nombre) ?? "",
        })),
      },
      { method: "post", encType: "application/json" },
    );
  }

  // La respuesta llega asincrónica: cuando está, se adoptan los catálogos
  // nuevos y se vuelve a validar para que la previsualización muestre las
  // filas ya sin el error.
  useEffect(() => {
    const datos = fetcherCatalogos.data;
    if (!datos) return;

    setPuestos(datos.puestos);
    setDepartamentos(datos.departamentos);
    setErrorCatalogos(
      datos.rechazados.length > 0
        ? `No se pudieron crear estos nombres porque no tienen entre 2 y 50 caracteres: ${datos.rechazados.join(", ")}. ` +
            "Corregilos en el archivo y volvé a subirlo."
        : null,
    );

    revalidar({ puestos: datos.puestos, departamentos: datos.departamentos });
    // Solo depende de la respuesta: `revalidar` lee estado que ya está al día
    // en este render, y agregarla como dependencia volvería a correr el efecto
    // en cada tecla.
  }, [fetcherCatalogos.data]);

  const columnasFaltantes = COLUMNAS.filter((c) => c.requerido && !mapeo[c.clave]);
  const listas = filas.filter((f) => f.empresaListaParaImportar).length;
  const conError = filas.length - listas;

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-4 text-menor text-secundario">
        {(["subir", "mapear", "previsualizar", "resultado"] as Paso[]).map((p, i) => (
          <li key={p} className={p === paso ? "font-medium text-primario" : ""}>
            {i + 1}. {{ subir: "Subir", mapear: "Mapear columnas", previsualizar: "Previsualizar", resultado: "Resultado" }[p]}
          </li>
        ))}
      </ol>

      {paso === "subir" && (
        <div className="flex flex-col gap-4 rounded-tarjeta border border-borde-decorativo p-6">
          <p className="text-menor text-secundario">
            Subí un archivo .xlsx o .csv con tus empleados. Si no tenés uno armado, descargá la plantilla con las
            columnas correctas y una fila de ejemplo.
          </p>
          <button type="button" onClick={descargarPlantilla} className="boton boton-secundario w-fit">
            Descargar plantilla
          </button>
          <div>
            <input type="file" accept=".xlsx,.csv" onChange={onArchivo} disabled={leyendo} className="text-menor" />
            {leyendo && <p className="mt-1 text-menor text-secundario">Leyendo archivo...</p>}
            {errorLectura && <p className="mt-1 text-menor text-error">{errorLectura}</p>}
          </div>
        </div>
      )}

      {paso === "mapear" && (
        <div className="flex flex-col gap-4">
          <p className="text-menor text-secundario">
            Detectamos estas columnas en tu archivo. Corregí la correspondencia donde haga falta.
          </p>

          {/* Qué se leyó exactamente. Si el libro trae varias hojas —una
              portada, un tablero, instrucciones— elegimos la que más datos
              tiene, pero la decisión queda a la vista y se puede cambiar. */}
          <div className="flex flex-wrap items-end gap-3">
            {hojas.length > 1 ? (
              <div>
                <label className="text-menor font-medium" htmlFor="hoja">
                  Hoja del archivo
                </label>
                <select
                  id="hoja"
                  value={hoja}
                  disabled={leyendo}
                  onChange={(e) => archivo && cargar(archivo, e.target.value)}
                  className="campo mt-1"
                >
                  {hojas.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <p className="pb-2 text-auxiliar text-secundario">
              Hoja «{hoja}» · encabezados en la fila {filaEncabezados} · {filasCrudas.length} fila
              {filasCrudas.length === 1 ? "" : "s"} con datos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {COLUMNAS.map((c) => (
              <div key={c.clave}>
                <label className="text-menor font-medium">
                  {c.etiqueta} {c.requerido && "*"}
                </label>
                <select
                  value={mapeo[c.clave] ?? ""}
                  onChange={(e) => setMapeo((m) => ({ ...m, [c.clave]: e.target.value || null }))}
                  className="campo mt-1"
                >
                  <option value="">No importar</option>
                  {encabezados.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {columnasFaltantes.length > 0 && (
            <p className="text-menor text-error">
              Falta mapear: {columnasFaltantes.map((c) => c.etiqueta).join(", ")}.
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setPaso("subir")} className="boton boton-secundario">
              Volver
            </button>
            <button
              type="button"
              disabled={columnasFaltantes.length > 0}
              onClick={continuarAPrevisualizacion}
              className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white disabled:opacity-50"
            >
              Previsualizar
            </button>
          </div>
        </div>
      )}

      {paso === "previsualizar" && (
        <div className="flex flex-col gap-4">
          <p className="text-menor font-medium text-texto">
            {listas} fila{listas === 1 ? "" : "s"} lista{listas === 1 ? "" : "s"} para importar, {conError} con errores
            {filas.length > 50 && ` (mostrando las primeras 50 de ${filas.length})`}.
          </p>

          {totalFaltantes > 0 && (
            <Aviso tono="advertencia" titulo="Faltan puestos y departamentos en tus catálogos">
              <p>
                El archivo nombra {totalFaltantes} que tu empresa todavía no tiene. Podés crearlos ahora y
                seguir, o cancelar y corregir el archivo para que use los nombres que ya usás.
              </p>
              {faltantes.departamentos.length > 0 && (
                <p className="mt-2">
                  <span className="font-medium">
                    Departamentos ({faltantes.departamentos.length}):
                  </span>{" "}
                  {faltantes.departamentos.join(", ")}
                </p>
              )}
              {faltantes.puestos.length > 0 && (
                <p className="mt-1">
                  <span className="font-medium">Puestos ({faltantes.puestos.length}):</span>{" "}
                  {faltantes.puestos.join(", ")}
                </p>
              )}
              <button
                type="button"
                onClick={crearFaltantes}
                disabled={creandoCatalogos}
                className="boton boton-secundario mt-3"
              >
                {creandoCatalogos ? "Creando..." : `Crear estos ${totalFaltantes} y seguir`}
              </button>
              {errorCatalogos && <p className="mt-2 text-error">{errorCatalogos}</p>}
            </Aviso>
          )}

          <div className="overflow-x-auto rounded-tarjeta border border-borde-decorativo">
            <table className="w-full text-menor">
              <thead className="border-b border-borde-decorativo bg-superficie text-left text-auxiliar uppercase text-secundario">
                <tr>
                  <th className="px-3 py-2">Fila</th>
                  {COLUMNAS.map((c) => (
                    <th key={c.clave} className="px-3 py-2">
                      {c.etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 50).map((f) => (
                  <tr key={f.fila} className={f.empresaListaParaImportar ? "" : "bg-error/5"}>
                    <td className="px-3 py-2 align-top">{f.fila}</td>
                    {COLUMNAS.map((c) => (
                      <td key={c.clave} className="px-3 py-2 align-top">
                        {f.valores[c.clave] || "—"}
                        {f.erroresPorCampo[c.clave] && (
                          <p className="mt-0.5 text-auxiliar text-error">{f.erroresPorCampo[c.clave]}</p>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas.some((f) => f.erroresGenerales.length > 0) && (
            <ul className="text-auxiliar text-error">
              {filas
                .filter((f) => f.erroresGenerales.length > 0)
                .map((f) => (
                  <li key={f.fila}>
                    Fila {f.fila}: {f.erroresGenerales.join(" ")}
                  </li>
                ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setPaso("mapear")} className="boton boton-secundario">
              Volver
            </button>
            {conError > 0 && (
              <button type="button" onClick={() => descargarReporteErrores(filas)} className="boton boton-secundario">
                Descargar reporte de errores
              </button>
            )}
            <button
              type="button"
              disabled={listas === 0}
              onClick={importar}
              className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white disabled:opacity-50"
            >
              Importar {listas} fila{listas === 1 ? "" : "s"} válida{listas === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {paso === "resultado" && (
        <div className="flex flex-col gap-4 rounded-tarjeta border border-borde-decorativo p-6">
          {fetcher.state !== "idle" ? (
            <p className="text-menor text-secundario">Importando, no cierres esta pantalla...</p>
          ) : fetcher.data ? (
            <>
              <p className="text-menor text-texto">
                Se crearon <strong>{fetcher.data.creados}</strong> empleados.
                {fetcher.data.fallidos.length > 0 && ` ${fetcher.data.fallidos.length} filas se rechazaron.`}
              </p>
              {fetcher.data.fallidos.length > 0 && (
                <ul className="text-auxiliar text-error">
                  {fetcher.data.fallidos.map((f) => (
                    <li key={f.fila}>
                      Fila {f.fila}: {f.motivo}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/empleados" className="w-fit rounded-control bg-primario px-4 py-2 text-menor font-medium text-white">
                Ver empleados
              </Link>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
