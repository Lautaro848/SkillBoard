import { redirect } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { procesarYSubirFoto } from "~/lib/empleado-foto.server";
import { empleadoAptitudSchema, empleadoSchema } from "~/lib/validation/empleados";
import { EmpleadoForm } from "./empleado-form";
import type { Route } from "./+types/nuevo";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  const [{ data: puestos }, { data: departamentos }, { data: aptitudes }] = await Promise.all([
    supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("aptitudes").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
  ]);

  return {
    puestos: puestos ?? [],
    departamentos: departamentos ?? [],
    aptitudes: aptitudes ?? [],
  };
}

interface Errores {
  _form?: string[];
  [campo: string]: string[] | undefined;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId, userId } = await requireSesion(request, context);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const valoresEnviados = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;

  const parsed = empleadoSchema.safeParse(raw);
  if (!parsed.success) {
    const errores: Errores = parsed.error.flatten().fieldErrors;
    return { errores, valoresEnviados };
  }

  const { data: existente } = await supabase
    .from("empleados")
    .select("nombre, apellido")
    .eq("empresa_id", empresaId)
    .eq("id_interno", parsed.data.idInterno)
    .is("eliminado_en", null)
    .maybeSingle();

  if (existente) {
    const errores: Errores = {
      idInterno: [
        `El ID interno ${parsed.data.idInterno} ya está asignado a ${existente.nombre} ${existente.apellido}. Usá otro identificador.`,
      ],
    };
    return { errores, valoresEnviados };
  }

  const { data: empleado, error } = await supabase
    .from("empleados")
    .insert({
      empresa_id: empresaId,
      id_interno: parsed.data.idInterno,
      nombre: parsed.data.nombre,
      apellido: parsed.data.apellido,
      email: parsed.data.email || null,
      telefono: parsed.data.telefono || null,
      fecha_nacimiento: parsed.data.fechaNacimiento.toISOString().slice(0, 10),
      fecha_ingreso: parsed.data.fechaIngreso.toISOString().slice(0, 10),
      puesto_id: parsed.data.puestoId,
      departamento_id: parsed.data.departamentoId,
      estado: parsed.data.estado,
      observaciones: parsed.data.observaciones || null,
      creado_por: userId,
      actualizado_por: userId,
    })
    .select("id")
    .single();

  if (error || !empleado) {
    const errores: Errores = {
      _form: [
        error?.message.includes("LIMITE_EMPLEADOS_ALCANZADO")
          ? "Llegaste al máximo de empleados de tu plan. Podés dar de baja a un empleado inactivo o ampliar el plan para seguir sumando."
          : "No pudimos guardar el empleado. Probá de nuevo en unos minutos.",
      ],
    };
    return { errores, valoresEnviados };
  }

  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const resultado = await procesarYSubirFoto(supabase, empresaId, empleado.id, foto);
    if (!resultado.ok) {
      return { errores: { foto: [resultado.error!] } as Errores, valoresEnviados, empleadoIdCreado: empleado.id };
    }
    if (resultado.key) {
      await supabase.from("empleados").update({ foto_url: resultado.key }).eq("id", empleado.id);
    }
  }

  const aptitudesRaw = formData.get("aptitudes");
  if (typeof aptitudesRaw === "string" && aptitudesRaw.length > 2) {
    try {
      const lista = JSON.parse(aptitudesRaw) as unknown[];
      const filas = lista
        .map((item) => empleadoAptitudSchema.safeParse(item))
        .filter((r) => r.success)
        .map((r) => ({
          empresa_id: empresaId,
          empleado_id: empleado.id,
          aptitud_id: r.data!.aptitudId,
          nivel: r.data!.nivel,
          validado_por: userId,
        }));
      if (filas.length > 0) await supabase.from("empleado_aptitudes").insert(filas);
    } catch {
      // Aptitudes es un extra sobre el alta ya confirmada: un JSON corrupto no
      // debe hacer perder el empleado que sí se guardó bien.
    }
  }

  throw redirect(`/empleados/${empleado.id}`);
}

export default function NuevoEmpleado({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-seccion font-semibold text-texto">Nuevo empleado</h1>
      </div>
      <EmpleadoForm
        puestos={loaderData.puestos}
        departamentos={loaderData.departamentos}
        aptitudesCatalogo={loaderData.aptitudes}
        errores={actionData?.errores}
        valoresEnviados={actionData?.valoresEnviados}
      />
    </div>
  );
}
