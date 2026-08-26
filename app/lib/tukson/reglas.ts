import type {
  Candidato,
  CondicionesRegla,
  Regla,
  TareaParaAsignar,
  TipoRegla,
} from "~/lib/tukson/tipos";

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

  // --- Condiciones sobre la PERSONA ---
  if (c.empleadoId && c.empleadoId !== candidato.id) return false;
  if (c.departamentoId && c.departamentoId !== candidato.departamentoId) return false;
  if (c.puestoId && c.puestoId !== candidato.puestoId) return false;
  if (c.aptitudId && !(c.aptitudId in candidato.aptitudes)) return false;

  // --- Condiciones sobre la TAREA ---
  // Acá está la diferencia que hace que la memoria generalice: la regla habla
  // de lo que la tarea EXIGE, no de cómo se llama. "Juan queda excluido de las
  // tareas que requieran trabajo en altura" se dispara con "Subir al techo",
  // "Pintar la fachada" y "Revisar el tanque" por igual.
  if (c.tareaRequiereAptitudId && !tarea.aptitudesRequeridas.includes(c.tareaRequiereAptitudId)) {
    return false;
  }
  if (
    c.tareaRequiereCertificadoId &&
    !tarea.certificadosRequeridos.includes(c.tareaRequiereCertificadoId)
  ) {
    return false;
  }

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

// --- Decir en castellano a qué aplica una regla --------------------------
//
// Las condiciones se guardan como ids: { empleadoId: "uuid", 
// tareaRequiereAptitudId: "uuid" }. Mostrarlas así en la pantalla de reglas
// obliga a la persona a confiar en que el sistema entendió lo que ella quiso
// decir, sin poder verificarlo. Y una regla que nadie puede leer es una regla
// que nadie va a corregir cuando esté mal.

export interface NombresParaReglas {
  empleado: (id: string) => string;
  departamento: (id: string) => string;
  puesto: (id: string) => string;
  aptitud: (id: string) => string;
  certificado: (id: string) => string;
}

const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function describirCondiciones(
  condiciones: CondicionesRegla | null | undefined,
  nombres: NombresParaReglas,
): string {
  const c = condiciones ?? {};

  // A quién.
  const aQuien: string[] = [];
  if (c.empleadoId) aQuien.push(nombres.empleado(c.empleadoId));
  if (c.departamentoId) aQuien.push(`el departamento ${nombres.departamento(c.departamentoId)}`);
  if (c.puestoId) aQuien.push(`el puesto ${nombres.puesto(c.puestoId)}`);
  if (c.aptitudId) aQuien.push(`quien tenga cargada la aptitud ${nombres.aptitud(c.aptitudId)}`);

  // En qué tareas.
  const enQueTareas: string[] = [];
  if (c.tareaRequiereAptitudId) {
    enQueTareas.push(`requieran la aptitud ${nombres.aptitud(c.tareaRequiereAptitudId)}`);
  }
  if (c.tareaRequiereCertificadoId) {
    enQueTareas.push(`requieran ${nombres.certificado(c.tareaRequiereCertificadoId)}`);
  }
  if (c.tareaContiene) enQueTareas.push(`digan «${c.tareaContiene}» en el título`);

  const partes: string[] = [];
  partes.push(aQuien.length > 0 ? `Se aplica a ${aQuien.join(" y ")}` : "Se aplica a todo el equipo");
  if (enQueTareas.length > 0) partes.push(`en las tareas que ${enQueTareas.join(" y ")}`);
  else partes.push("en cualquier tarea");

  let texto = partes.join(", ");
  if (c.vigenciaHasta) texto += `, hasta el ${fecha(c.vigenciaHasta)}`;
  else texto += ", hasta nuevo aviso";

  return `${texto}.`;
}

// Una regla escrita por título es frágil: depende de que alguien elija las
// mismas palabras mañana. Se avisa para que se pueda cambiar por el requisito.
export function esFragilPorTitulo(condiciones: CondicionesRegla | null | undefined): boolean {
  const c = condiciones ?? {};
  return Boolean(c.tareaContiene) && !c.tareaRequiereAptitudId && !c.tareaRequiereCertificadoId;
}

// --- Contradicción con un certificado vigente ---------------------------
//
// Si Juan tiene el carnet de altura vigente hasta 2027 y alguien lo marca como
// no apto para trabajar en altura, una de las dos cosas está mal, y el sistema
// es el único que ve las dos a la vez.
//
// No se bloquea: puede haber un motivo real y reciente —una lesión, una
// indicación médica— que el legajo todavía no refleja. Se avisa, que es lo que
// convierte a esto en información útil para el área de seguridad en vez de en
// un obstáculo (06-tukson-mejoras.md §1.4, nota de seguridad).
export interface Contradiccion {
  empleado: string;
  certificado: string;
  vigenteHasta: string | null;
}

export function contradiceCertificadoVigente(
  tipo: TipoRegla,
  condiciones: CondicionesRegla,
  candidatos: Candidato[],
  nombreCertificado: (id: string) => string,
): Contradiccion | null {
  if (tipo !== "exclusion") return null;

  const tipoId = condiciones.tareaRequiereCertificadoId;
  if (!tipoId || !condiciones.empleadoId) return null;

  const persona = candidatos.find((c) => c.id === condiciones.empleadoId);
  if (!persona || !persona.certificadosVigentes.includes(tipoId)) return null;

  return {
    empleado: `${persona.nombre} ${persona.apellido}`,
    certificado: nombreCertificado(tipoId),
    vigenteHasta: persona.vencimientoDeVigentes?.[tipoId] ?? null,
  };
}

export function avisoDeContradiccion(c: Contradiccion): string {
  const hasta = c.vigenteHasta ? ` vigente hasta el ${fecha(c.vigenteHasta)}` : " vigente";
  return (
    `${c.empleado} tiene ${c.certificado}${hasta}. ¿Querés marcarlo como no apto igual? ` +
    "Conviene revisarlo con el área de seguridad: si el certificado ya no corresponde, " +
    "el dato del legajo está desactualizado."
  );
}
