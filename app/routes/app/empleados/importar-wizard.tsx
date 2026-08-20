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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      <ol className="flex gap-4 text-sm text-[var(--color-text-muted)]">
        {(["subir", "mapear", "previsualizar", "resultado"] as Paso[]).map((p, i) => (
          <li key={p} className={p === paso ? "font-medium text-[var(--color-primary)]" : ""}>
            {i + 1}. {{ subir: "Subir", mapear: "Mapear columnas", previsualizar: "Previsualizar", resultado: "Resultado" }[p]}
          </li>
        ))}
      </ol>

      {paso === "subir" && (
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] p-6">
          <p className="text-sm text-[var(--color-text-muted)]">
            Subí un archivo .xlsx o .csv con tus empleados. Si no tenés uno armado, descargá la plantilla con las
            columnas correctas y una fila de ejemplo.
          </p>
          <button type="button" onClick={descargarPlantilla} className="w-fit rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
            Descargar plantilla
          </button>
          <div>
            <input type="file" accept=".xlsx,.csv" onChange={onArchivo} disabled={leyendo} className="text-sm" />
            {leyendo && <p className="mt-1 text-sm text-[var(--color-text-muted)]">Leyendo archivo...</p>}
            {errorLectura && <p className="mt-1 text-sm text-[var(--color-danger)]">{errorLectura}</p>}
          </div>
        </div>
      )}

      {paso === "mapear" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Detectamos estas columnas en tu archivo. Corregí la correspondencia donde haga falta.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {COLUMNAS.map((c) => (
              <div key={c.clave}>
                <label className="text-sm font-medium">
                  {c.etiqueta} {c.requerido && "*"}
                </label>
                <select
                  value={mapeo[c.clave] ?? ""}
                  onChange={(e) => setMapeo((m) => ({ ...m, [c.clave]: e.target.value || null }))}
                  className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
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
            <p className="text-sm text-[var(--color-danger)]">
              Falta mapear: {columnasFaltantes.map((c) => c.etiqueta).join(", ")}.
            </p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setPaso("subir")} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
              Volver
            </button>
            <button
              type="button"
              disabled={columnasFaltantes.length > 0}
              onClick={continuarAPrevisualizacion}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)] disabled:opacity-50"
            >
              Previsualizar
            </button>
          </div>
        </div>
      )}

      {paso === "previsualizar" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-[var(--color-text)]">
            {listas} fila{listas === 1 ? "" : "s"} lista{listas === 1 ? "" : "s"} para importar, {conError} con errores
            {filas.length > 50 && ` (mostrando las primeras 50 de ${filas.length})`}.
          </p>

          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase text-[var(--color-text-muted)]">
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
                  <tr key={f.fila} className={f.empresaListaParaImportar ? "" : "bg-[var(--color-danger)]/5"}>
                    <td className="px-3 py-2 align-top">{f.fila}</td>
                    {COLUMNAS.map((c) => (
                      <td key={c.clave} className="px-3 py-2 align-top">
                        {f.valores[c.clave] || "—"}
                        {f.erroresPorCampo[c.clave] && (
                          <p className="mt-0.5 text-xs text-[var(--color-danger)]">{f.erroresPorCampo[c.clave]}</p>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas.some((f) => f.erroresGenerales.length > 0) && (
            <ul className="text-xs text-[var(--color-danger)]">
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
            <button type="button" onClick={() => setPaso("mapear")} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
              Volver
            </button>
            {conError > 0 && (
              <button type="button" onClick={() => descargarReporteErrores(filas)} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium">
                Descargar reporte de errores
              </button>
            )}
            <button
              type="button"
              disabled={listas === 0}
              onClick={importar}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)] disabled:opacity-50"
            >
              Importar {listas} fila{listas === 1 ? "" : "s"} válida{listas === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {paso === "resultado" && (
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] p-6">
          {fetcher.state !== "idle" ? (
            <p className="text-sm text-[var(--color-text-muted)]">Importando, no cierres esta pantalla...</p>
          ) : fetcher.data ? (
            <>
              <p className="text-sm text-[var(--color-text)]">
                Se crearon <strong>{fetcher.data.creados}</strong> empleados.
                {fetcher.data.fallidos.length > 0 && ` ${fetcher.data.fallidos.length} filas se rechazaron.`}
              </p>
              {fetcher.data.fallidos.length > 0 && (
                <ul className="text-xs text-[var(--color-danger)]">
                  {fetcher.data.fallidos.map((f) => (
                    <li key={f.fila}>
                      Fila {f.fila}: {f.motivo}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/empleados" className="w-fit rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]">
                Ver empleados
              </Link>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
