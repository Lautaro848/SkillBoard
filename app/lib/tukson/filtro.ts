import { reglasQueAplican } from "~/lib/tukson/reglas";
import type { Candidato, Regla, TareaParaAsignar } from "~/lib/tukson/tipos";

// Paso 3 — Filtro duro. Código, sin IA, sin excepciones (04-tukson.md §2).
//
// El modelo de lenguaje nunca puede saltear este filtro: recibe únicamente la
// lista ya filtrada. Lo que se decide acá es quién PUEDE hacer la tarea, y esa
// decisión tiene que ser reproducible y auditable, no una opinión.

export type MotivoDescarte =
  | { clase: "no_activo"; estado: "licencia" | "baja" }
  | { clase: "certificado_faltante"; tipoId: string }
  | { clase: "certificado_vencido"; tipoId: string; vencioEl: string }
  | { clase: "regla"; reglaId: string; enunciado: string }
  | { clase: "departamento" };

export interface Descarte {
  empleadoId: string;
  nombre: string;
  motivo: MotivoDescarte;
}

export interface ResultadoFiltro {
  candidatos: Candidato[];
  descartes: Descarte[];
}

export function filtrarCandidatos(
  empleados: Candidato[],
  tarea: TareaParaAsignar,
  reglas: Regla[],
  hoy = new Date(),
): ResultadoFiltro {
  const candidatos: Candidato[] = [];
  const descartes: Descarte[] = [];

  for (const e of empleados) {
    const nombre = `${e.nombre} ${e.apellido}`;
    const descartar = (motivo: MotivoDescarte) => descartes.push({ empleadoId: e.id, nombre, motivo });

    if (e.estado !== "activo") {
      descartar({ clase: "no_activo", estado: e.estado });
      continue;
    }

    // Un certificado vencido pesa distinto que uno que nunca se cargó, y el
    // mensaje de "sin candidatos" necesita esa diferencia para ser útil.
    let sinCertificado = false;
    for (const tipoId of tarea.certificadosRequeridos) {
      if (e.certificadosVigentes.includes(tipoId)) continue;

      const vencioEl = e.certificadosVencidos[tipoId];
      descartar(
        vencioEl
          ? { clase: "certificado_vencido", tipoId, vencioEl }
          : { clase: "certificado_faltante", tipoId },
      );
      sinCertificado = true;
      break;
    }
    if (sinCertificado) continue;

    const exclusiones = reglasQueAplican(reglas, e, tarea, hoy).filter((r) => r.tipo === "exclusion");
    if (exclusiones.length > 0) {
      descartar({ clase: "regla", reglaId: exclusiones[0].id, enunciado: exclusiones[0].enunciado });
      continue;
    }

    // Departamento: dura solo si el usuario la marcó como requisito. Si es
    // sugerencia, no descarta — resta puntos en el paso 4.
    if (
      tarea.departamentoEsRequisito &&
      tarea.departamentoSugeridoId &&
      e.departamentoId !== tarea.departamentoSugeridoId
    ) {
      descartar({ clase: "departamento" });
      continue;
    }

    candidatos.push(e);
  }

  return { candidatos, descartes };
}

// El mensaje de "sin candidatos" es, en la práctica, uno de los momentos de
// más valor del producto: es cuando el sistema avisa que hay un problema real
// de habilitaciones que nadie estaba mirando. Por eso dice qué falta y quién
// lo tenía, no "no se encontraron resultados".
export function motivoSinCandidatos(
  descartes: Descarte[],
  nombreTipo: (tipoId: string) => string,
  formatearFecha: (iso: string) => string,
): string {
  if (descartes.length === 0) {
    return "No hay empleados cargados para evaluar. Cargá al menos uno para que Tukson pueda asignar.";
  }

  const vencidos = descartes.filter(
    (d): d is Descarte & { motivo: Extract<MotivoDescarte, { clase: "certificado_vencido" }> } =>
      d.motivo.clase === "certificado_vencido",
  );
  const faltantes = descartes.filter((d) => d.motivo.clase === "certificado_faltante");

  if (vencidos.length > 0 || faltantes.length > 0) {
    const tipoId =
      vencidos[0]?.motivo.tipoId ??
      (faltantes[0]?.motivo as Extract<MotivoDescarte, { clase: "certificado_faltante" }>).tipoId;
    const tipo = nombreTipo(tipoId);

    const partes = [`Ningún empleado activo tiene ${tipo} vigente.`];

    if (vencidos.length > 0) {
      const lista = vencidos
        .map((d) => `${d.nombre} (venció el ${formatearFecha(d.motivo.vencioEl)})`)
        .join(vencidos.length === 2 ? " y " : ", ");
      partes.push(
        `${vencidos.length} ${vencidos.length === 1 ? "empleado lo tiene" : "empleados lo tienen"} vencido: ${lista}.`,
      );
    }
    if (faltantes.length > 0) {
      partes.push(
        `${faltantes.length} ${faltantes.length === 1 ? "no lo tiene" : "no lo tienen"} registrado.`,
      );
    }
    return partes.join(" ");
  }

  const porRegla = descartes.find((d) => d.motivo.clase === "regla");
  if (porRegla && porRegla.motivo.clase === "regla") {
    return `Todos los candidatos quedaron excluidos por una regla de la empresa: "${porRegla.motivo.enunciado}". Podés revisarla en Configuración › Reglas de Tukson.`;
  }

  const porDepartamento = descartes.filter((d) => d.motivo.clase === "departamento").length;
  if (porDepartamento > 0) {
    return `Ningún empleado activo pertenece al departamento que la tarea exige. Si el departamento era una sugerencia y no un requisito, cambialo en la tarea.`;
  }

  const noActivos = descartes.filter((d) => d.motivo.clase === "no_activo").length;
  return `No hay empleados activos disponibles: ${noActivos} están de baja o con licencia.`;
}
