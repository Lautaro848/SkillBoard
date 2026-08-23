import type { Candidato, Regla, TareaParaAsignar } from "~/lib/tukson/tipos";

// ¿Esta regla habla de esta persona y de esta tarea?
//
// Las condiciones se combinan con Y: una regla sin condiciones aplica a todo
// el mundo, y cada condición presente estrecha el alcance. Una regla vencida
// no aplica: la vigencia es lo que permite decir "durante la parada de
// planta" sin que quede pegada para siempre (04-tukson.md §2, paso 7).
export function reglaAplica(
  regla: Regla,
  candidato: Candidato,
  tarea: TareaParaAsignar,
  hoy = new Date(),
): boolean {
  if (!regla.activa) return false;

  const c = regla.condiciones ?? {};

  if (c.vigenciaHasta) {
    const limite = new Date(`${c.vigenciaHasta.slice(0, 10)}T23:59:59Z`).getTime();
    if (hoy.getTime() > limite) return false;
  }

  if (c.empleadoId && c.empleadoId !== candidato.id) return false;
  if (c.departamentoId && c.departamentoId !== candidato.departamentoId) return false;
  if (c.puestoId && c.puestoId !== candidato.puestoId) return false;
  if (c.aptitudId && !(c.aptitudId in candidato.aptitudes)) return false;

  if (c.tareaContiene) {
    const texto = tarea.titulo.toLocaleLowerCase("es-AR");
    if (!texto.includes(c.tareaContiene.toLocaleLowerCase("es-AR"))) return false;
  }

  return true;
}

export function reglasQueAplican(
  reglas: Regla[],
  candidato: Candidato,
  tarea: TareaParaAsignar,
  hoy = new Date(),
): Regla[] {
  return reglas.filter((r) => reglaAplica(r, candidato, tarea, hoy));
}
