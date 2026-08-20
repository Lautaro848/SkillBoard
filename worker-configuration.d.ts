// Regenerate with `npm run cf-typegen` once wrangler.jsonc has real values.
// Kept here manually too so typecheck works without network access to Cloudflare.
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  STORAGE_SIGNING_SECRET: string;
  ARCHIVOS: R2Bucket;
}
