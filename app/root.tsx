import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";

import "./app.css";

// Las tipografías se sirven propias, no desde el CDN de Google: así no hay
// una llamada a un tercero con la IP de cada persona que abre la aplicación
// (05-sistema-de-diseno.md §2). Se precargan las dos que aparecen en el
// primer pintado; el resto de los pesos llegan con la hoja de estilos.
export const links: Route.LinksFunction = () => [
  {
    rel: "preload",
    href: "/fonts/inter-latin-400-normal.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
  {
    rel: "preload",
    href: "/fonts/manrope-latin-700-normal.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Ocurrió un error";
  let details = "No pudimos completar la acción. Probá de nuevo en unos minutos.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Página no encontrada" : "Ocurrió un error";
    details =
      error.status === 404
        ? "La página que buscás no existe o cambió de dirección."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-seccion font-semibold">{message}</h1>
      <p className="text-secundario">{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto rounded-control bg-texto p-4 text-left text-auxiliar text-white">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
