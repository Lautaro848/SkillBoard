import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoCertificado } from "~/lib/validation/certificados";

export interface CertificadoConEmpleado {
  id: string;
  numero: string | null;
  entidad_emisora: string | null;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  estado: EstadoCertificado;
  dias_restantes: number | null;
  empleado_id: string;
  empleadoNombre: string;
  empleadoIdInterno: string;
  tipoNombre: string;
  tipoId: string;
  puestoId: string | null;
  departamentoId: string | null;
}

export interface FaltanteObligatorio {
  empleadoId: string;
  empleadoNombre: string;
  empleadoIdInterno: string;
  puestoNombre: string;
  tipoId: string;
  tipoNombre: string;
}

// Trae los certificados de la empresa con los datos del empleado ya resueltos.
// Se evita el patrón de una consulta por fila (01-arquitectura-y-stack.md §5):
// son dos consultas fijas, sin importar cuántos empleados haya.
export async function cargarCertificados(
  supabase: SupabaseClient,
  empresaId: string,
): Promise<{
  certificados: CertificadoConEmpleado[];
  faltantes: FaltanteObligatorio[];
}> {
  const [{ data: certs }, { data: empleados }, { data: tipos }, { data: puestos }] = await Promise.all([
    supabase.from("v_certificados").select("*").eq("empresa_id", empresaId),
    supabase
      .from("empleados")
      .select("id, nombre, apellido, id_interno, puesto_id, departamento_id")
      .eq("empresa_id", empresaId)
      .is("eliminado_en", null)
      .neq("estado", "baja"),
    supabase
      .from("tipos_certificado")
      .select("id, nombre, obligatorio_para_puestos")
      .eq("empresa_id", empresaId),
    supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId),
  ]);

  const empleadoPorId = new Map((empleados ?? []).map((e) => [e.id as string, e]));
  const tipoPorId = new Map((tipos ?? []).map((t) => [t.id as string, t]));
  const puestoPorId = new Map((puestos ?? []).map((p) => [p.id as string, p]));

  const certificados: CertificadoConEmpleado[] = (certs ?? [])
    .filter((c) => empleadoPorId.has(c.empleado_id))
    .map((c) => {
      const empleado = empleadoPorId.get(c.empleado_id)!;
      return {
        id: c.id,
        numero: c.numero,
        entidad_emisora: c.entidad_emisora,
        fecha_emision: c.fecha_emision,
        fecha_vencimiento: c.fecha_vencimiento,
        estado: c.estado as EstadoCertificado,
        dias_restantes: c.dias_restantes,
        empleado_id: c.empleado_id,
        empleadoNombre: `${empleado.nombre} ${empleado.apellido}`,
        empleadoIdInterno: empleado.id_interno,
        tipoNombre: tipoPorId.get(c.tipo_id)?.nombre ?? "—",
        tipoId: c.tipo_id,
        puestoId: empleado.puesto_id,
        departamentoId: empleado.departamento_id,
      };
    });

  // Un certificado que NUNCA se cargó es más peligroso que uno vencido,
  // porque no aparece en ninguna lista (03-modulos-y-alcance.md módulo 4).
  // Acá se cruzan los puestos que exigen cada tipo contra lo realmente cargado.
  const tieneCert = new Set(certificados.map((c) => `${c.empleado_id}:${c.tipoId}`));
  const faltantes: FaltanteObligatorio[] = [];

  for (const tipo of tipos ?? []) {
    const puestosExigidos: string[] = tipo.obligatorio_para_puestos ?? [];
    if (puestosExigidos.length === 0) continue;

    for (const empleado of empleados ?? []) {
      if (!empleado.puesto_id || !puestosExigidos.includes(empleado.puesto_id)) continue;
      if (tieneCert.has(`${empleado.id}:${tipo.id}`)) continue;

      faltantes.push({
        empleadoId: empleado.id,
        empleadoNombre: `${empleado.nombre} ${empleado.apellido}`,
        empleadoIdInterno: empleado.id_interno,
        puestoNombre: puestoPorId.get(empleado.puesto_id)?.nombre ?? "—",
        tipoId: tipo.id,
        tipoNombre: tipo.nombre,
      });
    }
  }

  return { certificados, faltantes };
}
