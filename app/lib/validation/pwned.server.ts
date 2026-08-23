// Verificación contra Pwned Passwords de HaveIBeenPwned, con k-anonymity.
//
// Reemplaza a la lista local de 10.000 contraseñas comunes que había antes y
// que resultó inalcanzable (ver contrasena.test.ts). Este servicio cubre miles
// de millones de contraseñas aparecidas en filtraciones reales, es gratuito,
// no pide clave y no tiene límite de peticiones.
//
// Cómo evita mandar la contraseña a un tercero:
//
//   1. Se calcula el SHA-1 de la contraseña.
//   2. Se envían SOLO los primeros 5 caracteres del hash.
//   3. La API responde con TODOS los sufijos que empiezan con ese prefijo
//      (entre 300 y 900 aproximadamente), y el sufijo propio se busca acá.
//
// El servicio nunca ve la contraseña ni el hash completo, y no puede saber
// cuál de los cientos de resultados era el consultado. El SHA-1 acá no
// protege nada por sí mismo —es el protocolo que fija HIBP— y no tiene nada
// que ver con cómo se guarda la contraseña, de lo que se encarga Supabase
// Auth con bcrypt.
//
// Este módulo es .server.ts: nunca puede llegar al navegador. Que el navegador
// consultara filtraciones significaría que la contraseña sale del formulario
// antes de enviarse.

const API = "https://api.pwnedpasswords.com/range/";

// Un registro es una acción que la persona está esperando. Si HIBP no
// contesta en este tiempo, se sigue sin la comprobación: más vale una cuenta
// creada con una contraseña que quizá esté filtrada, que una persona que no
// puede registrarse porque un servicio ajeno está caído.
const TIEMPO_LIMITE_MS = 2500;

export type ResultadoFiltracion =
  | { estado: "filtrada"; veces: number }
  | { estado: "limpia" }
  // Fallo del servicio: no se sabe. Quien llama tiene que dejar pasar.
  | { estado: "sin_respuesta"; motivo: string };

async function sha1Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-1", datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function revisarFiltraciones(password: string): Promise<ResultadoFiltracion> {
  let prefijo: string;
  let sufijo: string;

  try {
    const hash = await sha1Hex(password);
    prefijo = hash.slice(0, 5);
    sufijo = hash.slice(5);
  } catch (e) {
    // crypto.subtle no debería faltar en ninguno de los tres destinos, pero
    // si falta, el registro no se cae por eso.
    return { estado: "sin_respuesta", motivo: `no se pudo calcular el hash: ${String(e)}` };
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${API}${prefijo}`, {
      headers: {
        // Rellena la respuesta con entradas falsas para que su tamaño no
        // delate cuántas coincidencias reales hay. Las falsas vienen con
        // contador 0 y se descartan abajo.
        "Add-Padding": "true",
        "User-Agent": "SkillBoard",
      },
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });
  } catch (e) {
    const motivo = e instanceof Error && e.name === "TimeoutError" ? "no respondió a tiempo" : String(e);
    return { estado: "sin_respuesta", motivo };
  }

  if (!respuesta.ok) {
    return { estado: "sin_respuesta", motivo: `respondió ${respuesta.status}` };
  }

  let cuerpo: string;
  try {
    cuerpo = await respuesta.text();
  } catch (e) {
    return { estado: "sin_respuesta", motivo: String(e) };
  }

  // Cada línea es SUFIJO:VECES. El sufijo viene en mayúsculas, pero se
  // compara sin distinguir por las dudas.
  for (const linea of cuerpo.split("\n")) {
    const corte = linea.indexOf(":");
    if (corte === -1) continue;

    if (linea.slice(0, corte).trim().toUpperCase() !== sufijo) continue;

    const veces = Number.parseInt(linea.slice(corte + 1).trim(), 10);
    // Contador 0 = entrada de relleno del Add-Padding, no una filtración.
    if (!Number.isFinite(veces) || veces <= 0) return { estado: "limpia" };
    return { estado: "filtrada", veces };
  }

  return { estado: "limpia" };
}

// El mensaje que ve la persona. Dice qué pasó, aclara que no es que hayan
// entrado a su cuenta, y dice qué hacer.
export function mensajeFiltrada(veces: number): string {
  return (
    `Esta contraseña aparece ${veces.toLocaleString("es-AR")} ${veces === 1 ? "vez" : "veces"} ` +
    "en filtraciones de datos públicas, así que está en las listas que se usan para adivinar contraseñas. " +
    "No significa que tu cuenta esté comprometida, pero conviene elegir otra: usá una que no hayas usado en ningún otro sitio."
  );
}

// La comprobación tal como la usan las pantallas: devuelve el mensaje de
// error, o null si se puede seguir. Un fallo del servicio deja pasar y queda
// registrado en el log del servidor (Cloudflare Workers Logs / Vercel Runtime
// Logs), donde se puede ver si empieza a fallar seguido.
export async function motivoContrasenaFiltrada(password: string): Promise<string | null> {
  const resultado = await revisarFiltraciones(password);

  if (resultado.estado === "filtrada") return mensajeFiltrada(resultado.veces);

  if (resultado.estado === "sin_respuesta") {
    console.warn(
      `[pwned] No se pudo verificar la contraseña contra HaveIBeenPwned (${resultado.motivo}). ` +
        "Se aceptó sin verificar para no bloquear a la persona.",
    );
  }

  return null;
}
