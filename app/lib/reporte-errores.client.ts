import * as XLSX from "xlsx";
import { COLUMNAS, type FilaImportacion } from "~/lib/importar-empleados";

export function descargarReporteErrores(filas: FilaImportacion[]) {
  const conError = filas.filter((f) => !f.empresaListaParaImportar);
  const encabezados = ["Fila", ...COLUMNAS.map((c) => c.etiqueta), "Motivo"];
  const cuerpo = conError.map((f) => {
    const motivo = [...f.erroresGenerales, ...Object.values(f.erroresPorCampo)].join(" · ");
    return [f.fila, ...COLUMNAS.map((c) => f.valores[c.clave] ?? ""), motivo];
  });

  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...cuerpo]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Errores");
  XLSX.writeFile(libro, "errores-importacion-empleados.xlsx");
}
