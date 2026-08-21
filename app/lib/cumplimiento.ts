// Índice de cumplimiento (03-modulos-y-alcance.md, módulo 5).
//
// SkillBoard no sabe si una empresa vende más o menos: solo sabe lo que la
// empresa carga. Por eso el índice no mide "rendimiento" en abstracto, sino
// una sola cosa concreta: ¿los objetivos activos van al ritmo que deberían?

export interface ObjetivoParaCalculo {
  id: string;
  nombre: string;
  periodicidad?: "semanal" | "mensual" | "trimestral" | "anual";
  periodoInicio: string; // yyyy-mm-dd
  periodoFin: string;
  valorInicial: number;
  valorObjetivo: number;
  direccion: "aumentar" | "disminuir";
  peso: number; // 1-5
  unidad: "cantidad" | "porcentaje" | "moneda" | "horas";
  valorActual: number | null; // última medición; null = todavía sin medir
}

export interface ObjetivoCalculado extends ObjetivoParaCalculo {
  avanceReal: number; // 0-1+ (puede pasarse de 1 si se superó la meta)
  avanceEsperado: number; // 0-1 según el tiempo transcurrido
  cumplimiento: number | null; // 0-125, null si todavía no se puede medir
  medido: boolean;
}

// Se limita a 125 para que un objetivo desbordado no tape el atraso de los
// demás al promediar.
const TOPE_CUMPLIMIENTO = 1.25;

const DIA_MS = 86_400_000;

function aFecha(iso: string): number {
  // Se fuerza mediodía UTC para que el cálculo de días no se corra por la
  // zona horaria del servidor.
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();
}

export function calcularObjetivo(o: ObjetivoParaCalculo, hoy = new Date()): ObjetivoCalculado {
  const inicio = aFecha(o.periodoInicio);
  const fin = aFecha(o.periodoFin);
  const ahora = hoy.getTime();

  const diasTotales = Math.max((fin - inicio) / DIA_MS, 1);
  const diasTranscurridos = Math.min(Math.max((ahora - inicio) / DIA_MS, 0), diasTotales);
  const avanceEsperado = diasTranscurridos / diasTotales;

  // Un objetivo sin medir no vale 0: valdría lo mismo que uno medido en cero,
  // y no es lo mismo "no avanzó" que "no sabemos". Queda fuera del promedio.
  if (o.valorActual === null) {
    return { ...o, avanceReal: 0, avanceEsperado, cumplimiento: null, medido: false };
  }

  const recorridoTotal = o.valorObjetivo - o.valorInicial;

  // Meta igual al punto de partida: no hay recorrido que medir. Se considera
  // cumplido si el valor se mantuvo donde tenía que estar.
  if (recorridoTotal === 0) {
    const enMeta = o.valorActual === o.valorObjetivo;
    return {
      ...o,
      avanceReal: enMeta ? 1 : 0,
      avanceEsperado,
      cumplimiento: enMeta ? 100 : 0,
      medido: true,
    };
  }

  // La fórmula sirve igual para "aumentar" y "disminuir" porque el signo del
  // recorrido y el del avance se cancelan: bajar de 100 a 80 con meta 50 da
  // (80-100)/(50-100) = 0,4, que es el 40% del camino. `direccion` queda para
  // la presentación (flechas, texto), no para el cálculo.
  const avanceReal = (o.valorActual - o.valorInicial) / recorridoTotal;

  // Antes de que empiece el período no hay ritmo esperado contra el cual
  // comparar; dividir por cero daría Infinity.
  if (avanceEsperado === 0) {
    return { ...o, avanceReal, avanceEsperado, cumplimiento: null, medido: true };
  }

  const ratio = Math.min(avanceReal / avanceEsperado, TOPE_CUMPLIMIENTO);
  return {
    ...o,
    avanceReal,
    avanceEsperado,
    // Retroceder respecto del punto de partida no da negativo: es 0.
    cumplimiento: Math.max(ratio, 0) * 100,
    medido: true,
  };
}

export interface IndiceGeneral {
  indice: number | null; // null = no hay objetivos medibles todavía
  objetivos: ObjetivoCalculado[];
  medibles: number;
}

export function calcularIndice(objetivos: ObjetivoParaCalculo[], hoy = new Date()): IndiceGeneral {
  const calculados = objetivos.map((o) => calcularObjetivo(o, hoy));
  const medibles = calculados.filter((o) => o.cumplimiento !== null);

  if (medibles.length === 0) {
    return { indice: null, objetivos: calculados, medibles: 0 };
  }

  const pesoTotal = medibles.reduce((s, o) => s + o.peso, 0);
  const suma = medibles.reduce((s, o) => s + (o.cumplimiento ?? 0) * o.peso, 0);

  return {
    indice: Math.round(suma / pesoTotal),
    objetivos: calculados,
    medibles: medibles.length,
  };
}

export type ObjetivoBase = Omit<ObjetivoParaCalculo, "valorActual">;

export interface MedicionSimple {
  fecha: string; // yyyy-mm-dd
  valor: number;
}

// ¿Este objetivo estaba en curso durante el período? Basta con que se pisen:
// un objetivo anual también corre durante el mes que se está mirando.
export function objetivoEnRango(o: ObjetivoBase, inicio: Date, fin: Date): boolean {
  return aFecha(o.periodoInicio) <= fin.getTime() && aFecha(o.periodoFin) >= inicio.getTime();
}

// Reconstruye el índice tal como se veía en una fecha pasada, usando solo las
// mediciones que ya existían entonces. Es lo que permite comparar contra el
// período anterior sin inventar el número: si no hay mediciones previas, da
// null y el panel dice que no hay con qué comparar.
export function indiceAlCorte(
  base: ObjetivoBase[],
  medicionesPorObjetivo: Map<string, MedicionSimple[]>,
  corte: Date,
): IndiceGeneral {
  const limite = corte.getTime();

  const conValor: ObjetivoParaCalculo[] = base.map((o) => {
    // Las mediciones vienen ordenadas por fecha ascendente; la última que no
    // supera el corte es el valor conocido en ese momento.
    const propias = medicionesPorObjetivo.get(o.id) ?? [];
    let valorActual: number | null = null;
    for (const m of propias) {
      if (aFecha(m.fecha) > limite) break;
      valorActual = m.valor;
    }
    return { ...o, valorActual };
  });

  return calcularIndice(conValor, corte);
}

// La flecha nunca va sola: siempre acompañada del texto que dice cuánto
// cambió respecto del período anterior.
export function compararConAnterior(
  actual: number | null,
  anterior: number | null,
): { texto: string; direccion: "sube" | "baja" | "igual" | "sin_dato" } {
  if (actual === null || anterior === null) {
    return { texto: "Sin período anterior para comparar", direccion: "sin_dato" };
  }
  const diferencia = Math.round(actual - anterior);
  if (diferencia === 0) return { texto: "Igual que el período anterior", direccion: "igual" };
  const puntos = Math.abs(diferencia);
  return {
    texto: `${puntos} ${puntos === 1 ? "punto" : "puntos"} ${diferencia > 0 ? "más" : "menos"} que el período anterior`,
    direccion: diferencia > 0 ? "sube" : "baja",
  };
}

// Locale argentino: separador de miles con punto y decimal con coma.
export function formatearValor(valor: number, unidad: ObjetivoParaCalculo["unidad"]): string {
  const numero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(valor);
  switch (unidad) {
    case "porcentaje":
      return `${numero}%`;
    case "moneda":
      return `$${numero}`;
    case "horas":
      return `${numero} h`;
    default:
      return numero;
  }
}

export function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}
