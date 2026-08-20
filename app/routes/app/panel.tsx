import { Link } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import type { Route } from "./+types/panel";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context);
  const { count } = await supabase.from("empleados").select("*", { count: "exact", head: true }).is("eliminado_en", null);
  return { totalEmpleados: count ?? 0 };
}

// El panel de rendimiento real (objetivos, índice de cumplimiento) es la
// Fase 3. Por ahora confirma que la sesión y el aislamiento por empresa
// funcionan, sin inventar números ni gráficos de ejemplo (Regla 1).
export default function Panel({ loaderData }: Route.ComponentProps) {
  if (loaderData.totalEmpleados === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">Todavía no cargaste empleados</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Podés sumarlos de a uno o importar una planilla (la importación llega en una próxima etapa).
        </p>
        <Link
          to="/empleados/nuevo"
          className="mt-4 inline-block rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]"
        >
          Cargar el primer empleado
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-6">
      <p className="text-sm text-[var(--color-text-muted)]">Empleados activos</p>
      <Link to="/empleados" className="text-3xl font-semibold text-[var(--color-primary)]">
        {loaderData.totalEmpleados}
      </Link>
    </div>
  );
}
