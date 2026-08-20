import type { AppLoadContext } from "react-router";

// Los objetos en R2 se guardan por su clave, nunca por una URL completa
// (02-modelo-de-datos.md §6): así una filtración de enlace deja de servir
// sola y el proveedor se puede cambiar sin migrar datos. Servimos los
// archivos por una ruta propia (`/storage/*`) firmada con HMAC y vencimiento
// corto, en vez de URLs presignadas nativas de R2/S3, para no sumar una
// dependencia solo para eso.

async function firmar(env: Env, key: string, exp: number): Promise<string> {
  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.STORAGE_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", secretKey, new TextEncoder().encode(`${key}:${exp}`));
  return btoa(String.fromCharCode(...new Uint8Array(firma)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function subirObjeto(
  context: AppLoadContext,
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
) {
  await context.cloudflare.env.ARCHIVOS.put(key, data, {
    httpMetadata: { contentType },
  });
  return key;
}

export async function borrarObjeto(context: AppLoadContext, key: string) {
  await context.cloudflare.env.ARCHIVOS.delete(key);
}

// Vencimiento corto por defecto: 10 minutos, suficiente para que cargue una
// pantalla sin dejar el enlace utilizable indefinidamente si se comparte.
export async function urlFirmada(
  context: AppLoadContext,
  key: string,
  ttlSegundos = 600,
): Promise<string> {
  const env = context.cloudflare.env;
  const exp = Math.floor(Date.now() / 1000) + ttlSegundos;
  const sig = await firmar(env, key, exp);
  return `/storage/${key}?exp=${exp}&sig=${sig}`;
}

export async function verificarFirma(env: Env, key: string, exp: string | null, sig: string | null) {
  if (!exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const esperada = await firmar(env, key, Number(exp));
  return esperada === sig;
}
