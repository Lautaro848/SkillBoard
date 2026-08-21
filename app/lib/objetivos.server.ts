import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularIndice,
  type ObjetivoBase,
  type ObjetivoParaCalculo,
  type IndiceGeneral,
} from "~/lib/cumplimiento";

export interface MedicionFila {
  fecha: string;
  valor: number;
  nota: string | null;
}

// Trae los objetivos con todo su historial de mediciones. Dos consultas fijas,
// sin importar cuántos objetivos haya: nada de una consulta por fila
// (01-arquitectura-y-stack.md §5).
export async function cargarObjetivosBase(
  supabase: SupabaseClient,
  empresaId: string,
  soloActivos = true,
): Promise<{ base: ObjetivoBase[]; medicionesPorObjetivo: Map<string, MedicionFila[]> }> {
  let query = supabase.from("objetivos").select("*").eq("empresa_id", empresaId);
  if (soloActivos) query = query.eq("estado", "activo");

  const { data: objetivos } = await query.order("periodo_fin");
  const ids = (objetivos ?? []).map((o) => o.id as string);

  const { data: mediciones } = ids.length
    ? await supabase
        .from("objetivo_mediciones")
        .select("objetivo_id, fecha, valor, nota")
        .in("objetivo_id", ids)
        .order("fecha", { ascending: true })
    : { data: [] };

  const medicionesPorObjetivo = new Map<string, MedicionFila[]>();
  for (const m of mediciones ?? []) {
    const lista = medicionesPorObjetivo.get(m.objetivo_id) ?? [];
    lista.push({ fecha: m.fecha, valor: Number(m.valor), nota: m.nota });
    medicionesPorObjetivo.set(m.objetivo_id, lista);
  }

  const base: ObjetivoBase[] = (objetivos ?? []).map((o) => ({
    id: o.id,
    nombre: o.nombre,
    periodicidad: o.periodicidad,
    periodoInicio: o.periodo_inicio,
    periodoFin: o.periodo_fin,
    valorInicial: Number(o.valor_inicial),
    valorObjetivo: Number(o.valor_objetivo),
    direccion: o.direccion,
    peso: o.peso,
    unidad: o.unidad,
  }));

  return { base, medicionesPorObjetivo };
}

// Vista "a hoy" para la pantalla de objetivos: el valor actual es la última
// medición cargada. Cada carga es una fila nueva y nunca se sobrescribe
// (02-modelo-de-datos.md), así que el historial queda disponible entero.
export async function cargarObjetivos(
  supabase: SupabaseClient,
  empresaId: string,
  soloActivos = true,
): Promise<{ indice: IndiceGeneral; medicionesPorObjetivo: Map<string, MedicionFila[]> }> {
  const { base, medicionesPorObjetivo } = await cargarObjetivosBase(supabase, empresaId, soloActivos);

  const paraCalculo: ObjetivoParaCalculo[] = base.map((o) => {
    const propias = medicionesPorObjetivo.get(o.id) ?? [];
    return { ...o, valorActual: propias.length > 0 ? propias[propias.length - 1].valor : null };
  });

  return { indice: calcularIndice(paraCalculo), medicionesPorObjetivo };
}
