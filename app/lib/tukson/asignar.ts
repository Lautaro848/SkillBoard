import { filtrarCandidatos, type Descarte } from "~/lib/tukson/filtro";
import { puntuar, type Desglose } from "~/lib/tukson/puntaje";
import { ORDEN_PRIORIDAD, type Candidato, type Prioridad, type Regla, type TareaParaAsignar } from "~/lib/tukson/tipos";

export interface Postulante {
  candidato: Candidato;
  desglose: Desglose;
}

// Por qué una tarea quedó sin asignar. Los tres motivos son distintos y piden
// cosas distintas de quien lee: contratar, esperar o revisar los datos. Antes
// se confundían todos en "sin candidatos", que además era falso cuando lo que
// faltaba eran horas (06-tukson-mejoras.md §1.2).
export type MotivoSinAsignar =
  | { clase: "sin_candidatos" }
  | { clase: "sin_horas"; podrianHacerla: number }
  | { clase: "bajo_umbral"; mejor: Postulante; umbral: number };

export interface ResultadoTarea {
  tarea: TareaParaAsignar;
  /** Vacío si nadie pasó el filtro duro. */
  postulantes: Postulante[];
  descartes: Descarte[];
  /** El elegido por puntaje. El paso 5 puede cambiarlo entre los mejores 5. */
  elegido: Postulante | null;
  /** Solo cuando `elegido` es null. */
  motivo: MotivoSinAsignar | null;
  /** Cómo se resolvió un empate, en castellano. Null si no hubo empate. */
  desempate: string | null;
}

const DURACION_POR_DEFECTO_MIN = 60;

// --- Umbral mínimo de puntaje (§1.3) ------------------------------------
//
// Un candidato de 20 sobre 100 no es una recomendación: es lo único que había.
// Presentarlo como propuesta hace que el usuario deje de confiar en las que sí
// son buenas. Por debajo del umbral la tarea no se asigna sola; se muestra el
// mejor disponible como sugerencia, con su puntaje a la vista.
export interface Umbrales {
  general: number;
  critica: number;
}

export const UMBRALES_POR_DEFECTO: Umbrales = { general: 45, critica: 60 };

export function umbralDe(prioridad: Prioridad, umbrales: Umbrales): number {
  // Más exigente en las críticas: ahí el costo de equivocarse es mayor.
  return prioridad === "critica" ? umbrales.critica : umbrales.general;
}

// --- Desempate (§1.1) ----------------------------------------------------
//
// `Array.prototype.sort` es estable, así que ante dos puntajes iguales ganaba
// siempre el que la base devolvía primero: un favoritismo sistemático que
// nadie eligió y que nadie veía. Se desempata por criterios explicables, y el
// último —el legajo— garantiza que dos corridas iguales den lo mismo.
const EMPATE = 0.01;

function compararPostulantes(a: Postulante, b: Postulante): number {
  const porPuntaje = b.desglose.total - a.desglose.total;
  if (Math.abs(porPuntaje) >= EMPATE) return porPuntaje;

  const porCarga = a.candidato.cargaMin - b.candidato.cargaMin;
  if (porCarga !== 0) return porCarga;

  const porRotacion = a.candidato.asignacionesUltimos7Dias - b.candidato.asignacionesUltimos7Dias;
  if (porRotacion !== 0) return porRotacion;

  return a.candidato.idInterno.localeCompare(b.candidato.idInterno, "es-AR");
}

const nombreDe = (c: Candidato) => `${c.nombre} ${c.apellido}`;

