import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { cargarCandidatos, cargarCatalogos, cargarReglas } from "~/lib/tukson.server";
import { extraerTexto } from "~/lib/tukson/extraccion.server";
import { lineasDeTareas } from "~/lib/tukson/extraccion";
import { asignarLote, resumirReparto } from "~/lib/tukson/asignar";
import { motivoSinCandidatos } from "~/lib/tukson/filtro";
import { justificacionPorPlantilla } from "~/lib/tukson/plantilla";
import { proveedorConfigurado } from "~/lib/tukson/proveedor";
import { ORDEN_PRIORIDAD, type Prioridad } from "~/lib/tukson/tipos";
import { Boton, BotonEnviar } from "~/components/ui/boton";
import { AreaTexto, Campo, Selector } from "~/components/ui/campo";
import { Aviso, EstadoVacio } from "~/components/ui/estados";
import type { Route } from "./+types/index";

const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

const formatearFecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  const [catalogos, { data: lote }] = await Promise.all([
    cargarCatalogos(supabase, empresaId),
    supabase
      .from("lotes_asignacion")
      .select("*")
      .eq("empresa_id", empresaId)
      .neq("estado", "confirmado")
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: tareas } = lote
    ? await supabase.from("tareas").select("*").eq("lote_id", lote.id).order("creado_en")
    : { data: [] };

  return {
    lote,
    tareas: tareas ?? [],
    aptitudes: [...catalogos.aptitudes].map(([id, nombre]) => ({ id, nombre })),
    tiposCertificado: [...catalogos.tiposCertificado].map(([id, nombre]) => ({ id, nombre })),
    departamentos: [...catalogos.departamentos].map(([id, nombre]) => ({ id, nombre })),
    // La pantalla dice de frente si hay modelo conectado o no.
    conModelo: proveedorConfigurado() !== null,
  };
}

