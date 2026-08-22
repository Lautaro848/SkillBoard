import type { Postulante } from "~/lib/tukson/asignar";
import type { TareaParaAsignar } from "~/lib/tukson/tipos";

// Seudonimización para el paso 5 (04-tukson.md §2).
//
// El modelo NUNCA ve un nombre, un documento, un email ni una fecha de
// nacimiento: ve EMP-0143. El servidor reemplaza el seudónimo por el nombre
// real recién al armar la pantalla.
//
// Esto hace dos cosas a la vez: cumple con la minimización de datos personales
// que exige la Ley 25.326, y elimina de raíz el sesgo por nombre, género o
// nacionalidad, porque esa información nunca llega al modelo. No es una
// mitigación de sesgo: es la ausencia del dato que lo produce.

export interface MapaSeudonimos {
  /** seudónimo → id real */
  aReal: Map<string, string>;
  /** id real → seudónimo */
  aSeudonimo: Map<string, string>;
}

export function seudonimizar(postulantes: Postulante[]): MapaSeudonimos {
  const aReal = new Map<string, string>();
  const aSeudonimo = new Map<string, string>();

  postulantes.forEach((p, i) => {
    // Numeración local al lote: no se deriva del id real, así el seudónimo no
    // filtra nada aunque se guarde el texto que se le mandó al modelo.
    const seudonimo = `EMP-${String(i + 1).padStart(4, "0")}`;
    aReal.set(seudonimo, p.candidato.id);
    aSeudonimo.set(p.candidato.id, seudonimo);
  });

  return { aReal, aSeudonimo };
}

// El texto exacto que se le manda al modelo. Se guarda junto con la llamada
// para poder auditar después qué se envió: si alguna vez aparece un nombre
// acá, se ve.
export function armarPrompt(
  tarea: TareaParaAsignar,
  postulantes: Postulante[],
  mapa: MapaSeudonimos,
  nombreAptitud: (id: string) => string,
  nombreTipoCertificado: (id: string) => string,
  reglasActivas: string[],
): string {
  const horas = (min: number) => (min / 60).toFixed(1).replace(".0", "");

  const cabecera = [
    `TAREA: ${tarea.titulo} (${tarea.prioridad}${
      tarea.duracionEstimadaMin ? `, ${tarea.duracionEstimadaMin} min` : ""
    })`,
  ];

  const requisitos: string[] = [];
  if (tarea.aptitudesRequeridas.length > 0) {
    requisitos.push(tarea.aptitudesRequeridas.map(nombreAptitud).join(", "));
  }
  if (tarea.certificadosRequeridos.length > 0) {
    requisitos.push(tarea.certificadosRequeridos.map(nombreTipoCertificado).join(", "));
  }
  if (requisitos.length > 0) cabecera.push(`Requiere: ${requisitos.join(" · ")}`);

  const filas = postulantes.map((p) => {
    const d = p.desglose.detalle;
    const aptitudes = d.aptitudesQueTiene
      .map((a) => `${nombreAptitud(a)} ${d.nivelesPorAptitud[a]}/5`)
      .join(", ");
    const historial =
      d.tareasSimilares > 0
        ? `${d.tareasSimilares} tareas similares, ${d.tareasCompletadas} completadas`
        : "sin historial";

    return [
      mapa.aSeudonimo.get(p.candidato.id),
      `${p.desglose.total} pts`,
      aptitudes || "sin aptitudes cargadas",
      historial,
      `carga hoy ${horas(d.cargaMin)}/${horas(d.capacidadMin)} h`,
    ].join(" · ");
  });

  const bloques = [
    cabecera.join("\n"),
    ["CANDIDATOS (ya filtrados: todos tienen los certificados vigentes)", ...filas].join("\n"),
  ];

  if (reglasActivas.length > 0) {
    bloques.push(["REGLAS ACTIVAS DE LA EMPRESA", ...reglasActivas.map((r) => `- ${r}`)].join("\n"));
  }

  return bloques.join("\n\n");
}

// Red de seguridad: antes de mandar nada, se verifica que el texto no
// contenga ninguno de los nombres reales. Si el armado del prompt cambia
// alguna vez y se cuela un nombre, esto lo detiene.
export function contieneDatosPersonales(prompt: string, postulantes: Postulante[]): string[] {
  const encontrados: string[] = [];

  for (const p of postulantes) {
    for (const dato of [p.candidato.nombre, p.candidato.apellido]) {
      if (dato.length < 3) continue;
      const patron = new RegExp(`\\b${dato.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (patron.test(prompt)) encontrados.push(dato);
    }
  }

  return [...new Set(encontrados)];
}
