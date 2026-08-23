import { useState } from "react";
import { useFetcher } from "react-router";
import { Link } from "react-router";
import {
  COLUMNAS,
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

export function ImportarWizard({ puestos, departamentos, idsExistentes }: Props) {
  const [paso, setPaso] = useState<Paso>("subir");
  const [leyendo, setLeyendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [filas, setFilas] = useState<FilaImportacion[]>([]);
  const fetcher = useFetcher<{ creados: number; fallidos: { fila: number; motivo: string }[] }>();

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLeyendo(true);
    setErrorLectura(null);
    try {
      const { encabezados: h, filas: f } = await leerArchivoEmpleados(file);
      if (h.length === 0) {
        setErrorLectura("El archivo no tiene filas. Revisá que sea el correcto.");
        return;
      }
      setEncabezados(h);
      setFilasCrudas(f);
      setMapeo(proponerMapeo(h));
      setPaso("mapear");
    } catch {
      setErrorLectura("No pudimos leer el archivo. Probá exportarlo nuevamente como .xlsx o .csv.");
    } finally {
      setLeyendo(false);
    }
  }

  function continuarAPrevisualizacion() {
    const validadas = validarFilas(filasCrudas, mapeo, {
      puestos,
      departamentos,
      idsExistentes: new Set(idsExistentes.map((id) => id.toUpperCase())),
    });
    setFilas(validadas);
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
