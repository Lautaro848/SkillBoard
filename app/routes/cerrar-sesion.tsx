import { redirect } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/cerrar-sesion";

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request, context);
  await supabase.auth.signOut();
  throw redirect("/iniciar-sesion", { headers });
}
