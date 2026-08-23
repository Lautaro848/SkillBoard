import { reglasQueAplican } from "~/lib/tukson/reglas";
import type { Candidato, Regla, TareaParaAsignar } from "~/lib/tukson/tipos";

// Paso 4 — Puntaje. Determinista y reproducible (04-tukson.md §2).
//
// Cuando alguien pregunta "¿por qué él?", la respuesta es este desglose
// numérico, no una opinión del modelo. Por eso se guarda entero junto con la
// asignación.

export const TOPES = {
  aptitudes: 40,
  nivel: 20,
  historial: 15,
  disponibilidad: 15,
  departamento: 10,
  reglas: 10, // ±10
} as const;

export interface Desglose {
  aptitudes: number;
  nivel: number;
  historial: number;
  disponibilidad: number;
  departamento: number;
  reglas: number;
  total: number;
  /** Para mostrar en pantalla sin volver a calcular. */
  detalle: {
    aptitudesQueTiene: string[];
    aptitudesQueFaltan: string[];
    /** aptitudId → nivel, para poder escribir "hidráulica 4/5" sin recalcular. */
    nivelesPorAptitud: Record<string, number>;
    nivelPromedio: number | null;
    tareasSimilares: number;
    tareasCompletadas: number;
    cargaMin: number;
    capacidadMin: number;
    reglasAplicadas: { enunciado: string; peso: number }[];
  };
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export function puntuar(
  candidato: Candidato,
  tarea: TareaParaAsignar,
  reglas: Regla[],
  hoy = new Date(),
): Desglose {
  const requeridas = tarea.aptitudesRequeridas;
  const tiene = requeridas.filter((a) => a in candidato.aptitudes);
  const faltan = requeridas.filter((a) => !(a in candidato.aptitudes));

  // --- Coincidencia de aptitudes (0–40) --------------------------------
  // Una tarea sin aptitudes declaradas no puede discriminar por aptitud: se
  // da el componente completo a todos en vez de cero a todos, que sería lo
  // mismo pero achicando el rango útil del puntaje.
  const aptitudes =
    requeridas.length === 0 ? TOPES.aptitudes : (tiene.length / requeridas.length) * TOPES.aptitudes;

  // --- Nivel en esas aptitudes (0–20) ----------------------------------
  // Se normaliza el nivel como n/5 y no como (n-1)/4: alguien con nivel 1
  // sabe algo, y darle cero convertiría este componente en un segundo filtro
  // encubierto, que es justamente lo que el paso 3 tiene prohibido hacer.
  const nivelPromedio =
    tiene.length > 0 ? tiene.reduce((s, a) => s + candidato.aptitudes[a], 0) / tiene.length : null;
  const nivel =
    requeridas.length === 0
      ? TOPES.nivel
      : nivelPromedio === null
        ? 0
        : (nivelPromedio / 5) * TOPES.nivel;

  // --- Historial en tareas similares (0–15) ----------------------------
  // "Similares" = comparten al menos una aptitud con esta tarea.
  const similares = candidato.historial.filter((t) => t.aptitudes.some((a) => requeridas.includes(a)));
  const completadas = similares.filter((t) => t.completada).length;
  // Sin historial vale 7,5: neutro. Poner cero castigaría a quien recién
  // entra, y poner 15 premiaría no tener antecedentes.
  const historial =
    similares.length === 0 ? TOPES.historial / 2 : (completadas / similares.length) * TOPES.historial;

  // --- Disponibilidad del día (0–15) -----------------------------------
  // Este es el componente que evita que el mejor empleado se lleve las quince
  // tareas del día. Se recalcula después de cada asignación del lote.
  const capacidad = Math.max(candidato.capacidadMin, 1);
  const libre = Math.min(Math.max(capacidad - candidato.cargaMin, 0), capacidad);
  const disponibilidad = (libre / capacidad) * TOPES.disponibilidad;

  // --- Afinidad de departamento (0–10) ---------------------------------
  // El documento habla de "departamento relacionado", pero no hay un modelo
  // de relaciones entre departamentos todavía. Se resuelve así, y se deja
  // dicho: sin departamento sugerido no se discrimina; si coincide, completo;
  // si el empleado no tiene departamento cargado, el valor intermedio, porque
  // es un dato que falta y no un dato que contradice.
  const departamento = !tarea.departamentoSugeridoId
    ? TOPES.departamento
    : candidato.departamentoId === tarea.departamentoSugeridoId
      ? TOPES.departamento
      : candidato.departamentoId === null
        ? 4
        : 0;

  // --- Reglas de empresa (−10 a +10) -----------------------------------
  const aplicables = reglasQueAplican(reglas, candidato, tarea, hoy).filter(
    (r) => r.tipo === "preferencia" || r.tipo === "prioridad",
  );
  const suma = aplicables.reduce((s, r) => s + r.peso, 0);
  const reglasPuntos = Math.max(Math.min(suma, TOPES.reglas), -TOPES.reglas);

  const total = Math.max(
    Math.min(aptitudes + nivel + historial + disponibilidad + departamento + reglasPuntos, 100),
    0,
  );

  return {
    aptitudes: redondear(aptitudes),
    nivel: redondear(nivel),
    historial: redondear(historial),
    disponibilidad: redondear(disponibilidad),
    departamento: redondear(departamento),
    reglas: redondear(reglasPuntos),
    total: redondear(total),
    detalle: {
      aptitudesQueTiene: tiene,
      aptitudesQueFaltan: faltan,
      nivelesPorAptitud: Object.fromEntries(tiene.map((a) => [a, candidato.aptitudes[a]])),
      nivelPromedio: nivelPromedio === null ? null : redondear(nivelPromedio),
      tareasSimilares: similares.length,
      tareasCompletadas: completadas,
      cargaMin: candidato.cargaMin,
      capacidadMin: candidato.capacidadMin,
      reglasAplicadas: aplicables.map((r) => ({ enunciado: r.enunciado, peso: r.peso })),
    },
  };
}
