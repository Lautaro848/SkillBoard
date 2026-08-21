import { Link } from "react-router";

export interface DatoBarra {
  clave: string;
  etiqueta: string;
  valor: number;
  href?: string;
}

// Barras horizontales de una sola serie. Una sola serie no lleva leyenda: el
// título del bloque ya dice qué se está midiendo. La magnitud la lleva el
// largo, no el tono, así que todas las barras comparten color.
export function BarrasHorizontales({
  datos,
  sufijo,
}: {
  datos: DatoBarra[];
  // Texto que acompaña al número en el tooltip, p. ej. "empleados".
  sufijo: string;
}) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1);

  return (
    <ul className="flex flex-col gap-2">
      {datos.map((d) => {
        const ancho = (d.valor / maximo) * 100;
        return (
          <li key={d.clave} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3">
            <span className="truncate text-sm text-[var(--color-text)]" title={d.etiqueta}>
              {d.href ? (
                <Link to={d.href} className="hover:underline">
                  {d.etiqueta}
                </Link>
              ) : (
                d.etiqueta
              )}
            </span>
            <span className="flex items-center gap-2" title={`${d.etiqueta}: ${d.valor} ${sufijo}`}>
              {/* Riel apenas visible: marca la escala sin competir con el dato. */}
              <span className="relative h-4 flex-1 rounded-[4px] bg-[var(--color-dato-fondo)]">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--color-dato)]"
                  style={{ width: `${Math.max(ancho, d.valor > 0 ? 2 : 0)}%` }}
                />
              </span>
              {/* Etiqueta directa: el número al final de cada barra evita el eje. */}
              <span className="w-10 shrink-0 text-right text-sm tabular-nums text-[var(--color-text-muted)]">
                {d.valor}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
