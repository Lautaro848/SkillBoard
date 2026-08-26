import { Form } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { cargarCatalogos, cargarUmbrales } from "~/lib/tukson.server";
import { describirCondiciones, esFragilPorTitulo } from "~/lib/tukson/reglas";
import type { CondicionesRegla } from "~/lib/tukson/tipos";
import { UMBRALES_POR_DEFECTO } from "~/lib/tukson/asignar";
import { Boton, BotonEnviar } from "~/components/ui/boton";
import { Campo, Selector } from "~/components/ui/campo";
import { Aviso, EstadoVacio } from "~/components/ui/estados";
import type { Route } from "./+types/reglas";

const ETIQUETA_TIPO: Record<string, string> = {
  exclusion: "Exclusión",
  preferencia: "Preferencia",
  prioridad: "Prioridad",
  restriccion_horaria: "Restricción horaria",
};

const EXPLICACION_TIPO: Record<string, string> = {
  exclusion: "Saca a esa persona de los candidatos, sin excepción.",
  preferencia: "Suma o resta puntos, pero no descarta a nadie.",
  prioridad: "Suma o resta puntos, pero no descarta a nadie.",
  restriccion_horaria: "Todavía no se aplica: falta el módulo de calendario laboral.",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  const [
    { data: reglas },
    { data: correcciones },
    { data: asignaciones },
    { data: lotes },
    catalogos,
    { data: empleados },
    umbrales,
    { data: puestos },
  ] = await Promise.all([
      supabase
        .from("reglas_empresa")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("creada_en", { ascending: false }),
      supabase.from("correcciones_tukson").select("id, regla_generada_id").eq("empresa_id", empresaId),
      supabase.from("asignaciones").select("id, origen, estado").eq("empresa_id", empresaId),
      supabase
        .from("lotes_asignacion")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("estado", "confirmado"),
      // Para poder decir a qué aplica cada regla en castellano, en vez de
      // mostrar los ids que están guardados.
      cargarCatalogos(supabase, empresaId),
      supabase
        .from("empleados")
        .select("id, nombre, apellido")
        .eq("empresa_id", empresaId)
        .is("eliminado_en", null),
      cargarUmbrales(supabase, empresaId),
      supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId),
    ]);

  // Métricas del §5. Se muestran para que el propio cliente vea si el sistema
  // mejora, y también como mecanismo de honestidad: si la tasa de aceptación
  // no sube, el diseño está mal y hay que revisarlo, no maquillarlo.
  const totalAsignaciones = (asignaciones ?? []).length;
  const corregidas = (correcciones ?? []).length;
  const derivadas = (reglas ?? []).filter((r) => r.origen === "derivada");
  const aprobadas = derivadas.filter((r) => r.confirmada_por !== null).length;
  const lotesConfirmados = (lotes ?? []).length;

  return {
    reglas: reglas ?? [],
    umbrales,
    nombres: {
      empleados: Object.fromEntries(
        (empleados ?? []).map((e) => [e.id as string, `${e.nombre} ${e.apellido}`]),
      ),
      aptitudes: Object.fromEntries(catalogos.aptitudes),
      certificados: Object.fromEntries(catalogos.tiposCertificado),
      departamentos: Object.fromEntries(catalogos.departamentos),
      puestos: Object.fromEntries((puestos ?? []).map((p) => [p.id as string, p.nombre as string])),
    },
    metricas: {
      totalAsignaciones,
      corregidas,
      // Sin asignaciones todavía no hay tasa: se informa como tal, no como 0 %.
      aceptacionSinCambios:
        totalAsignaciones > 0
          ? Math.round(((totalAsignaciones - corregidas) / totalAsignaciones) * 100)
          : null,
      correccionesPorLote:
        lotesConfirmados > 0 ? Math.round((corregidas / lotesConfirmados) * 10) / 10 : null,
      reglasPropuestas: derivadas.length,
      reglasAprobadas: aprobadas,
      tasaAprobacion: derivadas.length > 0 ? Math.round((aprobadas / derivadas.length) * 100) : null,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId, userId } = await requireSesion(request, context);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = String(formData.get("reglaId") ?? "");

  if (intent === "alternar") {
    const activar = formData.get("activa") !== "true";
    await supabase
      .from("reglas_empresa")
      .update({ activa: activar, confirmada_por: activar ? userId : null })
      .eq("id", id)
      .eq("empresa_id", empresaId);
    return { ok: true, mensaje: activar ? "Regla activada." : "Regla desactivada." };
  }

  if (intent === "umbrales") {
    const general = Number(formData.get("umbralGeneral") ?? UMBRALES_POR_DEFECTO.general);
    const critica = Number(formData.get("umbralCritica") ?? UMBRALES_POR_DEFECTO.critica);

    if (!Number.isFinite(general) || general < 0 || general > 100) {
      return { ok: false, mensaje: "El mínimo general tiene que estar entre 0 y 100." };
    }
    if (critica < general) {
      return {
        ok: false,
        mensaje:
          "El mínimo de las tareas críticas no puede ser menor que el general: la tarea más importante " +
          "estaría pidiendo menos que el resto.",
      };
    }

    const { error } = await supabase
      .from("config_tukson")
      .upsert(
        { empresa_id: empresaId, umbral_general: general, umbral_critica: critica, actualizado_en: new Date().toISOString() },
        { onConflict: "empresa_id" },
      );

    if (error) return { ok: false, mensaje: "No pudimos guardar el mínimo. Probá de nuevo." };
    return { ok: true, mensaje: "Mínimo de puntaje actualizado." };
  }

  if (intent === "borrar") {
    await supabase.from("reglas_empresa").delete().eq("id", id).eq("empresa_id", empresaId);
    return { ok: true, mensaje: "Regla eliminada." };
  }

  if (intent === "editar") {
    const vigencia = String(formData.get("vigenciaHasta") ?? "").trim();
    const { data: actual } = await supabase
      .from("reglas_empresa")
      .select("condiciones")
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .single();

    const condiciones = { ...(actual?.condiciones ?? {}) };
    if (vigencia) condiciones.vigenciaHasta = vigencia;
    else delete condiciones.vigenciaHasta;

    await supabase
      .from("reglas_empresa")
      .update({
        enunciado: String(formData.get("enunciado") ?? "").slice(0, 300),
        peso: Number(formData.get("peso") ?? 0),
        condiciones,
      })
      .eq("id", id)
      .eq("empresa_id", empresaId);

    return { ok: true, mensaje: "Regla actualizada." };
  }

  return { ok: false };
}

