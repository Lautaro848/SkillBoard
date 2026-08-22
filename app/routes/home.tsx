import { Link } from "react-router";

// Placeholder deliberado: la página pública completa (precios, antes/después,
// legales) es Fase 6 del plan (00-resumen-y-plan.md). Esto solo evita una
// ruta raíz vacía mientras tanto.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-pantalla font-semibold text-texto">SkillBoard</h1>
      <p className="text-secundario">
        Sabé quién sabe hacer qué, no te quedes sin habilitaciones vencidas, y repartí el
        trabajo del día con criterio.
      </p>
      <div className="mt-2 flex gap-3">
        <Link
          to="/registro"
          className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
        >
          Crear cuenta
        </Link>
        <Link
          to="/iniciar-sesion"
          className="rounded-control border border-borde-decorativo px-4 py-2 text-menor font-medium text-texto"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
