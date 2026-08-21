import { redirect } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { procesarYSubirFoto } from "~/lib/empleado-foto.server";
import { urlFirmada } from "~/lib/storage.server";
import { empleadoAptitudSchema, empleadoSchema } from "~/lib/validation/empleados";
import { EmpleadoForm } from "./empleado-form";
import type { Route } from "./+types/editar";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const empleadoId = params.id;

  const [{ data: empleado }, { data: puestos }, { data: departamentos }, { data: aptitudes }, { data: aptitudesEmpleado }] =
    await Promise.all([
      supabase.from("empleados").select("*").eq("id", empleadoId).eq("empresa_id", empresaId).single(),
      supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase.from("aptitudes").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase.from("empleado_aptitudes").select("aptitud_id, nivel").eq("empleado_id", empleadoId),
    ]);

  if (!empleado) throw new Response("No encontrado", { status: 404 });

  const fotoUrlActual = empleado.foto_url ? await urlFirmada(supabase, empleado.foto_url) : null;

  return {
    empleado,
    puestos: puestos ?? [],
    departamentos: departamentos ?? [],
    aptitudes: aptitudes ?? [],
    aptitudesEmpleado: (aptitudesEmpleado ?? []).map((a) => ({ aptitudId: a.aptitud_id, nivel: a.nivel })),
    fotoUrlActual,
  };
}

interface Errores {
  _form?: string[];
  [campo: string]: string[] | undefined;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, empresaId, userId } = await requireSesion(request, context);
  const empleadoId = params.id;
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

  const { data: otroConMismoId } = await supabase
    .from("empleados")
    .select("id, nombre, apellido")
    .eq("empresa_id", empresaId)
    .eq("id_interno", parsed.data.idInterno)
    .is("eliminado_en", null)
    .neq("id", empleadoId)
    .maybeSingle();

  if (otroConMismoId) {
    const errores: Errores = {
      idInterno: [
        `El ID interno ${parsed.data.idInterno} ya está asignado a ${otroConMismoId.nombre} ${otroConMismoId.apellido}. Usá otro identificador.`,
      ],
    };
    return { errores, valoresEnviados };
  }

  const { error } = await supabase
    .from("empleados")
    .update({
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
      actualizado_por: userId,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", empleadoId)
    .eq("empresa_id", empresaId);

  if (error) {
    const errores: Errores = { _form: ["No pudimos guardar los cambios. Probá de nuevo en unos minutos."] };
    return { errores, valoresEnviados };
  }

  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const resultado = await procesarYSubirFoto(supabase, empresaId, empleadoId, foto);
    if (!resultado.ok) {
      return { errores: { foto: [resultado.error!] } as Errores, valoresEnviados };
    }
    if (resultado.key) {
      await supabase.from("empleados").update({ foto_url: resultado.key }).eq("id", empleadoId);
    }
  }

  const aptitudesRaw = formData.get("aptitudes");
  if (typeof aptitudesRaw === "string") {
    try {
      const lista = JSON.parse(aptitudesRaw) as unknown[];
      const filas = lista
        .map((item) => empleadoAptitudSchema.safeParse(item))
        .filter((r) => r.success)
        .map((r) => ({
          empresa_id: empresaId,
          empleado_id: empleadoId,
          aptitud_id: r.data!.aptitudId,
          nivel: r.data!.nivel,
          validado_por: userId,
        }));
      await supabase.from("empleado_aptitudes").delete().eq("empleado_id", empleadoId);
      if (filas.length > 0) await supabase.from("empleado_aptitudes").insert(filas);
    } catch {
      // Igual que en el alta: un JSON corrupto no debe tirar abajo los
      // cambios de datos personales que ya se guardaron bien.
    }
  }

  throw redirect(`/empleados/${empleadoId}`);
}

export default function EditarEmpleado({ loaderData, actionData }: Route.ComponentProps) {
  const { empleado } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        Editar a {empleado.nombre} {empleado.apellido}
      </h1>
      <EmpleadoForm
        puestos={loaderData.puestos}
        departamentos={loaderData.departamentos}
        aptitudesCatalogo={loaderData.aptitudes}
        aptitudesIniciales={loaderData.aptitudesEmpleado}
        fotoUrlActual={loaderData.fotoUrlActual}
        errores={actionData?.errores}
        valoresIniciales={{
          idInterno: empleado.id_interno,
          nombre: empleado.nombre,
          apellido: empleado.apellido,
          email: empleado.email ?? "",
          telefono: empleado.telefono ?? "",
          fechaNacimiento: empleado.fecha_nacimiento,
          fechaIngreso: empleado.fecha_ingreso,
          puestoId: empleado.puesto_id ?? "",
          departamentoId: empleado.departamento_id ?? "",
          estado: empleado.estado,
          observaciones: empleado.observaciones ?? "",
        }}
        valoresEnviados={actionData?.valoresEnviados}
      />
    </div>
  );
}
