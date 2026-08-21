import { redirect } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export interface Sesion {
  supabase: ReturnType<typeof createSupabaseServerClient>["supabase"];
  userId: string;
  empresaId: string;
  rol: "propietario" | "administrador" | "supervisor" | "lector";
}

// Deriva empresaId y rol siempre de la sesión del servidor, nunca de algo
// que mande el cliente (02-modelo-de-datos.md §1, punto 3).
export async function requireSesion(request: Request, context: Parameters<typeof createSupabaseServerClient>[1]): Promise<Sesion> {
  const { supabase } = createSupabaseServerClient(request, context);
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw redirect("/iniciar-sesion");

  const { data: membresia } = await supabase
    .from("membresias")
    .select("empresa_id, rol")
    .eq("usuario_id", data.user.id)
    .eq("estado", "activa")
    .single();

  if (!membresia) throw redirect("/iniciar-sesion");

  return {
    supabase,
    userId: data.user.id,
    empresaId: membresia.empresa_id,
    rol: membresia.rol,
  };
}
