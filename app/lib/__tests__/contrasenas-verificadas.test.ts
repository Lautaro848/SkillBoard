import { describe, expect, it } from "vitest";
import { readFileSync, globSync } from "node:fs";

// Toda pantalla que fije una contraseña tiene que verificarla contra
// Pwned Passwords antes de guardarla.
//
// Hoy son dos: el registro y el cambio de contraseña. Van a ser tres cuando
// exista "olvidé mi contraseña", y ese es exactamente el momento en el que
// alguien se olvida de agregar la comprobación, porque el formulario nuevo
// funciona perfecto sin ella. Este barrido es la regla al revés: si una ruta
// escribe una contraseña, tiene que importar el módulo, y punto.
//
// Se busca sobre el código fuente y no llamando a las funciones porque lo que
// hay que garantizar es que no exista un camino sin la comprobación, no que
// un camino conocido la tenga.

// Las llamadas de Supabase Auth que fijan una contraseña.
const FIJA_CONTRASENA = [/\.auth\.signUp\(/, /\.auth\.updateUser\(\s*\{[^}]*password/s];

const VERIFICACION = "motivoContrasenaFiltrada";

function archivosDeRutas(): string[] {
  return globSync("app/routes/**/*.tsx").filter((f) => !f.includes("__tests__"));
}

describe("ninguna contraseña se guarda sin verificar", () => {
  it("toda ruta que fije una contraseña llama a la verificación", () => {
    const sinVerificar: string[] = [];

    for (const archivo of archivosDeRutas()) {
      const codigo = readFileSync(archivo, "utf8");
      if (!FIJA_CONTRASENA.some((patron) => patron.test(codigo))) continue;
      if (codigo.includes(VERIFICACION)) continue;
      sinVerificar.push(archivo);
    }

    expect(sinVerificar).toEqual([]);
  });

  it("el barrido encuentra las dos pantallas que hoy fijan contraseñas", () => {
    // Sin esto, el test de arriba pasaría también si los patrones dejaran de
    // encontrar nada: cero archivos revisados da cero incumplimientos.
    const encontradas = archivosDeRutas().filter((a) => {
      const codigo = readFileSync(a, "utf8");
      return FIJA_CONTRASENA.some((patron) => patron.test(codigo));
    });

    expect(encontradas.sort()).toEqual([
      "app/routes/app/configuracion/contrasena.tsx",
      "app/routes/registro.tsx",
    ]);
  });

  it("la verificación corre en el servidor, nunca en el navegador", () => {
    // El módulo es .server.ts, así que React Router lo saca del bundle del
    // cliente. Si alguien lo renombrara, la contraseña saldría del formulario
    // antes de enviarse.
    expect(globSync("app/lib/validation/pwned*.ts")).toEqual(["app/lib/validation/pwned.server.ts"]);
  });
});
