// Períodos del panel (03-modulos-y-alcance.md, módulo 5).
//
// El selector de período no es decorativo: define qué objetivos entran en el
// índice y contra qué período anterior se compara. Todo se calcula en UTC a
// mediodía, igual que en cumplimiento.ts, para que el corte de mes no se
// mueva según la zona horaria del servidor.

export type ClavePeriodo = "mes" | "trimestre" | "anio";

export const ETIQUETAS_PERIODO: Record<ClavePeriodo, string> = {
  mes: "Este mes",
  trimestre: "Este trimestre",
  anio: "Este año",
};

export function esClavePeriodo(valor: string | null | undefined): valor is ClavePeriodo {
  return valor === "mes" || valor === "trimestre" || valor === "anio";
}

export interface Rango {
  inicio: Date;
  fin: Date;
  etiqueta: string;
}

function utc(anio: number, mes: number, dia: number): Date {
  // Date.UTC normaliza meses fuera de rango (mes -1 = diciembre anterior,
  // mes 12 = enero siguiente), así que día 0 del mes siguiente es el último
  // día del mes pedido.
  return new Date(Date.UTC(anio, mes, dia, 12));
}

const MESES = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

// `desplazamiento` en unidades del propio período: 0 es el actual, -1 el
// anterior. Sirve para comparar sin duplicar la lógica de bordes.
export function rangoPeriodo(clave: ClavePeriodo, hoy = new Date(), desplazamiento = 0): Rango {
  const anio = hoy.getUTCFullYear();
  const mes = hoy.getUTCMonth();

  if (clave === "mes") {
    const inicio = utc(anio, mes + desplazamiento, 1);
    const fin = utc(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0);
    return { inicio, fin, etiqueta: MESES.format(inicio) };
  }

  if (clave === "trimestre") {
    const trimestre = Math.floor(mes / 3);
    const inicio = utc(anio, (trimestre + desplazamiento) * 3, 1);
    const fin = utc(inicio.getUTCFullYear(), inicio.getUTCMonth() + 3, 0);
    const numero = Math.floor(inicio.getUTCMonth() / 3) + 1;
    return { inicio, fin, etiqueta: `Trimestre ${numero} de ${inicio.getUTCFullYear()}` };
  }

  const inicio = utc(anio + desplazamiento, 0, 1);
  const fin = utc(anio + desplazamiento, 12, 0);
  return { inicio, fin, etiqueta: `Año ${inicio.getUTCFullYear()}` };
}

// El corte de medición del período actual es hoy, no el fin del período:
// medir un mes en curso contra su cierre daría un índice inflado por días
// que todavía no pasaron.
export function corteDe(rango: Rango, hoy = new Date()): Date {
  return hoy.getTime() < rango.fin.getTime() ? hoy : rango.fin;
}
