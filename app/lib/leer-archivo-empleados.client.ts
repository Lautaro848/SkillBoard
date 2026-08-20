import * as XLSX from "xlsx";

export interface ArchivoLeido {
  encabezados: string[];
  filas: Record<string, string>[];
}

// Lee .xlsx y .csv enteramente en el navegador — nunca llega al Worker, así
// que no compite por el presupuesto de CPU de Cloudflare (01-arquitectura-y-stack.md §4).
export async function leerArchivoEmpleados(file: File): Promise<ArchivoLeido> {
  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: "array", cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filasComoArreglos: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, dateNF: "yyyy-mm-dd" });

  if (filasComoArreglos.length === 0) return { encabezados: [], filas: [] };

  const encabezados = filasComoArreglos[0].map((h) => String(h ?? "").trim());
  const filas = filasComoArreglos
    .slice(1)
    .filter((fila) => fila.some((celda) => String(celda ?? "").trim() !== ""))
    .map((fila) => {
      const objeto: Record<string, string> = {};
      encabezados.forEach((encabezado, i) => {
        objeto[encabezado] = String(fila[i] ?? "").trim();
      });
      return objeto;
    });

  return { encabezados, filas };
}
