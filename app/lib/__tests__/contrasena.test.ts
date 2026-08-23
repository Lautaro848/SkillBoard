import { describe, expect, it } from "vitest";
import { revisarReglas } from "~/lib/validation/contrasena";
import { checkPasswordStrength, registroSchema } from "~/lib/validation/auth";

const BUENA = "Tornillo-Verde-92!";

describe("reglas de contraseña", () => {
  it("enumera lo que falta, en texto y no como una barra de color", () => {
    expect(revisarReglas("hola").faltantes).toEqual([
      "Al menos 10 caracteres",
      "Una letra mayúscula",
      "Un número",
      "Un símbolo",
    ]);
  });

  it("acepta una contraseña que cumple las cinco reglas", () => {
    expect(revisarReglas(BUENA).ok).toBe(true);
  });

  it("el navegador y el servidor evalúan exactamente lo mismo", () => {
    // Si estas dos alguna vez se separan, la pantalla de registro miente:
    // dice que está todo bien y el servidor rechaza igual.
    for (const p of ["hola", "sinmayuscula1!", "SinNumero!!", "Sin-Simbolo1", BUENA]) {
      expect(checkPasswordStrength(p).reasons).toEqual(revisarReglas(p).faltantes);
    }
  });

  it("el registro rechaza una contraseña débil y acepta una que cumple", () => {
    const datos = {
      empresa: "Metalúrgica del Sur",
      nombre: "Lautaro",
      apellido: "Laborda",
      email: "alguien@ejemplo.com",
      password: "hola",
    };

    expect(registroSchema.safeParse(datos).success).toBe(false);
    expect(registroSchema.safeParse({ ...datos, password: BUENA }).success).toBe(true);
  });
});

// Acá había una comprobación contra `dumb-passwords`, la lista de las 10.000
// contraseñas más usadas. Se sacó, y este bloque guarda la razón para que
// nadie la vuelva a agregar pensando que suma algo.
//
// La cuenta, hecha sobre las 10.001 entradas de esa lista:
//
//   - 9.950 tienen menos de 10 caracteres, así que la regla de largo las
//     rechaza antes de llegar al diccionario.
//   - De las 51 que quedan, 45 no tienen ningún número.
//   - Las 6 que sobreviven son las de abajo, y ninguna tiene un símbolo.
//
// O sea: no existe ninguna contraseña que pase las cinco reglas y esté en la
// lista. La rama que consultaba el diccionario no podía ejecutarse nunca, y
// costaba 488 KB en el bundle. Peor: la pantalla de registro le mostraba a la
// persona un requisito ("no puede ser una de las más comunes") que en los
// hechos no se comprobaba.
//
// Lo que sí protege contra contraseñas filtradas es la opción de Supabase
// Auth contra HaveIBeenPwned, que mira miles de millones y no 10.000.
describe("por qué no hay lista de contraseñas comunes", () => {
  // Las 6 entradas de la lista que llegan más lejos: 10+ caracteres y un número.
  const LAS_QUE_MAS_SE_ACERCAN = [
    "1234567890",
    "1q2w3e4r5t",
    "charlie123",
    "postov1000",
    "primetime21",
    "quant4307s",
  ];

  it.each(LAS_QUE_MAS_SE_ACERCAN)("las reglas rechazan %s sin consultar ninguna lista", (comun) => {
    const { ok, faltantes } = revisarReglas(comun);
    expect(ok).toBe(false);
    expect(faltantes).toContain("Un símbolo");
  });
});