interface Errores {
  _form?: string[];
  [campo: string]: string[] | undefined;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId, userId } = await requireSesion(request, context);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // --- Paso 1: ingesta -----------------------------------------------------
  if (intent === "ingerir") {
    let texto = String(formData.get("texto") ?? "");
    const archivo = formData.get("archivo");

    if (archivo instanceof File && archivo.size > 0) {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const resultado = await extraerTexto(bytes, archivo.name);
      if (!resultado.ok) return { errores: { _form: [resultado.motivo] } as Errores };
      texto = resultado.texto;
    }

    const lineas = lineasDeTareas(texto);
    if (lineas.length === 0) {
      return {
        errores: {
          _form: ["No encontramos ninguna tarea. Escribí una por línea o subí un documento con texto."],
        } as Errores,
      };
    }

    const { data: lote, error } = await supabase
      .from("lotes_asignacion")
      .insert({
        empresa_id: empresaId,
        origen: archivo instanceof File && archivo.size > 0 ? "documento" : "texto",
        estado: "borrador",
        creado_por: userId,
      })
      .select("id")
      .single();

    if (error || !lote) return { errores: { _form: ["No pudimos crear el lote."] } as Errores };

    // Sin modelo conectado, cada línea es una tarea con su título tal cual se
    // escribió. El paso 2 existe igual: el usuario completa lo que falte.
    const { error: errorTareas } = await supabase.from("tareas").insert(
      lineas.map((titulo) => ({
        empresa_id: empresaId,
        lote_id: lote.id,
        titulo: titulo.slice(0, 200),
        prioridad: "media",
      })),
    );
    if (errorTareas) return { errores: { _form: ["No pudimos guardar las tareas."] } as Errores };

    return { ok: true };
  }

  const loteId = String(formData.get("loteId") ?? "");

  // --- Paso 2: revisión ----------------------------------------------------
  if (intent === "guardar-tarea") {
    const id = String(formData.get("tareaId"));
    const duracion = formData.get("duracion");

    await supabase
      .from("tareas")
      .update({
        titulo: String(formData.get("titulo") ?? "").slice(0, 200),
        prioridad: String(formData.get("prioridad") ?? "media"),
        duracion_estimada_min: duracion ? Number(duracion) : null,
        aptitudes_requeridas: formData.getAll("aptitudes").map(String),
        certificados_requeridos: formData.getAll("certificados").map(String),
        departamento_sugerido_id: String(formData.get("departamento") ?? "") || null,
        departamento_es_requisito: formData.get("departamentoRequisito") === "on",
      })
      .eq("id", id)
      .eq("empresa_id", empresaId);

    return { ok: true, mensaje: "Tarea actualizada." };
  }

  if (intent === "quitar-tarea") {
    await supabase
      .from("tareas")
      .delete()
      .eq("id", String(formData.get("tareaId")))
      .eq("empresa_id", empresaId);
    return { ok: true };
  }

  if (intent === "descartar") {
    await supabase.from("lotes_asignacion").delete().eq("id", loteId).eq("empresa_id", empresaId);
    return { ok: true, mensaje: "Se descartó el análisis." };
  }

  // --- Paso 3: análisis ----------------------------------------------------
  if (intent === "analizar") {
    const [{ data: filas }, candidatos, reglas] = await Promise.all([
      supabase.from("tareas").select("*").eq("lote_id", loteId).eq("empresa_id", empresaId),
      cargarCandidatos(supabase, empresaId),
      cargarReglas(supabase, empresaId, true),
    ]);

    const tareas = (filas ?? []).map((t) => ({
      id: t.id as string,
      titulo: t.titulo as string,
      prioridad: t.prioridad as Prioridad,
      duracionEstimadaMin: t.duracion_estimada_min as number | null,
      aptitudesRequeridas: (t.aptitudes_requeridas ?? []) as string[],
      certificadosRequeridos: (t.certificados_requeridos ?? []) as string[],
      departamentoSugeridoId: t.departamento_sugerido_id as string | null,
      departamentoEsRequisito: Boolean(t.departamento_es_requisito),
    }));

    const resultados = asignarLote(tareas, candidatos, reglas);
    const catalogos = await cargarCatalogos(supabase, empresaId);
    const nombreAptitud = (id: string) => catalogos.aptitudes.get(id) ?? "aptitud";

    // Se borra la propuesta anterior: volver a analizar reemplaza, no acumula.
    await supabase.from("asignaciones").delete().eq("lote_id", loteId).eq("empresa_id", empresaId);

    const nuevas = resultados
      .filter((r) => r.elegido)
      .map((r) => ({
        empresa_id: empresaId,
        tarea_id: r.tarea.id,
        empleado_id: r.elegido!.candidato.id,
        lote_id: loteId,
        score: r.elegido!.desglose.total,
        desglose: r.elegido!.desglose,
        // Sin modelo conectado la elección es por puntaje: el origen dice la
        // verdad sobre quién decidió.
        origen: "manual",
        justificacion: justificacionPorPlantilla(r.elegido!.desglose, nombreAptitud),
        estado: "propuesta",
      }));

    if (nuevas.length > 0) await supabase.from("asignaciones").insert(nuevas);

    await supabase
      .from("tareas")
      .update({ estado: "asignada" })
      .in(
        "id",
        resultados.filter((r) => r.elegido).map((r) => r.tarea.id),
      );

    await supabase
      .from("lotes_asignacion")
      .update({
        estado: "analizado",
        resumen: JSON.stringify({
          ...resumirReparto(resultados),
          sinCandidatos: resultados
            .filter((r) => !r.elegido)
            .map((r) => ({
              tareaId: r.tarea.id,
              titulo: r.tarea.titulo,
              motivo: motivoSinCandidatos(
                r.descartes,
                (id) => catalogos.tiposCertificado.get(id) ?? "el certificado requerido",
                formatearFecha,
              ),
            })),
        }),
      })
      .eq("id", loteId)
      .eq("empresa_id", empresaId);

    return { ok: true };
  }

  // --- Paso 4: confirmación ------------------------------------------------
  if (intent === "confirmar") {
    await supabase
      .from("asignaciones")
      .update({ estado: "confirmada" })
      .eq("lote_id", loteId)
      .eq("empresa_id", empresaId);

    await supabase
      .from("lotes_asignacion")
      .update({ estado: "confirmado" })
      .eq("id", loteId)
      .eq("empresa_id", empresaId);

    return { ok: true, mensaje: "Asignaciones confirmadas." };
  }

  return { errores: { _form: ["Acción desconocida."] } as Errores };
}

