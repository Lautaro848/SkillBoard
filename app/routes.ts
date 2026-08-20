import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("registro", "routes/registro.tsx"),
  route("iniciar-sesion", "routes/iniciar-sesion.tsx"),
  route("cerrar-sesion", "routes/cerrar-sesion.tsx"),

  layout("routes/app/layout.tsx", [
    route("panel", "routes/app/panel.tsx"),
  ]),
] satisfies RouteConfig;
