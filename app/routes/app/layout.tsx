import { Form, NavLink, Outlet, redirect } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/layout";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context);
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw redirect("/iniciar-sesion");

  const { data: perfil } = await supabase.from("perfiles").select("nombre, apellido").eq("id", data.user.id).single();
  const { data: membresia } = await supabase
    .from("membresias")
    .select("empresas(nombre)")
    .eq("usuario_id", data.user.id)
    .eq("estado", "activa")
    .single();

  return { perfil, empresaNombre: (membresia?.empresas as unknown as { nombre: string } | null)?.nombre };
}

const NAV = [
  { to: "/panel", label: "Panel" },
  { to: "/empleados", label: "Empleados" },
  { to: "/configuracion/catalogos", label: "Configuración" },
  // Certificados, Objetivos, Tukson y Modo carrusel se habilitan en las
  // fases 2 a 5.
] as const;

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6">
        <p className="px-2 text-lg font-bold text-[var(--color-primary)]">SkillBoard</p>
        <p className="mt-1 px-2 text-xs text-[var(--color-text-muted)]">{loaderData.empresaNombre}</p>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-md px-2 py-1.5 text-sm ${isActive ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]" : "text-[var(--color-text)]"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Form method="post" action="/cerrar-sesion" className="mt-auto">
          <button type="submit" className="text-sm text-[var(--color-text-muted)] underline">
            Cerrar sesión
          </button>
        </Form>
      </aside>
      <main className="flex-1 px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