// El desempate se explica: "empataron en 87,4; se eligió a Ana porque tiene
// menos carga hoy". Sin esto, la decisión existe pero es invisible.
function explicarDesempate(ganador: Postulante, segundo: Postulante | undefined): string | null {
  if (!segundo || Math.abs(ganador.desglose.total - segundo.desglose.total) >= EMPATE) return null;

  const puntaje = ganador.desglose.total.toLocaleString("es-AR");
  const g = ganador.candidato;
  const s = segundo.candidato;
  const cabecera = `${nombreDe(g)} y ${nombreDe(s)} empataron en ${puntaje}.`;

  if (g.cargaMin !== s.cargaMin) {
    return `${cabecera} Se eligió a ${nombreDe(g)} porque tiene menos trabajo asignado hoy (${g.cargaMin} contra ${s.cargaMin} minutos).`;
  }
  if (g.asignacionesUltimos7Dias !== s.asignacionesUltimos7Dias) {
    return `${cabecera} Se eligió a ${nombreDe(g)} porque recibió menos tareas esta semana (${g.asignacionesUltimos7Dias} contra ${s.asignacionesUltimos7Dias}).`;
  }
  return `${cabecera} Están parejos en carga y en tareas de la semana, así que se eligió por orden de legajo para que el resultado sea siempre el mismo.`;
}

// --- Capacidad del lote (§1.2) -------------------------------------------

export interface CapacidadLote {
  minutosPedidos: number;
  minutosDisponibles: number;
  /** 0 si alcanza. */
  minutosFaltantes: number;
  alcanza: boolean;
  tareas: number;
}

const enHoras = (minutos: number) =>
  (minutos / 60).toLocaleString("es-AR", { maximumFractionDigits: 1 });

export function evaluarCapacidad(tareas: TareaParaAsignar[], empleados: Candidato[]): CapacidadLote {
  const minutosPedidos = tareas.reduce(
    (s, t) => s + (t.duracionEstimadaMin ?? DURACION_POR_DEFECTO_MIN),
    0,
  );

  // Solo cuenta quien puede trabajar hoy, y solo las horas que le quedan
  // libres: alguien con la jornada ya comprometida no suma capacidad.
  const minutosDisponibles = empleados
    .filter((e) => e.estado === "activo")
    .reduce((s, e) => s + Math.max(e.capacidadMin - e.cargaMin, 0), 0);

  const minutosFaltantes = Math.max(minutosPedidos - minutosDisponibles, 0);

  return {
    minutosPedidos,
    minutosDisponibles,
    minutosFaltantes,
    alcanza: minutosFaltantes === 0,
    tareas: tareas.length,
  };
}

// El aviso que va arriba de todo cuando el día está sobrevendido. Ningún
// algoritmo reparte seis tareas de 240 minutos entre tres personas que tienen
// 240 cada una: lo que falta no es reparto, es gente.
export function avisoDeCapacidad(c: CapacidadLote): string | null {
  if (c.alcanza) return null;

  return (
    `Las ${c.tareas} tareas suman ${enHoras(c.minutosPedidos)} horas y el equipo disponible tiene ` +
    `${enHoras(c.minutosDisponibles)}. Faltan ${enHoras(c.minutosFaltantes)} horas-persona. ` +
    "Las tareas que queden sin asignar es por falta de horas, no por falta de idoneidad."
  );
}

// Orden de asignación: por prioridad de la tarea y, a igual prioridad, la que
// tiene menos candidatos disponibles primero. Así las tareas más restringidas
// consiguen a su gente antes de que se la lleve otra (04-tukson.md §2, nota
// sobre el reparto equilibrado).
export function asignarLote(
  tareas: TareaParaAsignar[],
  empleados: Candidato[],
  reglas: Regla[],
  hoy = new Date(),
  umbrales: Umbrales = UMBRALES_POR_DEFECTO,
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
    const minutos = tarea.duracionEstimadaMin ?? DURACION_POR_DEFECTO_MIN;

    const postulantes = candidatos
      .map((c) => ({ candidato: c, desglose: puntuar(c, tarea, reglas, hoy) }))
      .sort(compararPostulantes);

    const guardar = (elegido: Postulante | null, motivo: MotivoSinAsignar | null, desempate: string | null) =>
      resultados.push({ tarea, postulantes, descartes, elegido, motivo, desempate });

    if (postulantes.length === 0) {
      guardar(null, { clase: "sin_candidatos" }, null);
      continue;
    }

    // La jornada es un límite real, no una preferencia. Antes solo restaba
    // puntos, así que el sistema seguía asignando por encima de la capacidad
    // y el reparto era una ficción.
    const conHoras = postulantes.filter(
      (p) => p.candidato.capacidadMin - p.candidato.cargaMin >= minutos,
    );

    if (conHoras.length === 0) {
      guardar(null, { clase: "sin_horas", podrianHacerla: postulantes.length }, null);
      continue;
    }

    const mejor = conHoras[0];
    const umbral = umbralDe(tarea.prioridad, umbrales);

    if (mejor.desglose.total < umbral) {
      guardar(null, { clase: "bajo_umbral", mejor, umbral }, null);
      continue;
    }

    // La disponibilidad del elegido baja para las tareas siguientes del
    // mismo lote: es lo que reparte el trabajo en cascada.
    carga.set(mejor.candidato.id, (carga.get(mejor.candidato.id) ?? 0) + minutos);
    guardar(mejor, null, explicarDesempate(mejor, conHoras[1]));
  }

  return resultados;
}

