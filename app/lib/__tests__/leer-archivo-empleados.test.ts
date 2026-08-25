import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { leerLibroEmpleados } from "~/lib/leer-archivo-empleados.client";
import { catalogosFaltantes, proponerMapeo, validarFilas } from "~/lib/importar-empleados";

// El importador leía `SheetNames[0]` y daba por sentado que los encabezados
// estaban en la fila 1. Las dos cosas fallan con un archivo real.
//
// El caso que lo destapó: una plantilla generada por un modelo de lenguaje con
// dos hojas, "Dashboard" primero —un tablero decorativo cuya única celda con
// texto es el título— y "Empleados" después, con los 50 empleados. La pantalla
// de mapeo ofrecía una sola columna para elegir: "PANEL DE CONTROL - GESTIÓN
// DE EMPLEADOS".

const ENCABEZADOS = [
  "ID interno",
  "Nombre",
  "Apellido",
  "Email",
  "Teléfono",
  "Fecha de nacimiento",
  "Fecha de ingreso",
  "Puesto",
  "Departamento",
  "Estado",
  "Observaciones",
];

const empleado = (n: number) => [
  `OP-${String(n).padStart(4, "0")}`,
  "Juan",
  "Pérez",
  `juan${n}@empresa.com`,
  "11 5555-5555",
  "1990-05-20",
  "2022-03-01",
  "Operario",
  "Producción",
  "activo",
  "",
];

function libro(hojas: { nombre: string; filas: unknown[][] }[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const h of hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(h.filas), h.nombre);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("elegir la hoja", () => {
  it("saltea una portada y encuentra la hoja con los empleados", () => {
    const buffer = libro([
      { nombre: "Dashboard", filas: [["PANEL DE CONTROL - GESTIÓN DE EMPLEADOS"], [], ["TOTAL", "ACTIVOS"]] },
      { nombre: "Empleados", filas: [ENCABEZADOS, ...[1, 2, 3].map(empleado)] },
    ]);

    const r = leerLibroEmpleados(buffer);
    expect(r.hoja).toBe("Empleados");
    expect(r.encabezados).toEqual(ENCABEZADOS);
    expect(r.filas).toHaveLength(3);
    // Las dos hojas se ofrecen igual, por si elegimos mal.
    expect(r.hojas).toEqual(["Dashboard", "Empleados"]);
  });

  it("respeta la hoja que elige la persona a mano", () => {
    const buffer = libro([
      { nombre: "Enero", filas: [ENCABEZADOS, empleado(1)] },
      { nombre: "Febrero", filas: [ENCABEZADOS, empleado(2), empleado(3)] },
    ]);

    // Sola elegiría Febrero, que tiene más filas.
    expect(leerLibroEmpleados(buffer).hoja).toBe("Febrero");
    expect(leerLibroEmpleados(buffer, "Enero").hoja).toBe("Enero");
    expect(leerLibroEmpleados(buffer, "Enero").filas).toHaveLength(1);
  });

  it("un libro de una sola hoja sigue funcionando igual", () => {
    const r = leerLibroEmpleados(libro([{ nombre: "Empleados", filas: [ENCABEZADOS, empleado(1)] }]));
    expect(r.hoja).toBe("Empleados");
    expect(r.filaEncabezados).toBe(1);
    expect(r.hojas).toHaveLength(1);
  });

  it("avisa cuando no hay ninguna tabla en vez de mostrar basura", () => {
    const r = leerLibroEmpleados(libro([{ nombre: "Vacía", filas: [["Solo un título"]] }]));
    expect(r.encabezados).toEqual([]);
    expect(r.filas).toEqual([]);
  });
});

describe("encontrar la fila de los encabezados", () => {
  it("saltea un título y filas en blanco arriba de la tabla", () => {
    const r = leerLibroEmpleados(
      libro([
        {
          nombre: "Empleados",
          filas: [["NÓMINA 2026"], [], [], ENCABEZADOS, empleado(1), empleado(2)],
        },
      ]),
    );

    expect(r.filaEncabezados).toBe(4);
    expect(r.encabezados).toEqual(ENCABEZADOS);
    expect(r.filas).toHaveLength(2);
  });

  it("los números de fila apuntan a la planilla, no al arreglo", () => {
    // Con un título arriba y un hueco en el medio, el reporte de errores tiene
    // que mandar a la fila donde el dato está de verdad.
    const r = leerLibroEmpleados(
      libro([
        {
          nombre: "Empleados",
          filas: [["NÓMINA 2026"], ENCABEZADOS, empleado(1), [], empleado(2)],
        },
      ]),
    );

    expect(r.filaEncabezados).toBe(2);
    expect(r.numerosDeFila).toEqual([3, 5]);
  });

  it("empatada, gana la de arriba: una fila de totales al final no es el encabezado", () => {
    const totales = ENCABEZADOS.map(() => "—");
    const r = leerLibroEmpleados(
      libro([{ nombre: "Empleados", filas: [ENCABEZADOS, empleado(1), totales] }]),
    );
    expect(r.filaEncabezados).toBe(1);
    expect(r.encabezados).toEqual(ENCABEZADOS);
  });
});

describe("de punta a punta con la forma del archivo que falló", () => {
  const buffer = libro([
    { nombre: "Dashboard", filas: [["PANEL DE CONTROL - GESTIÓN DE EMPLEADOS"], [], ["TOTAL", "ACTIVOS"]] },
    { nombre: "Empleados", filas: [ENCABEZADOS, empleado(1), empleado(2)] },
  ]);

  it("mapea las once columnas sola", () => {
    const { encabezados } = leerLibroEmpleados(buffer);
    const mapeo = proponerMapeo(encabezados);
    const sinMapear = Object.entries(mapeo).filter(([, v]) => v === null);
    expect(sinMapear).toEqual([]);
  });

  it("lista los puestos y departamentos que la empresa no tiene", () => {
    const { encabezados, filas } = leerLibroEmpleados(buffer);
    const mapeo = proponerMapeo(encabezados);

    expect(catalogosFaltantes(filas, mapeo, { puestos: [], departamentos: [] })).toEqual({
      puestos: ["Operario"],
      departamentos: ["Producción"],
    });

    // Sin acentos ni mayúsculas es el mismo departamento: no se duplica.
    expect(
      catalogosFaltantes(filas, mapeo, {
        puestos: [{ id: "1", nombre: "operario" }],
        departamentos: [{ id: "2", nombre: "PRODUCCION" }],
      }),
    ).toEqual({ puestos: [], departamentos: [] });
  });

  it("con los catálogos creados, las filas quedan listas para importar", () => {
    const { encabezados, filas, numerosDeFila } = leerLibroEmpleados(buffer);
    const validadas = validarFilas(
      filas,
      proponerMapeo(encabezados),
      {
        puestos: [{ id: "00000000-0000-4000-8000-000000000001", nombre: "Operario" }],
        departamentos: [{ id: "00000000-0000-4000-8000-000000000002", nombre: "Producción" }],
        idsExistentes: new Set(),
      },
      numerosDeFila,
    );

    expect(validadas.map((f) => f.erroresPorCampo)).toEqual([{}, {}]);
    expect(validadas.every((f) => f.empresaListaParaImportar)).toBe(true);
    // OP-0001 lleva guion: con la regla anterior las dos filas fallaban.
    expect(validadas[0].datosParaGuardar?.idInterno).toBe("OP-0001");
  });
});
