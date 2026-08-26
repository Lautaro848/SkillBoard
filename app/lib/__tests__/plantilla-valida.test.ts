import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FILA_EJEMPLO } from "~/lib/plantilla-empleados.client";
import { empleadoSchema } from "~/lib/validation/empleados";

// La plantilla que descarga el programa traía OP-0143 como ejemplo de ID
// interno, y la validación exigía [A-Za-z0-9] a secas: el guion la rechazaba.
// O sea que copiar el ejemplo de la propia plantilla daba error en las 50
// filas, con un mensaje —"debe ser alfanumérico"— que además no decía que el
// guion fuera el problema.
//
// Que la plantilla y la validación se contradigan es de las cosas peores que
// puede hacer un producto: la persona hace exactamente lo que se le indicó y
// el sistema le dice que está mal. Este test las ata.

describe("la plantilla que damos para descargar", () => {
  it("tiene un ejemplo que pasa la validación", () => {
    const resultado = empleadoSchema.safeParse({
      idInterno: FILA_EJEMPLO.idInterno,
      nombre: FILA_EJEMPLO.nombre,
      apellido: FILA_EJEMPLO.apellido,
      email: FILA_EJEMPLO.email,
      telefono: FILA_EJEMPLO.telefono,
      fechaNacimiento: FILA_EJEMPLO.fechaNacimiento,
      fechaIngreso: FILA_EJEMPLO.fechaIngreso,
      // El puesto y el departamento del ejemplo son nombres, no ids: los
      // resuelve el importador contra los catálogos de la empresa.
      puestoId: "00000000-0000-4000-8000-000000000001",
      departamentoId: "00000000-0000-4000-8000-000000000002",
      estado: FILA_EJEMPLO.estado,
      observaciones: FILA_EJEMPLO.observaciones,
    });

    expect(resultado.error?.issues.map((i) => i.message) ?? []).toEqual([]);
    expect(resultado.success).toBe(true);
  });
});

describe("formato del ID interno", () => {
  const soloId = (idInterno: string) =>
    empleadoSchema.safeParse({
      idInterno,
      nombre: "Juan",
      apellido: "Pérez",
      email: "",
      telefono: "",
      fechaNacimiento: "1990-05-20",
      fechaIngreso: "2022-03-01",
      puestoId: "00000000-0000-4000-8000-000000000001",
      departamentoId: "00000000-0000-4000-8000-000000000002",
      estado: "activo",
      observaciones: "",
    }).success;

  it.each(["OP-0143", "OP-0001", "A1B2C3", "12.345", "RH/2024-07", "abc"])("acepta %s", (id) => {
    expect(soloId(id)).toBe(true);
  });

  it.each([
    ["AB", "menos de 3 caracteres"],
    ["-OP-0143", "empieza con separador"],
    ["OP-0143-", "termina con separador"],
    ["OP 0143", "tiene un espacio"],
    ["OP#0143", "tiene un símbolo que no es separador"],
    ["A".repeat(21), "más de 20 caracteres"],
  ])("rechaza %s porque %s", (id) => {
    expect(soloId(id)).toBe(false);
  });
});

describe("email con acentos", () => {
  const conEmail = (email: string) =>
    empleadoSchema.safeParse({
      idInterno: "OP-0027",
      nombre: "Andrés",
      apellido: "Núñez",
      email,
      telefono: "",
      fechaNacimiento: "1995-04-04",
      fechaIngreso: "2019-04-15",
      puestoId: "00000000-0000-4000-8000-000000000001",
      departamentoId: "00000000-0000-4000-8000-000000000002",
      estado: "activo",
      observaciones: "",
    });

  it("explica que la ñ es el problema, en vez de decir solo que es inválido", () => {
    // Caso real: una plantilla armaba el email desde el apellido y salía
    // andres.nuñez@empresa.com. A simple vista está perfecto.
    const r = conEmail("andres.nuñez@empresa.com");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("acento o ñ");
  });

  it("la versión sin acentos pasa", () => {
    expect(conEmail("andres.nunez@empresa.com").success).toBe(true);
  });

  it("un email mal formado sigue dando el mensaje de siempre", () => {
    const r = conEmail("andres.nunez.empresa.com");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Ingresá un email válido");
  });
});

describe("la regla del ID interno vive en dos lados", () => {
  it("la de la base dice exactamente lo mismo que la de la aplicación", () => {
    // La primera vez que se aflojó esta regla se cambió solo la aplicación. La
    // base siguió con la vieja, así que el formulario aceptaba OP-0143 y el
    // insert fallaba con un error de restricción: peor que antes, porque el
    // error aparecía después de cargar los datos.
    //
    // Las dos expresiones tienen que ser la misma cadena. Si alguien afloja
    // una, este test le recuerda la otra.
    const enLaApp = readFileSync("app/lib/validation/empleados.ts", "utf8");
    const enLaBase = readFileSync("supabase/migrations/0015_id_interno_con_separadores.sql", "utf8");

    const EXPRESION = "^[A-Za-z0-9][A-Za-z0-9._/-]{1,18}[A-Za-z0-9]$";
    expect(enLaApp).toContain(EXPRESION);
    expect(enLaBase).toContain(EXPRESION);
  });
});
