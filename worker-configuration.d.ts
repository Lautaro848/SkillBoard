// Regenerar con `npm run cf-typegen` si se agregan bindings de Cloudflare.
// Se mantiene a mano para que el typecheck funcione sin salida de red.
//
// Las variables se leen siempre por app/lib/env.server.ts (getEnv), que cae a
// process.env fuera de Workers — por eso el mismo código corre en Cloudflare,
// Vercel y Hostinger sin cambios.
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
}
