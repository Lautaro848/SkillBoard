import { Link } from "react-router";

// Placeholder deliberado: la página pública completa (precios, antes/después,
// legales) es Fase 6 del plan (00-resumen-y-plan.md). Esto solo evita una
// ruta raíz vacía mientras tanto.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold text-[var(--color-text)]">SkillBoard</h1>
      <p className="text-[var(--color-text-muted)]">
        Sabé quién sabe hacer qué, no te quedes sin habilitaciones vencidas, y repartí el
        trabajo del día con criterio.
      </p>
      <div className="mt-2 flex gap-3">
        <Link
          to="/registro"
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)]"
        >
          Crear cuenta
        </Link>
        <Link
          to="/iniciar-sesion"
          className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)]"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