// Los cinco mejores son los únicos que ve el modelo en el paso 5.
export function mejores(postulantes: Postulante[], cantidad = 5): Postulante[] {
  return postulantes.slice(0, cantidad);
}

// Por qué no se asignó, dicho para una persona. Cada motivo pide algo
// distinto: contratar, esperar a mañana o revisar los datos de la gente.
export function explicarMotivo(
  motivo: MotivoSinAsignar,
  sinCandidatos: string,
): string {
  switch (motivo.clase) {
    case "sin_candidatos":
      return sinCandidatos;
    case "sin_horas":
      return `Podrían hacerla ${motivo.podrianHacerla} ${motivo.podrianHacerla === 1 ? "persona" : "personas"}, pero ninguna tiene horas libres hoy.`;
    case "bajo_umbral": {
      const { mejor, umbral } = motivo;
      const faltan = mejor.desglose.detalle.aptitudesQueFaltan.length;
      const porque =
        faltan > 0
          ? `no tiene ${faltan === 1 ? "una de las aptitudes requeridas" : `${faltan} de las aptitudes requeridas`}`
          : "no llega por experiencia previa ni por disponibilidad";
      return (
        `El mejor candidato es ${nombreDe(mejor.candidato)} y alcanza ${mejor.desglose.total.toLocaleString("es-AR")} de 100, ` +
        `por debajo del mínimo de ${umbral} para asignar sola una tarea de esta prioridad, porque ${porque}. ` +
        "Podés asignársela igual a mano si conocés el caso."
      );
    }
  }
}

export interface ResumenReparto {
  tareasAsignadas: number;
  tareasSinCandidatos: number;
  tareasSinHoras: number;
  tareasBajoUmbral: number;
  personas: number;
  cargaMaxima: { nombre: string; minutos: number; capacidad: number } | null;
}

export function resumirReparto(resultados: ResultadoTarea[]): ResumenReparto {
  const minutosPorPersona = new Map<string, { nombre: string; minutos: number; capacidad: number }>();

  for (const r of resultados) {
    if (!r.elegido) continue;
    const c = r.elegido.candidato;
    const actual = minutosPorPersona.get(c.id) ?? {
      nombre: nombreDe(c),
      minutos: c.cargaMin,
      capacidad: c.capacidadMin,
    };
    actual.minutos += r.tarea.duracionEstimadaMin ?? DURACION_POR_DEFECTO_MIN;
    minutosPorPersona.set(c.id, actual);
  }

  const cargas = [...minutosPorPersona.values()].sort((a, b) => b.minutos - a.minutos);
  const cuantos = (clase: MotivoSinAsignar["clase"]) =>
    resultados.filter((r) => r.motivo?.clase === clase).length;

  return {
    tareasAsignadas: resultados.filter((r) => r.elegido).length,
    tareasSinCandidatos: cuantos("sin_candidatos"),
    tareasSinHoras: cuantos("sin_horas"),
    tareasBajoUmbral: cuantos("bajo_umbral"),
    personas: minutosPorPersona.size,
    cargaMaxima: cargas[0] ?? null,
  };
}