export default function Reglas({ loaderData, actionData }: Route.ComponentProps) {
  const { reglas, metricas } = loaderData;
  const mensaje = actionData && "mensaje" in actionData ? actionData.mensaje : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-pantalla font-bold text-texto">Reglas de Tukson</h1>
        <p className="mt-1 max-w-3xl text-cuerpo text-secundario">
          Todo lo que Tukson aprendió de tus correcciones, escrito en palabras y editable. No hay nada que
          Tukson sepa que no esté en esta lista.
        </p>
      </div>

      {mensaje && <Aviso tono="exito">{mensaje}</Aviso>}

      <Metricas datos={metricas} />

      <Umbrales actuales={loaderData.umbrales} />

      {reglas.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay reglas"
          explicacion="Las reglas aparecen cuando corregís una asignación y explicás por qué. Tukson te propone la regla y vos decidís si la aplicás siempre o si fue un caso puntual."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {reglas.map((r) => (
            <TarjetaRegla key={r.id} regla={r} nombres={loaderData.nombres} />
          ))}
        </div>
      )}
    </div>
  );
}

// El mínimo de puntaje para que Tukson asigne sola una tarea
// (06-tukson-mejoras.md §1.3). Vive acá y no escondido en el código porque un
// umbral que no se ve no se puede discutir, y el valor correcto depende del
// tamaño del equipo: un taller de cinco personas necesita ser más permisivo
// que una planta de ochenta.
function Umbrales({ actuales }: { actuales: { general: number; critica: number } }) {
  return (
    <section className="tarjeta p-6">
      <h2 className="text-tarjeta font-semibold text-texto">Cuándo Tukson asigna sola</h2>
      <p className="mt-1 max-w-3xl text-menor text-secundario">
        Si el mejor candidato no llega a este puntaje, la tarea queda sin asignar y se muestra igual quién
        era, con su puntaje, para que decidas vos. Sirve para que el sistema no proponga como recomendación
        a alguien que apenas puede hacer la tarea.
      </p>

      <Form method="post" className="mt-4 flex flex-wrap items-end gap-4">
        <input type="hidden" name="intent" value="umbrales" />
        <Campo
          etiqueta="Mínimo general"
          name="umbralGeneral"
          type="number"
          min={0}
          max={100}
          defaultValue={String(actuales.general)}
          className="max-w-40"
          ayuda={`Sobre 100. Por defecto ${UMBRALES_POR_DEFECTO.general}.`}
        />
        <Campo
          etiqueta="Mínimo en tareas críticas"
          name="umbralCritica"
          type="number"
          min={0}
          max={100}
          defaultValue={String(actuales.critica)}
          className="max-w-48"
          ayuda={`Más exigente: ahí equivocarse cuesta más. Por defecto ${UMBRALES_POR_DEFECTO.critica}.`}
        />
        <BotonEnviar variante="secundario" className="mb-6">
          Guardar
        </BotonEnviar>
      </Form>
    </section>
  );
}

