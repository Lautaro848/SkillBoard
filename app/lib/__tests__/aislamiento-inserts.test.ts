import { describe, expect, it } from "vitest";
import { readFileSync, globSync } from "node:fs";

// Toda fila de una tabla de negocio lleva empresa_id, y ese valor sale de la
// sesión (02-modelo-de-datos.md §1). Si un insert se lo olvida, la política
// de aislamiento rechaza la fila y la pantalla falla con un error opaco.
//
// Pasó de verdad: el alta de catálogos —puestos, departamentos, aptitudes,
// tipos de certificado— nunca funcionó desde la aplicación, porque armaba las
// columnas sin empresa_id. No se notó antes porque los catálogos de prueba se
// habían cargado por SQL, no por la pantalla.
//
// La primera versión de este test buscaba `from("tabla")` con el nombre
// literal, y por eso NO detectaba el caso que lo motivó: en catálogos la
// tabla es una variable (`from(tipo)`). Ahora la regla es al revés —todo
// insert necesita empresa_id— y las pocas excepciones se declaran acá con su
// motivo. Es más molesto de mantener y por eso mismo no tiene agujeros.

// Tablas que a propósito NO llevan empresa_id.
const SIN_EMPRESA = [
  // El perfil pertenece a la persona, no a una empresa: alguien puede estar
  // en varias.
  "perfiles",
];

function archivosDeRutas(): string[] {
  return globSync("app/routes/**/*.tsx").filter((f) => !f.includes("__tests__"));
}

describe("aislamiento por empresa en las escrituras", () => {
  it("todo insert de una ruta lleva empresa_id", () => {
    const faltantes: string[] = [];

    for (const archivo of archivosDeRutas()) {
      const lineas = readFileSync(archivo, "utf8").split("\n");

      lineas.forEach((linea, i) => {
        if (!linea.includes(".insert(")) return;

        // El objeto insertado puede armarse unas líneas antes (dentro de un
        // .map(), por ejemplo), así que se mira una ventana alrededor.
        const ventana = lineas.slice(Math.max(0, i - 25), i + 15).join("\n");

        if (SIN_EMPRESA.some((t) => ventana.includes(`from("${t}")`))) return;
        if (ventana.includes("empresa_id")) return;

        faltantes.push(`${archivo}:${i + 1}`);
      });
    }

    expect(faltantes).toEqual([]);
  });

  it("el alta de catálogos manda empresa_id desde la sesión", () => {
    // El caso concreto que falló, verificado explícito además del barrido.
    const codigo = readFileSync("app/routes/app/configuracion/catalogos.tsx", "utf8");

    expect(codigo).toContain("requireSesion");
    expect(codigo).toContain("empresa_id: empresaId");
    // Y que no lo tome del formulario, que sería la otra forma de romperlo:
    // el cliente no decide a qué empresa pertenece una fila.
    expect(codigo).not.toContain('formData.get("empresaId")');
  });
});
