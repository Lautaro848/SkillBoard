import { useEffect, useState } from "react";
import { Form, NavLink, Outlet, redirect, useLocation } from "react-router";
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

// Las tres que van al menú inferior del celular. La prioridad en móvil es
// consultar el perfil de alguien y revisar vencimientos
// (05-sistema-de-diseno.md §6), así que son esas y el resto va en "Más".
const PRINCIPALES = NAV.slice(0, 3);

// Sale del package.json en el build; acá se declara una sola vez para que el
// pie no repita el número a mano en cada pantalla.
const VERSION = "0.1.0";

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const { pathname } = useLocation();

  // Al navegar, el cajón se cierra solo. Si no, en el celular quedás mirando
  // el menú encima de la pantalla que acabás de abrir.
  useEffect(() => setCajonAbierto(false), [pathname]);

  // Escape cierra el cajón, igual que cualquier capa que tapa el contenido.
  useEffect(() => {
    if (!cajonAbierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setCajonAbierto(false);
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [cajonAbierto]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Primer elemento enfocable de la aplicación: quien navega con teclado
          no tiene que recorrer todo el menú en cada pantalla. */}
      <a href="#contenido" className="saltar text-menor font-medium text-primario">
        Saltar al contenido
      </a>

      {/* Barra superior: solo cuando el menú lateral no está fijo. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-borde-decorativo bg-superficie px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setCajonAbierto(true)}
          className="boton boton-secundario"
          aria-expanded={cajonAbierto}
          aria-controls="menu-lateral"
        >
          Menú
        </button>
        <div className="min-w-0">
          <p className="text-menor font-bold text-primario">SkillBoard</p>
          <p className="truncate text-auxiliar text-secundario">{loaderData.empresaNombre}</p>
        </div>
      </header>

      {/* Fondo que apaga el contenido detrás del cajón. Es un botón de verdad
          para que se pueda cerrar con teclado, no un div con onClick. */}
      {cajonAbierto && (
        <button
          type="button"
          onClick={() => setCajonAbierto(false)}
          aria-label="Cerrar el menú"
          className="fixed inset-0 z-30 bg-texto/40 lg:hidden"
        />
      )}

      {/* Menú lateral fijo desde 1024 px; cajón deslizante por debajo. */}
      <aside
        id="menu-lateral"
        className={`cajon-lateral fixed inset-y-0 left-0 z-40 flex flex-col border-r border-borde-decorativo bg-superficie px-4 py-6 transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          cajonAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="px-2 text-tarjeta font-bold text-primario">SkillBoard</p>
            <p className="mt-1 truncate px-2 text-auxiliar text-secundario">{loaderData.empresaNombre}</p>
          </div>
          <button
            type="button"
            onClick={() => setCajonAbierto(false)}
            className="boton boton-terciario lg:hidden"
          >
            Cerrar
          </button>
        </div>

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

      {/* pb-24 en celular deja lugar al menú inferior: sin eso, la última
          fila de cualquier lista queda tapada y no hay forma de llegar. */}
      <main id="contenido" className="flex-1 px-4 pb-24 pt-6 md:px-8 md:py-8 md:pb-8">
        <div className="mx-auto max-w-300">
          <Outlet />
        </div>
      </main>

      {/* Menú inferior del celular: las tres secciones principales y el resto
          detrás de "Más". Objetivos táctiles de 44 px, que los da .boton. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-borde-decorativo bg-superficie md:hidden"
        aria-label="Secciones principales"
      >
        {PRINCIPALES.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-11 items-center justify-center px-1 py-3 text-center text-auxiliar ${
                isActive ? "font-medium text-primario" : "text-secundario"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setCajonAbierto(true)}
          className="flex min-h-11 items-center justify-center px-1 py-3 text-auxiliar text-secundario"
          aria-expanded={cajonAbierto}
          aria-controls="menu-lateral"
        >
          Más
        </button>
      </nav>
    </div>
  );
}
