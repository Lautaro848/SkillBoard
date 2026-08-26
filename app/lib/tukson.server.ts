import type { SupabaseClient } from "@supabase/supabase-js";
import type { Candidato, Regla, TareaPasada } from "~/lib/tukson/tipos";
import { UMBRALES_POR_DEFECTO, type Umbrales } from "~/lib/tukson/asignar";

// Arma los candidatos que consumen el filtro y el puntaje. Consultas fijas,
// sin importar cuántos empleados haya: nada de una consulta por fila
// (01-arquitectura-y-stack.md §5).

export interface Catalogos {
  aptitudes: Map<string, string>;
  tiposCertificado: Map<string, string>;
  departamentos: Map<string, string>;
}

export async function cargarCatalogos(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<Catalogos> {
  const [{ data: aptitudes }, { data: tipos }, { data: departamentos }] = await Promise.all([
    supabase.from("aptitudes").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("tipos_certificado").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
  ]);

  return {
    aptitudes: new Map((aptitudes ?? []).map((a) => [a.id as string, a.nombre as string])),
    tiposCertificado: new Map((tipos ?? []).map((t) => [t.id as string, t.nombre as string])),
    departamentos: new Map((departamentos ?? []).map((d) => [d.id as string, d.nombre as string])),
  };
}

export async function cargarCandidatos(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<Candidato[]> {
  const hoy = new Date().toISOString().slice(0, 10);
  // Ventana de rotación: cuántas asignaciones recibió cada uno en la semana.
  // Es el segundo criterio de desempate (06-tukson-mejoras.md §1.1).
  const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: empleados }, { data: aptitudes }, { data: certificados }, { data: asignaciones }] =
    await Promise.all([
      supabase
        .from("empleados")
        .select("id, id_interno, nombre, apellido, estado, departamento_id, puesto_id, capacidad_diaria_min")
        .eq("empresa_id", empresaId)
        .is("eliminado_en", null),
      supabase.from("empleado_aptitudes").select("empleado_id, aptitud_id, nivel").eq("empresa_id", empresaId),
      supabase
        .from("v_certificados")
        .select("empleado_id, tipo_id, estado, fecha_vencimiento")
        .eq("empresa_id", empresaId),
      // Historial y carga del día en una sola consulta: cada asignación trae
      // las aptitudes de su tarea y su duración.
      supabase
        .from("asignaciones")
        .select("empleado_id, estado, creada_en, tareas(aptitudes_requeridas, duracion_estimada_min)")
        .eq("empresa_id", empresaId)
        .in("estado", ["confirmada", "completada"]),
    ]);

  const porEmpleado = <T>(filas: T[], clave: (f: T) => string) => {
    const mapa = new Map<string, T[]>();
    for (const f of filas) {
      const k = clave(f);
      const lista = mapa.get(k) ?? [];
      lista.push(f);
      mapa.set(k, lista);
    }
    return mapa;
  };

  const aptitudesPor = porEmpleado(aptitudes ?? [], (a) => a.empleado_id);
  const certificadosPor = porEmpleado(certificados ?? [], (c) => c.empleado_id);
  const asignacionesPor = porEmpleado(asignaciones ?? [], (a) => a.empleado_id);

  return (empleados ?? []).map((e) => {
    const propias = asignacionesPor.get(e.id) ?? [];

    const historial: TareaPasada[] = propias.map((a) => {
      // PostgREST devuelve la relación como objeto o arreglo según el caso.
      const tarea = Array.isArray(a.tareas) ? a.tareas[0] : a.tareas;
      return {
        aptitudes: (tarea?.aptitudes_requeridas ?? []) as string[],
        completada: a.estado === "completada",
      };
    });

    // Carga del día: solo lo confirmado hoy y todavía sin completar.
    const cargaMin = propias
      .filter((a) => a.estado === "confirmada" && String(a.creada_en).slice(0, 10) === hoy)
      .reduce((s, a) => {
        const tarea = Array.isArray(a.tareas) ? a.tareas[0] : a.tareas;
        return s + (tarea?.duracion_estimada_min ?? 60);
      }, 0);

    const certs = certificadosPor.get(e.id) ?? [];

    return {
      id: e.id,
      idInterno: e.id_interno as string,
      nombre: e.nombre,
      apellido: e.apellido,
      estado: e.estado,
      departamentoId: e.departamento_id,
      puestoId: e.puesto_id,
      aptitudes: Object.fromEntries(
        (aptitudesPor.get(e.id) ?? []).map((a) => [a.aptitud_id as string, a.nivel as number]),
      ),
      certificadosVigentes: certs.filter((c) => c.estado !== "vencido").map((c) => c.tipo_id as string),
      vencimientoDeVigentes: Object.fromEntries(
        certs
          .filter((c) => c.estado !== "vencido" && c.fecha_vencimiento)
          .map((c) => [c.tipo_id as string, c.fecha_vencimiento as string]),
      ),
      certificadosVencidos: Object.fromEntries(
        certs
          .filter((c) => c.estado === "vencido" && c.fecha_vencimiento)
          .map((c) => [c.tipo_id as string, c.fecha_vencimiento as string]),
      ),
      historial,
      capacidadMin: e.capacidad_diaria_min ?? 480,
      cargaMin,
      asignacionesUltimos7Dias: propias.filter((a) => String(a.creada_en).slice(0, 10) >= hace7Dias)
        .length,
    };
  });
}

export async function cargarReglas(
  supabase: SupabaseClient,
  empresaId: string,
  soloActivas = true,
): Promise<Regla[]> {
  let query = supabase.from("reglas_empresa").select("*").eq("empresa_id", empresaId);
  if (soloActivas) query = query.eq("activa", true);

  const { data } = await query.order("creada_en", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    enunciado: r.enunciado,
    peso: r.peso,
    activa: r.activa,
    condiciones: r.condiciones ?? {},
  }));
}

// Umbral mínimo de puntaje por empresa (06-tukson-mejoras.md §1.3). Si la
// empresa nunca lo tocó, valen los del documento: 45 y 60.
export async function cargarUmbrales(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<Umbrales> {
  const { data } = await supabase
    .from("config_tukson")
    .select("umbral_general, umbral_critica")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (!data) return UMBRALES_POR_DEFECTO;
  return { general: data.umbral_general, critica: data.umbral_critica };
}
