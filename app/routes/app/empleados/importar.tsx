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

// Lo que manda la pantalla cuando la persona acepta crear los puestos y
// departamentos que el archivo menciona y la empresa todavía no tiene.
interface CrearCatalogos {
  intent: "crear-catalogos";
  departamentos: string[];
  // El departamento con el que aparece cada puesto en el archivo, para no
  // dejar los puestos nuevos colgando sin área.
  puestos: { nombre: string; departamento: string }[];
}

const TAMANIO_LOTE = 100;

// El check de la base: nombre entre 2 y 50 caracteres.
const LARGO_NOMBRE = { min: 2, max: 50 };
const nombreUsable = (n: string) =>
  n.trim().length >= LARGO_NOMBRE.min && n.trim().length <= LARGO_NOMBRE.max;

const normalizar = (t: string) => t.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Crea los catálogos que faltan y devuelve las listas completas al día.
//
// Los nombres los escribió una persona en una planilla, así que se limpian y
// se comparan sin acentos ni mayúsculas: "produccion" y "Producción" son el
// mismo departamento y no se crean dos veces. El índice único de la base es
// el que decide en última instancia, y por eso se relee al final en vez de
// confiar en lo que se acaba de insertar.
async function crearCatalogosFaltantes(
  supabase: Awaited<ReturnType<typeof requireSesion>>["supabase"],
  empresaId: string,
  pedido: CrearCatalogos,
) {
  const leer = async () => {
    const [{ data: puestos }, { data: departamentos }] = await Promise.all([
      supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
    ]);
    return { puestos: puestos ?? [], departamentos: departamentos ?? [] };
  };

  const antes = await leer();
  const rechazados: string[] = [];
  const usables = (nombres: string[], conocidos: { nombre: string }[]) => {
    const yaEstan = new Set(conocidos.map((c) => normalizar(c.nombre)));
    const vistos = new Set<string>();
    const salida: string[] = [];
    for (const n of nombres) {
      const limpio = n.trim();
      if (!nombreUsable(limpio)) {
        rechazados.push(limpio);
        continue;
      }
      const norm = normalizar(limpio);
      if (yaEstan.has(norm) || vistos.has(norm)) continue;
      vistos.add(norm);
      salida.push(limpio);
    }
    return salida;
  };

  // Los departamentos primero: los puestos nuevos pueden apuntar a uno de ellos.
  const departamentosNuevos = usables(pedido.departamentos, antes.departamentos);
  if (departamentosNuevos.length > 0) {
    await supabase
      .from("departamentos")
      .insert(departamentosNuevos.map((nombre) => ({ empresa_id: empresaId, nombre })));
  }

  const conDepartamentos = await leer();
  const departamentoPorNombre = new Map(
    conDepartamentos.departamentos.map((d) => [normalizar(d.nombre), d.id]),
  );

  const puestosNuevos = usables(
    pedido.puestos.map((p) => p.nombre),
    antes.puestos,
  );
  const departamentoDe = new Map(
    pedido.puestos.map((p) => [normalizar(p.nombre), normalizar(p.departamento ?? "")]),
  );

  if (puestosNuevos.length > 0) {
    await supabase.from("puestos").insert(
      puestosNuevos.map((nombre) => ({
        empresa_id: empresaId,
        nombre,
        departamento_id: departamentoPorNombre.get(departamentoDe.get(normalizar(nombre)) ?? "") ?? null,
      })),
    );
  }

  return { ...(await leer()), rechazados };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId, userId } = await requireSesion(request, context);
  const body = (await request.json()) as { filas: FilaEnvio[] } | CrearCatalogos;

  // El único envío con `intent` es el de crear catálogos; el otro trae filas.
  // La condición se escribe así, y no comparando el valor, para que TypeScript
  // pueda estrechar la unión en la rama de abajo.
  if ("intent" in body) {
    return crearCatalogosFaltantes(supabase, empresaId, body);
  }

  const filasPedidas = body.filas;

  const creados: string[] = [];
  const fallidos: { fila: number; motivo: string }[] = [];

  for (let inicio = 0; inicio < filasPedidas.length; inicio += TAMANIO_LOTE) {
    const lote = filasPedidas.slice(inicio, inicio + TAMANIO_LOTE);
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
