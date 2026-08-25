import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { AppLoadContext } from "react-router";
import { getEnv } from "~/lib/env.server";

// Un cliente de Supabase por request, construido desde la cookie de sesión.
// PostgREST recibe el JWT del usuario y Postgres resuelve auth.uid() con él,
// así que las políticas RLS de 02-modelo-de-datos.md se aplican solas — ver
// 01-arquitectura-y-stack.md §5 para por qué este es el único camino
// permitido (nada de conexión TCP/Hyperdrive directa para datos generales).
export function createSupabaseServerClient(request: Request, context?: AppLoadContext) {
  const headers = new Headers();
  const env = getEnv(context);

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

// Un cliente sin cookies, para comprobar credenciales sin tocar la sesión que
// ya está abierta.
//
// Lo necesita el cambio de contraseña: la única forma de verificar la
// contraseña actual es intentar iniciar sesión con ella. Si eso se hiciera con
// el cliente de la request, un intento fallido —o incluso uno exitoso, que
// emite cookies nuevas— podría dejar a la persona afuera mientras cambia su
// contraseña. Acá los `Set-Cookie` no van a ninguna parte y la sesión en curso
// queda intacta.
export function createSupabaseAnonClient(context?: AppLoadContext) {
  const env = getEnv(context);
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

// Solo para el cron de vencimientos y el importador, en código de servidor
// que nunca es alcanzable desde el navegador. Saltea RLS — usar como bisturí.
export function createSupabaseServiceClient(context?: AppLoadContext) {
  const env = getEnv(context);
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