function Metricas({ datos }: { datos: Route.ComponentProps["loaderData"]["metricas"] }) {
  const tarjetas = [
    {
      etiqueta: "Aceptación sin cambios",
      valor: datos.aceptacionSinCambios,
      sufijo: "%",
      detalle: `${datos.totalAsignaciones - datos.corregidas} de ${datos.totalAsignaciones} asignaciones se confirmaron sin corregir`,
      vacio: "Todavía no hubo asignaciones para medir",
    },
    {
      etiqueta: "Correcciones por lote",
      valor: datos.correccionesPorLote,
      sufijo: "",
      detalle: "Debería bajar con el tiempo si el aprendizaje sirve",
      vacio: "Todavía no confirmaste ningún lote",
    },
    {
      etiqueta: "Reglas aprobadas",
      valor: datos.tasaAprobacion,
      sufijo: "%",
      detalle: `${datos.reglasAprobadas} de ${datos.reglasPropuestas} propuestas. Si es muy baja, Tukson está sobreinterpretando`,
      vacio: "Todavía no se propuso ninguna regla",
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {tarjetas.map((t) => (
        <div key={t.etiqueta} className="tarjeta p-6">
          <p className="text-menor text-secundario">{t.etiqueta}</p>
          {/* Sin datos no se muestra un cero que parecería un resultado malo:
              se dice que todavía no hay con qué medir. */}
          {t.valor === null ? (
            <p className="mt-2 text-menor text-secundario">{t.vacio}</p>
          ) : (
            <>
              <p className="mt-1 text-seccion font-semibold tabular text-texto">
                {t.valor}
                {t.sufijo}
              </p>
              <p className="mt-1 text-auxiliar text-secundario">{t.detalle}</p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

interface FilaRegla {
  id: string;
  tipo: string;
  enunciado: string;
  peso: number;
  activa: boolean;
  origen: string;
  condiciones: CondicionesRegla | null;
  creada_en: string;
}

export interface NombresDeCatalogo {
  empleados: Record<string, string>;
  aptitudes: Record<string, string>;
  certificados: Record<string, string>;
  departamentos: Record<string, string>;
  puestos: Record<string, string>;
}

function TarjetaRegla({ regla, nombres }: { regla: FilaRegla; nombres: NombresDeCatalogo }) {
  const vigencia = regla.condiciones?.vigenciaHasta;
  const vencida = vigencia ? new Date(`${vigencia}T23:59:59Z`) < new Date() : false;

  // A qué aplica la regla, en palabras. Lo que está guardado son ids; sin
  // esto la persona tiene que confiar en que el sistema entendió lo que quiso
  // decir, sin poder verificarlo.
  const buscar = (mapa: Record<string, string>, falta: string) => (id: string) => mapa[id] ?? falta;
  const alcance = describirCondiciones(regla.condiciones, {
    empleado: buscar(nombres.empleados, "un empleado que ya no está"),
    departamento: buscar(nombres.departamentos, "un departamento borrado"),
    puesto: buscar(nombres.puestos, "un puesto borrado"),
    aptitud: buscar(nombres.aptitudes, "una aptitud borrada"),
    certificado: buscar(nombres.certificados, "un certificado borrado"),
  });

  return (
    <section className="tarjeta p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-cuerpo text-texto">{regla.enunciado}</p>
          <p className="mt-1 text-menor text-texto">{alcance}</p>
          <p className="mt-1 text-auxiliar text-secundario">
            {ETIQUETA_TIPO[regla.tipo] ?? regla.tipo} · {EXPLICACION_TIPO[regla.tipo] ?? ""}{" "}
            {regla.origen === "derivada" ? "Salió de una corrección tuya." : "Cargada a mano."}
          </p>
          {vencida && (
            <p className="mt-1 text-auxiliar text-secundario">
              Venció el {vigencia!.split("-").reverse().join("/")}: ya no se aplica.
            </p>
          )}

          {/* Una regla que depende de las palabras del título no agarra la
              tarea de mañana si alguien la escribe distinto. Se dice, para
              que se pueda cambiar por el requisito. */}
          {esFragilPorTitulo(regla.condiciones) && (
            <p className="mt-2 text-auxiliar text-advertencia">
              Esta regla depende de que la tarea diga esa palabra en el título. Si mañana la misma tarea se
              escribe de otra forma, la regla no se va a aplicar. Conviene rehacerla sobre la aptitud o el
              certificado que la tarea requiere.
            </p>
          )}
        </div>

        <Form method="post">
          <input type="hidden" name="intent" value="alternar" />
          <input type="hidden" name="reglaId" value={regla.id} />
          <input type="hidden" name="activa" value={String(regla.activa)} />
          <Boton variante={regla.activa ? "secundario" : "principal"} type="submit">
            {regla.activa ? "Desactivar" : "Activar"}
          </Boton>
        </Form>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-menor text-primario">Editar</summary>
        <Form method="post" className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="intent" value="editar" />
          <input type="hidden" name="reglaId" value={regla.id} />

          <Campo etiqueta="Enunciado" name="enunciado" defaultValue={regla.enunciado} obligatorio />

          <div className="grid gap-6 md:grid-cols-2">
            <Selector
              etiqueta="Peso"
              name="peso"
              defaultValue={String(regla.peso)}
              ayuda="Cuánto suma o resta al puntaje. Las de exclusión descartan igual."
            >
              {[-10, -5, -2, 0, 2, 5, 10].map((p) => (
                <option key={p} value={p}>
                  {p > 0 ? `+${p}` : p}
                </option>
              ))}
            </Selector>
            <Campo
              etiqueta="Se aplica hasta"
              name="vigenciaHasta"
              type="date"
              defaultValue={vigencia ?? ""}
              ayuda="Vacío significa que no vence."
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <BotonEnviar variante="principal" etiquetaCargando="Guardando…">
              Guardar cambios
            </BotonEnviar>
          </div>
        </Form>

        <Form
          method="post"
          className="mt-4 border-t border-borde-decorativo pt-4"
          onSubmit={(e) =>
            !confirm(
              `Se elimina la regla "${regla.enunciado}" y Tukson deja de tenerla en cuenta. Esto no se puede deshacer. ¿Eliminarla?`,
            ) && e.preventDefault()
          }
        >
          <input type="hidden" name="intent" value="borrar" />
          <input type="hidden" name="reglaId" value={regla.id} />
          <Boton variante="destructivo" type="submit">
            Eliminar regla
          </Boton>
        </Form>
      </details>
    </section>
  );
}
