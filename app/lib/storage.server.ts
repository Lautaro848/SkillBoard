import type { SupabaseClient } from "@supabase/supabase-js";

// Archivos en Supabase Storage (bucket privado `archivos`, migración 0007).
//
// Antes esto era Cloudflare R2 con una ruta propia `/storage/*` firmada con
// HMAC a mano. Se cambió por dos motivos: R2 ataba el proyecto a Cloudflare
// (Supabase Storage anda igual en Vercel, Hostinger o Workers), y Supabase
// ya trae URLs firmadas de vida corta, así que se borró código de firma
// propio en vez de mantenerlo.
//
// Se guarda siempre la CLAVE del objeto en la base, nunca una URL completa
// (02-modelo-de-datos.md §6): un enlace filtrado vence solo y el proveedor
// se puede cambiar sin migrar datos.
//
// El cliente que se pasa es el de la sesión del usuario, así que las
// políticas por empresa del bucket se aplican solas — igual que con las
// tablas. Nunca usar el cliente de service_role acá.

const BUCKET = "archivos";

export async function subirObjeto(
  supabase: SupabaseClient,
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(key, data, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return key;
}

export async function borrarObjeto(supabase: SupabaseClient, key: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([key]);
  if (error) throw error;
}

// Vencimiento corto por defecto: 10 minutos, suficiente para que cargue una
// pantalla sin dejar el enlace utilizable indefinidamente si se comparte.
export async function urlFirmada(
  supabase: SupabaseClient,
  key: string,
  ttlSegundos = 600,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, ttlSegundos);
  // Un archivo que no está (borrado a mano, clave vieja) no debe romper la
  // pantalla entera: se devuelve null y el componente cae al avatar/estado
  // vacío que ya maneja ese caso.
  if (error) return null;
  return data.signedUrl;
}

// Varias claves en una sola llamada. Firmar de a una las fotos de un
// carrusel serían N pedidos HTTP para armar una pantalla; esto es uno solo.
// Las claves que fallan simplemente no entran al mapa.
export async function urlesFirmadas(
  supabase: SupabaseClient,
  keys: string[],
  ttlSegundos = 600,
): Promise<Map<string, string>> {
  const unicas = [...new Set(keys.filter(Boolean))];
  if (unicas.length === 0) return new Map();

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unicas, ttlSegundos);
  if (error || !data) return new Map();

  return new Map(
    data
      .filter((d) => d.signedUrl && !d.error)
      .map((d) => [d.path as string, d.signedUrl as string]),
  );
}
