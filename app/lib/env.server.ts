import type { AppLoadContext } from "react-router";

export interface EntornoSkillBoard {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
}

// Valores por defecto del proyecto de Supabase. Son las MISMAS dos claves
// públicas que ya están en wrangler.jsonc: la URL del proyecto y la anon key,
// que está pensada para viajar al navegador y no da acceso a nada por sí sola
// — todo lo protege RLS (docs/02-modelo-de-datos.md §1).
//
// Están acá para que el proyecto arranque sin configuración en cualquier
// hosting. Un despliegue real puede pisarlas con variables de entorno.
//
// SUPABASE_SERVICE_ROLE_KEY y RESEND_API_KEY NO tienen default a propósito:
// esas sí son secretas y solo pueden venir por variable de entorno.
const PUBLICOS = {
  SUPABASE_URL: "https://bdufwbssueduudhbwzim.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkdWZ3YnNzdWVkdXVkaGJ3emltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTc0ODMsImV4cCI6MjEwMjgzMzQ4M30.tbm6hVRmzBNzhaIm0ml7RHg4-jGIv6k0-WOgGRG0thg",
} as const;

// En Cloudflare Workers las variables llegan por el contexto de la request
// (no existe process.env); en Node — Vercel, Hostinger, `npm run dev` — llegan
// por process.env. Esta función es lo único que sabe la diferencia, así que
// el resto del código corre igual en cualquiera de los tres.
export function getEnv(context?: AppLoadContext): EntornoSkillBoard {
  const cloudflareEnv = (context as { cloudflare?: { env?: Partial<EntornoSkillBoard> } } | undefined)
    ?.cloudflare?.env;

  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

  const leer = (clave: keyof EntornoSkillBoard): string =>
    cloudflareEnv?.[clave] || nodeEnv[clave] || (PUBLICOS as Partial<EntornoSkillBoard>)[clave] || "";

  return {
    SUPABASE_URL: leer("SUPABASE_URL"),
    SUPABASE_ANON_KEY: leer("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: leer("SUPABASE_SERVICE_ROLE_KEY"),
    RESEND_API_KEY: leer("RESEND_API_KEY"),
  };
}
