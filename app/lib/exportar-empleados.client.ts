import * as XLSX from "xlsx";

interface Opcion {
  id: string;
  nombre: string;
}

export function exportarEmpleados(empleados: any[], puestos: Opcion[], departamentos: Opcion[]) {
  const filas = empleados.map((e) => ({
    "ID interno": e.id_interno,
    Nombre: e.nombre,
    Apellido: e.apellido,
    Email: e.email ?? "",
    Teléfono: e.telefono ?? "",
    Puesto: puestos.find((p) => p.id === e.puesto_id)?.nombre ?? "",
    Departamento: departamentos.find((d) => d.id === e.departamento_id)?.nombre ?? "",
    "Fecha de ingreso": e.fecha_ingreso,
    Estado: e.estado,
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Empleados");
  XLSX.writeFile(libro, "empleados-skillboard.xlsx");
}
