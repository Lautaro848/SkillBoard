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
  { to: "/certificados", label: "Certificados" },
  { to: "/objetivos", label: "Objetivos" },
  { to: "/tukson", label: "Tukson" },
  { to: "/carrusel", label: "Modo carrusel" },
  { to: "/configuracion/catalogos", label: "Configuración" },
] as const;

// Sale del package.json en el build; acá se declara una sola vez para que el
// pie no repita el número a mano en cada pantalla.
const VERSION = "0.1.0";

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen">
      {/* Primer elemento enfocable de la aplicación: quien navega con teclado
          no tiene que recorrer todo el menú en cada pantalla. */}
      <a href="#contenido" className="saltar text-menor font-medium text-primario">
        Saltar al contenido
      </a>

      {/* Menú lateral de 260 px y contenido a 1200 px como máximo
          (05-sistema-de-diseno.md §6). */}
      <aside className="flex w-65 shrink-0 flex-col border-r border-borde-decorativo bg-superficie px-4 py-6">
        <p className="px-2 text-tarjeta font-bold text-primario">SkillBoard</p>
        <p className="mt-1 px-2 text-auxiliar text-secundario">{loaderData.empresaNombre}</p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Secciones">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-control px-3 py-2 text-menor ${
                  isActive ? "bg-primario-claro font-medium text-primario" : "text-texto"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 pt-6">
          <Form method="post" action="/cerrar-sesion">
            <button type="submit" className="boton boton-terciario">
              Cerrar sesión
            </button>
          </Form>
          {/* La marca acompaña siempre, también en el pie (§8). Los enlaces
              legales se suman en la Fase 6, cuando esas páginas existan: no
              tiene sentido enlazar a algo que hoy daría 404. */}
          <p className="px-2 text-auxiliar text-secundario">SkillBoard · versión {VERSION}</p>
        </div>
      </aside>

      <main id="contenido" className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-300">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