export default function Tukson({ loaderData, actionData }: Route.ComponentProps) {
  const { lote, tareas, aptitudes, tiposCertificado, departamentos, conModelo } = loaderData;
  const navegacion = useNavigation();
  const errores = actionData?.errores;
  const mensaje = actionData && "mensaje" in actionData ? actionData.mensaje : undefined;

  const paso = !lote ? 1 : lote.estado === "borrador" ? 2 : 3;
  const analizando = navegacion.formData?.get("intent") === "analizar";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-pantalla font-bold text-texto">Tukson</h1>
        <p className="mt-1 max-w-3xl text-cuerpo text-secundario">
          Recibe las tareas del día y propone quién hace cada una, con el motivo a la vista. Vos corregís lo que
          quieras y ese cambio se puede convertir en una regla.
        </p>
      </div>

      {!conModelo && (
        <Aviso tono="info" titulo="Tukson está funcionando sin modelo de lenguaje">
          El filtro de quién puede hacer cada tarea, el puntaje y el reparto de carga son cálculo propio y
          funcionan igual. Lo que falta es la interpretación de texto libre: por ahora cada línea que escribas
          es una tarea, y los requisitos los completás vos en el paso siguiente.
        </Aviso>
      )}

      {errores?._form && (
        <Aviso tono="error" titulo="No pudimos continuar">
          {errores._form[0]}
        </Aviso>
      )}
      {mensaje && <Aviso tono="exito">{mensaje}</Aviso>}

      <Pasos actual={paso} />

      {paso === 1 && <Ingesta />}

      {paso === 2 && lote && (
        <Revision
          loteId={lote.id}
          tareas={tareas}
          aptitudes={aptitudes}
          tiposCertificado={tiposCertificado}
          departamentos={departamentos}
          analizando={analizando}
        />
      )}

      {paso === 3 && lote && <Propuesta loteId={lote.id} resumen={lote.resumen} />}
    </div>
  );
}

// Durante el análisis se dice en qué paso está, no una rueda anónima: el
// proceso puede tardar y la persona tiene que entender qué está pasando.
function Pasos({ actual }: { actual: number }) {
  const nombres = ["Ingesta", "Revisión de tareas", "Propuesta", "Confirmación"];

  return (
    <ol className="flex flex-wrap gap-2" aria-label="Progreso">
      {nombres.map((nombre, i) => {
        const numero = i + 1;
        const estado = numero < actual ? "hecho" : numero === actual ? "actual" : "pendiente";
        return (
          <li
            key={nombre}
            aria-current={estado === "actual" ? "step" : undefined}
            className={`rounded-control px-3 py-2 text-menor ${
              estado === "actual"
                ? "bg-primario-claro font-medium text-primario"
                : estado === "hecho"
                  ? "text-exito"
                  : "text-secundario"
            }`}
          >
            {numero}. {nombre}
          </li>
        );
      })}
    </ol>
  );
}

function Ingesta() {
  return (
    <Form method="post" encType="multipart/form-data" className="grid gap-6 lg:grid-cols-2">
      <input type="hidden" name="intent" value="ingerir" />

      {/* Las dos opciones con el mismo peso visual: para el usuario objetivo,
          un botón de elegir archivo es más confiable que arrastrar. */}
      <section className="tarjeta p-6">
        <h2 className="text-tarjeta font-semibold text-texto">Escribir las tareas</h2>
        <p className="mt-1 text-menor text-secundario">Una por línea. Las viñetas y la numeración se ignoran.</p>
        <div className="mt-4">
          <AreaTexto
            etiqueta="Tareas del día"
            name="texto"
            rows={10}
            placeholder={"Reparar bomba hidráulica del sector 3\nRevisar tablero eléctrico del galpón norte\nCambiar filtros de la línea 2"}
          />
        </div>
      </section>

      <section className="tarjeta p-6">
        <h2 className="text-tarjeta font-semibold text-texto">Subir un documento</h2>
        <p className="mt-1 text-menor text-secundario">
          PDF o Word, hasta 10 MB. Si el PDF es un escaneo sin texto seleccionable te lo vamos a decir en vez de
          adivinar.
        </p>
        <div className="mt-4">
          <Campo etiqueta="Archivo" type="file" name="archivo" accept=".pdf,.docx" />
        </div>
        <BotonEnviar variante="principal" etiquetaCargando="Leyendo…" className="mt-4">
          Continuar
        </BotonEnviar>
      </section>
    </Form>
  );
}

