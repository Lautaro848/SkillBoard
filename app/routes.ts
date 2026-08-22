import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("registro", "routes/registro.tsx"),
  route("iniciar-sesion", "routes/iniciar-sesion.tsx"),
  route("cerrar-sesion", "routes/cerrar-sesion.tsx"),

  // Fuera del layout de la aplicación a propósito: la TV no tiene menú, ni
  // sesión, ni forma de navegar a otra parte (03-modulos-y-alcance.md §6).
  route("tv/:token", "routes/tv.tsx"),
  route("tv/:token/datos", "routes/tv-datos.tsx"),

  layout("routes/app/layout.tsx", [
    route("panel", "routes/app/panel.tsx"),
    route("configuracion/catalogos", "routes/app/configuracion/catalogos.tsx"),
    route("configuracion/avisos", "routes/app/configuracion/avisos.tsx"),
    route("empleados", "routes/app/empleados/index.tsx"),
    route("empleados/nuevo", "routes/app/empleados/nuevo.tsx"),
    route("empleados/importar", "routes/app/empleados/importar.tsx"),
    route("empleados/:id/editar", "routes/app/empleados/editar.tsx"),
    route("empleados/:id/certificados/nuevo", "routes/app/empleados/certificado-nuevo.tsx"),
    route("empleados/:id", "routes/app/empleados/perfil.tsx"),
    route("certificados", "routes/app/certificados/index.tsx"),
    route("objetivos", "routes/app/objetivos/index.tsx"),
    route("carrusel", "routes/app/carrusel/index.tsx"),
    route("tukson", "routes/app/tukson/index.tsx"),
  ]),
] satisfies RouteConfig;
