import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { AppLoadContext } from "react-router";

// One Supabase client per request, built from the session cookie. PostgREST
// receives the user's JWT and Postgres resolves auth.uid() with it, so the
// RLS policies from 02-modelo-de-datos.md apply on their own — see
// 01-arquitectura-y-stack.md §5 for why this is the only path allowed
// (no direct TCP/Hyperdrive connection for general data access).
export function createSupabaseServerClient(request: Request, context: AppLoadContext) {
  const headers = new Headers();
  const env = context.cloudflare.env;

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          headers.append("Set-Cookie", serializeCookieHeader(name, value, options));
        });
      },
    },
  });

  return { supabase, headers };
}

// Only for the expiration cron and the bulk importer, run in server code that
// is never reachable from the browser. Bypasses RLS — treat as a scalpel.
export function createSupabaseServiceClient(context: AppLoadContext) {
  const env = context.cloudflare.env;
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