interface FilaTarea {
  id: string;
  titulo: string;
  prioridad: Prioridad;
  duracion_estimada_min: number | null;
  aptitudes_requeridas: string[] | null;
  certificados_requeridos: string[] | null;
  departamento_sugerido_id: string | null;
  departamento_es_requisito: boolean;
}

function Revision({
  loteId,
  tareas,
  aptitudes,
  tiposCertificado,
  departamentos,
  analizando,
}: {
  loteId: string;
  tareas: FilaTarea[];
  aptitudes: { id: string; nombre: string }[];
  tiposCertificado: { id: string; nombre: string }[];
  departamentos: { id: string; nombre: string }[];
  analizando: boolean;
}) {
  const ordenadas = [...tareas].sort(
    (a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-cuerpo font-medium text-texto">
          Se identificaron {tareas.length} {tareas.length === 1 ? "tarea" : "tareas"}.
        </p>
        <div className="flex gap-3">
          <Form method="post">
            <input type="hidden" name="intent" value="descartar" />
            <input type="hidden" name="loteId" value={loteId} />
            <Boton variante="secundario" type="submit">
              Descartar y empezar de nuevo
            </Boton>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="analizar" />
            <input type="hidden" name="loteId" value={loteId} />
            <Boton
              variante="principal"
              type="submit"
              cargando={analizando}
              etiquetaCargando="Evaluando candidatos…"
            >
              Analizar y proponer
            </Boton>
          </Form>
        </div>
      </div>

      <p className="text-menor text-secundario">
        Revisá cada tarea antes de asignar. Una tarea mal interpretada y asignada automáticamente es peor que no
        tener la función, así que este paso no se puede saltear.
      </p>

      {ordenadas.map((t) => (
        <TarjetaTarea
          key={t.id}
          tarea={t}
          loteId={loteId}
          aptitudes={aptitudes}
          tiposCertificado={tiposCertificado}
          departamentos={departamentos}
        />
      ))}
    </div>
  );
}

function TarjetaTarea({
  tarea,
  loteId,
  aptitudes,
  tiposCertificado,
  departamentos,
}: {
  tarea: FilaTarea;
  loteId: string;
  aptitudes: { id: string; nombre: string }[];
  tiposCertificado: { id: string; nombre: string }[];
  departamentos: { id: string; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const requeridas = tarea.aptitudes_requeridas ?? [];
  const certificados = tarea.certificados_requeridos ?? [];

  return (
    <section className="tarjeta p-6">
      <Form method="post" className="flex flex-col gap-6">
        <input type="hidden" name="intent" value="guardar-tarea" />
        <input type="hidden" name="loteId" value={loteId} />
        <input type="hidden" name="tareaId" value={tarea.id} />

        <div className="grid gap-6 md:grid-cols-[2fr_1fr_1fr]">
          <Campo etiqueta="Tarea" name="titulo" defaultValue={tarea.titulo} obligatorio />
          <Selector etiqueta="Prioridad" name="prioridad" defaultValue={tarea.prioridad}>
            {Object.entries(ETIQUETA_PRIORIDAD).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Selector>
          <Campo
            etiqueta="Duración estimada"
            name="duracion"
            type="number"
            min={5}
            step={5}
            defaultValue={tarea.duracion_estimada_min ?? ""}
            ayuda="En minutos"
          />
        </div>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="boton boton-terciario self-start"
          aria-expanded={abierto}
        >
          {abierto ? "Ocultar requisitos" : `Requisitos (${requeridas.length + certificados.length})`}
        </button>

        {abierto && (
          <div className="grid gap-6 md:grid-cols-3">
            <Grupo titulo="Aptitudes que requiere" nombre="aptitudes" opciones={aptitudes} marcadas={requeridas} />
            <Grupo
              titulo="Certificados obligatorios"
              nombre="certificados"
              opciones={tiposCertificado}
              marcadas={certificados}
              ayuda="Quien no lo tenga vigente queda fuera, sin excepción."
            />
            <div className="flex flex-col gap-3">
              <Selector
                etiqueta="Departamento"
                name="departamento"
                defaultValue={tarea.departamento_sugerido_id ?? ""}
              >
                <option value="">Cualquiera</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </Selector>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="departamentoRequisito"
                  defaultChecked={tarea.departamento_es_requisito}
                  className="mt-1"
                />
                <span className="text-menor">
                  Es un requisito, no una sugerencia
                  <span className="block text-auxiliar text-secundario">
                    Como requisito descarta a todo el resto. Como sugerencia solo resta puntos.
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <BotonEnviar variante="secundario" etiquetaCargando="Guardando…">
            Guardar cambios
          </BotonEnviar>
        </div>
      </Form>

      <Form method="post" className="mt-3">
        <input type="hidden" name="intent" value="quitar-tarea" />
        <input type="hidden" name="loteId" value={loteId} />
        <input type="hidden" name="tareaId" value={tarea.id} />
        <Boton variante="terciario" type="submit">
          Quitar esta tarea
        </Boton>
      </Form>
    </section>
  );
}

function Grupo({
  titulo,
  nombre,
  opciones,
  marcadas,
  ayuda,
}: {
  titulo: string;
  nombre: string;
  opciones: { id: string; nombre: string }[];
  marcadas: string[];
  ayuda?: string;
}) {
  return (
    <fieldset>
      <legend className="text-menor font-medium text-texto">{titulo}</legend>
      {ayuda && <p className="mt-1 text-auxiliar text-secundario">{ayuda}</p>}
      <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
        {opciones.length === 0 ? (
          <p className="text-auxiliar text-secundario">Nada cargado en el catálogo todavía.</p>
        ) : (
          opciones.map((o) => (
            <label key={o.id} className="flex items-center gap-2">
              <input type="checkbox" name={nombre} value={o.id} defaultChecked={marcadas.includes(o.id)} />
              <span className="text-menor">{o.nombre}</span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}

function Propuesta({ loteId, resumen }: { loteId: string; resumen: string | null }) {
  const datos = resumen ? (JSON.parse(resumen) as ResumenGuardado) : null;

  return (
    <div className="flex flex-col gap-6">
      {datos && <ResumenReparto datos={datos} />}

      {datos && datos.sinCandidatos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-tarjeta font-semibold text-texto">Tareas sin candidatos</h2>
          {datos.sinCandidatos.map((t) => (
            <Aviso key={t.tareaId} tono="advertencia" titulo={t.titulo}>
              {t.motivo}
            </Aviso>
          ))}
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Form method="post">
          <input type="hidden" name="intent" value="confirmar" />
          <input type="hidden" name="loteId" value={loteId} />
          <BotonEnviar variante="principal" etiquetaCargando="Confirmando…">
            Confirmar asignaciones
          </BotonEnviar>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="descartar" />
          <input type="hidden" name="loteId" value={loteId} />
          <Boton variante="secundario" type="submit">
            Descartar
          </Boton>
        </Form>
      </div>
    </div>
  );
}

interface ResumenGuardado {
  tareasAsignadas: number;
  tareasSinCandidatos: number;
  personas: number;
  cargaMaxima: { nombre: string; minutos: number; capacidad: number } | null;
  sinCandidatos: { tareaId: string; titulo: string; motivo: string }[];
}

function ResumenReparto({ datos }: { datos: ResumenGuardado }) {
  const horas = (min: number) => (min / 60).toFixed(1).replace(".", ",").replace(",0", "");

  if (datos.tareasAsignadas === 0) {
    return (
      <EstadoVacio
        titulo="Ninguna tarea pudo asignarse"
        explicacion="Todas las tareas quedaron sin candidatos. Abajo está el motivo de cada una: casi siempre es un certificado vencido o un requisito demasiado estrecho."
      />
    );
  }

  return (
    <section className="tarjeta p-6">
      <p className="text-cuerpo text-texto">
        <strong className="font-semibold">{datos.tareasAsignadas}</strong>{" "}
        {datos.tareasAsignadas === 1 ? "tarea asignada" : "tareas asignadas"} a{" "}
        <strong className="font-semibold">{datos.personas}</strong>{" "}
        {datos.personas === 1 ? "empleado" : "empleados"}.
        {datos.cargaMaxima && (
          <>
            {" "}
            Carga máxima: {horas(datos.cargaMaxima.minutos)} de {horas(datos.cargaMaxima.capacidad)} horas (
            {datos.cargaMaxima.nombre}).
          </>
        )}
      </p>
    </section>
  );
}
