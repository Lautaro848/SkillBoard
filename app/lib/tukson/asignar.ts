import { filtrarCandidatos, type Descarte } from "~/lib/tukson/filtro";
import { puntuar, type Desglose } from "~/lib/tukson/puntaje";
import { ORDEN_PRIORIDAD, type Candidato, type Regla, type TareaParaAsignar } from "~/lib/tukson/tipos";

export interface Postulante {
  candidato: Candidato;
  desglose: Desglose;
}

export interface ResultadoTarea {
  tarea: TareaParaAsignar;
  /** Vacío si nadie pasó el filtro duro. */
  postulantes: Postulante[];
  descartes: Descarte[];
  /** El elegido por puntaje. El paso 5 puede cambiarlo entre los mejores 5. */
  elegido: Postulante | null;
}

const DURACION_POR_DEFECTO_MIN = 60;

// Orden de asignación: por prioridad de la tarea y, a igual prioridad, la que
// tiene menos candidatos disponibles primero. Así las tareas más restringidas
// consiguen a su gente antes de que se la lleve otra (04-tukson.md §2, nota
// sobre el reparto equilibrado).
export function asignarLote(
  tareas: TareaParaAsignar[],
  empleados: Candidato[],
  reglas: Regla[],
  hoy = new Date(),
): ResultadoTarea[] {
  // La carga se va acumulando durante el lote, así que se trabaja sobre una
  // copia: la función no toca lo que le pasaron.
  const carga = new Map(empleados.map((e) => [e.id, e.cargaMin]));
  const conCarga = (e: Candidato): Candidato => ({ ...e, cargaMin: carga.get(e.id) ?? e.cargaMin });

  // Se cuenta cuántos candidatos tiene cada tarea antes de asignar nada, para
  // poder ordenar por restricción sin que el orden dependa de sí mismo.
  const candidatosPorTarea = new Map(
    tareas.map((t) => [t.id, filtrarCandidatos(empleados, t, reglas, hoy).candidatos.length]),
  );

  const ordenadas = [...tareas].sort((a, b) => {
    const porPrioridad = ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad];
    if (porPrioridad !== 0) return porPrioridad;
    return (candidatosPorTarea.get(a.id) ?? 0) - (candidatosPorTarea.get(b.id) ?? 0);
  });

  const resultados: ResultadoTarea[] = [];

  for (const tarea of ordenadas) {
    const { candidatos, descartes } = filtrarCandidatos(empleados.map(conCarga), tarea, reglas, hoy);

    const postulantes = candidatos
      .map((c) => ({ candidato: c, desglose: puntuar(c, tarea, reglas, hoy) }))
      .sort((a, b) => b.desglose.total - a.desglose.total);

    const elegido = postulantes[0] ?? null;

    if (elegido) {
      // La disponibilidad del elegido baja para las tareas siguientes del
      // mismo lote: es lo que reparte el trabajo en cascada.
      const minutos = tarea.duracionEstimadaMin ?? DURACION_POR_DEFECTO_MIN;
      carga.set(elegido.candidato.id, (carga.get(elegido.candidato.id) ?? 0) + minutos);
    }

    resultados.push({ tarea, postulantes, descartes, elegido });
  }

  return resultados;
}

// Los cinco mejores son los únicos que ve el modelo en el paso 5.
export function mejores(postulantes: Postulante[], cantidad = 5): Postulante[] {
  return postulantes.slice(0, cantidad);
}

export interface ResumenReparto {
  tareasAsignadas: number;
  tareasSinCandidatos: number;
  personas: number;
  cargaMaxima: { nombre: string; minutos: number; capacidad: number } | null;
}

export function resumirReparto(resultados: ResultadoTarea[]): ResumenReparto {
  const minutosPorPersona = new Map<string, { nombre: string; minutos: number; capacidad: number }>();

  for (const r of resultados) {
    if (!r.elegido) continue;
    const c = r.elegido.candidato;
    const actual = minutosPorPersona.get(c.id) ?? {
      nombre: `${c.nombre} ${c.apellido}`,
      minutos: c.cargaMin,
      capacidad: c.capacidadMin,
    };
    actual.minutos += r.tarea.duracionEstimadaMin ?? DURACION_POR_DEFECTO_MIN;
    minutosPorPersona.set(c.id, actual);
  }

  const cargas = [...minutosPorPersona.values()].sort((a, b) => b.minutos - a.minutos);

  return {
    tareasAsignadas: resultados.filter((r) => r.elegido).length,
    tareasSinCandidatos: resultados.filter((r) => !r.elegido).length,
    personas: minutosPorPersona.size,
    cargaMaxima: cargas[0] ?? null,
  };
}
