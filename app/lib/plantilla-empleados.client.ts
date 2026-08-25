import * as XLSX from "xlsx";
import { COLUMNAS } from "~/lib/importar-empleados";

export const FILA_EJEMPLO: Record<string, string> = {
  idInterno: "OP-0143",
  nombre: "Juan",
  apellido: "Pérez",
  email: "juan.perez@empresa.com",
  telefono: "11 5555-5555",
  fechaNacimiento: "1990-05-20",
  fechaIngreso: "2022-03-01",
  puesto: "Operario",
  departamento: "Producción",
  estado: "activo",
  observaciones: "",
};

export function descargarPlantilla() {
  const encabezados = COLUMNAS.map((c) => c.etiqueta);
  const filaEjemplo = COLUMNAS.map((c) => FILA_EJEMPLO[c.clave] ?? "");
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, filaEjemplo]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Empleados");
  XLSX.writeFile(libro, "plantilla-empleados-skillboard.xlsx");
}
