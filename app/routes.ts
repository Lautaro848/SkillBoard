import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("registro", "routes/registro.tsx"),
  route("iniciar-sesion", "routes/iniciar-sesion.tsx"),
  route("cerrar-sesion", "routes/cerrar-sesion.tsx"),

  layout("routes/app/layout.tsx", [
    route("panel", "routes/app/panel.tsx"),
    route("configuracion/catalogos", "routes/app/configuracion/catalogos.tsx"),
    route("empleados", "routes/app/empleados/index.tsx"),
    route("empleados/nuevo", "routes/app/empleados/nuevo.tsx"),
    route("empleados/importar", "routes/app/empleados/importar.tsx"),
    route("empleados/:id/editar", "routes/app/empleados/editar.tsx"),
    route("empleados/:id", "routes/app/empleados/perfil.tsx"),
  ]),
] satisfies RouteConfig;
