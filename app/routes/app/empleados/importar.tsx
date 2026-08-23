import { requireSesion } from "~/lib/sesion.server";
import type { DatosEmpleadoResueltos } from "~/lib/importar-empleados";
import { ImportarWizard } from "./importar-wizard";
import type { Route } from "./+types/importar";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  const [{ data: puestos }, { data: departamentos }, { data: empleados }] = await Promise.all([
    supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    supabase.from("empleados").select("id_interno").eq("empresa_id", empresaId).is("eliminado_en", null),
  ]);

  return {
    puestos: puestos ?? [],
    departamentos: departamentos ?? [],
    idsExistentes: (empleados ?? []).map((e) => e.id_interno as string),
  };
}

interface FilaEnvio {
  fila: number;
  datos: DatosEmpleadoResueltos;
}

const TAMANIO_LOTE = 100;

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId, userId } = await requireSesion(request, context);
  const body = (await request.json()) as { filas: FilaEnvio[] };

  const creados: string[] = [];
  const fallidos: { fila: number; motivo: string }[] = [];

  for (let inicio = 0; inicio < body.filas.length; inicio += TAMANIO_LOTE) {
    const lote = body.filas.slice(inicio, inicio + TAMANIO_LOTE);
    const filasParaInsertar = lote.map((f) => ({
      empresa_id: empresaId,
      id_interno: f.datos.idInterno,
      nombre: f.datos.nombre,
      apellido: f.datos.apellido,
      email: f.datos.email || null,
      telefono: f.datos.telefono || null,
      fecha_nacimiento: f.datos.fechaNacimiento,
      fecha_ingreso: f.datos.fechaIngreso,
      puesto_id: f.datos.puestoId,
      departamento_id: f.datos.departamentoId,
      estado: f.datos.estado,
      observaciones: f.datos.observaciones || null,
      creado_por: userId,
      actualizado_por: userId,
    }));

    // Todo el lote entra en un único insert (una sola sentencia SQL: atómico
    // por lote, como pide 03-modulos-y-alcance.md §Importación masiva). Si
    // el lote entero falla (p. ej. un duplicado que se coló), se reintenta
    // fila por fila solo para ese lote, así el resto de la importación no se
    // pierde por un solo problema.
    const { data, error } = await supabase.from("empleados").insert(filasParaInsertar).select("id");

    if (!error && data) {
      creados.push(...data.map((d) => d.id));
      continue;
    }

    for (const f of lote) {
      const { data: uno, error: errorUno } = await supabase
        .from("empleados")
        .insert({
          empresa_id: empresaId,
          id_interno: f.datos.idInterno,
          nombre: f.datos.nombre,
          apellido: f.datos.apellido,
          email: f.datos.email || null,
          telefono: f.datos.telefono || null,
          fecha_nacimiento: f.datos.fechaNacimiento,
          fecha_ingreso: f.datos.fechaIngreso,
          puesto_id: f.datos.puestoId,
          departamento_id: f.datos.departamentoId,
          estado: f.datos.estado,
          observaciones: f.datos.observaciones || null,
          creado_por: userId,
          actualizado_por: userId,
        })
        .select("id")
        .single();

      if (errorUno || !uno) {
        const duplicado = errorUno?.code === "23505" || errorUno?.message.includes("duplicate");
        fallidos.push({
          fila: f.fila,
          motivo: duplicado
            ? `El ID interno ${f.datos.idInterno} ya está en uso.`
            : errorUno?.message.includes("LIMITE_EMPLEADOS_ALCANZADO")
              ? "Se alcanzó el máximo de empleados del plan."
              : "No se pudo guardar esta fila.",
        });
      } else {
        creados.push(uno.id);
      }
    }
  }

  return { creados: creados.length, fallidos };
}

export default function ImportarEmpleados({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-seccion font-semibold text-texto">Importar empleados</h1>
      <ImportarWizard puestos={loaderData.puestos} departamentos={loaderData.departamentos} idsExistentes={loaderData.idsExistentes} />
    </div>
  );
}
