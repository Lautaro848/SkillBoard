// Tipos del motor de asignación (04-tukson.md).
//
// Nada de esto depende de la base ni del modelo de lenguaje: son estructuras
// planas para que los pasos 3, 4 y 6 —los que deciden quién puede hacer qué—
// sean código puro y verificable.

export type Prioridad = "baja" | "media" | "alta" | "critica";

export const ORDEN_PRIORIDAD: Record<Prioridad, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baja: 3,
};

export interface TareaParaAsignar {
  id: string;
  titulo: string;
  prioridad: Prioridad;
  duracionEstimadaMin: number | null;
  aptitudesRequeridas: string[]; // ids del catálogo de la empresa
  certificadosRequeridos: string[]; // ids de tipos_certificado
  departamentoSugeridoId: string | null;
  // Blanda si el usuario la dejó como sugerencia, dura si la marcó como
  // requisito. La diferencia decide si el filtro descarta o solo resta puntos.
  departamentoEsRequisito: boolean;
}

export interface TareaPasada {
  aptitudes: string[];
  completada: boolean;
}

export interface Candidato {
  id: string;
  // El nombre viaja para armar la pantalla. NUNCA se le pasa al modelo:
  // ver seudonimo.ts.
  nombre: string;
  apellido: string;
  estado: "activo" | "licencia" | "baja";
  departamentoId: string | null;
  puestoId: string | null;
  /** aptitudId → nivel 1..5 */
  aptitudes: Record<string, number>;
  /** ids de tipos de certificado con el certificado al día */
  certificadosVigentes: string[];
  /** tipoId → fecha de vencimiento (yyyy-mm-dd) de los que ya vencieron */
  certificadosVencidos: Record<string, string>;
  historial: TareaPasada[];
  /** Minutos de jornada y minutos ya comprometidos hoy. */
  capacidadMin: number;
  cargaMin: number;
}

export type TipoRegla = "exclusion" | "preferencia" | "prioridad" | "restriccion_horaria";

export interface CondicionesRegla {
  empleadoId?: string;
  departamentoId?: string;
  puestoId?: string;
  aptitudId?: string;
  /** Se aplica solo si el título de la tarea contiene este texto. */
  tareaContiene?: string;
  /** yyyy-mm-dd. Pasada esa fecha la regla deja de aplicarse sola. */
  vigenciaHasta?: string;
}

export interface Regla {
  id: string;
  tipo: TipoRegla;
  enunciado: string;
  peso: number; // -10..10
  activa: boolean;
  condiciones: CondicionesRegla;
}
