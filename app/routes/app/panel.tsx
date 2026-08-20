import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/panel";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context);
  const { count } = await supabase.from("empleados").select("*", { count: "exact", head: true });
  return { totalEmpleados: count ?? 0 };
}

// Fase 1 agrega el listado real de empleados; por ahora el panel solo
// confirma que la sesión y el aislamiento por empresa funcionan.
export default function Panel({ loaderData }: Route.ComponentProps) {
  if (loaderData.totalEmpleados === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">
          Todavía no cargaste empleados
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Podés sumarlos de a uno o importar una planilla. (Disponible en la Fase 1.)
        </p>
      </div>
    );
  }

  return <p>{loaderData.totalEmpleados} empleados cargados.</p>;
}
