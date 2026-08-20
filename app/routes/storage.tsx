import { verificarFirma } from "~/lib/storage.server";
import type { Route } from "./+types/storage";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const key = params["*"];
  const url = new URL(request.url);

  const valida = await verificarFirma(
    context.cloudflare.env,
    key,
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
  );
  if (!valida) return new Response("Enlace vencido o inválido", { status: 403 });

  const objeto = await context.cloudflare.env.ARCHIVOS.get(key);
  if (!objeto) return new Response("No encontrado", { status: 404 });

  return new Response(objeto.body, {
    headers: {
      "Content-Type": objeto.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
}
