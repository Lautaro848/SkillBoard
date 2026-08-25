import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { urlesFirmadas } from "~/lib/storage.server";
import { SlideCarrusel } from "~/components/slide-carrusel";
import type { EmpleadoCarrusel } from "~/lib/carrusel";
import {
  CAMPOS_BLOQUEADOS,
  CAMPOS_CARRUSEL,
  carruselSchema,
  generarToken,
  leerFormularioCarrusel,
  type CampoCarrusel,
} from "~/lib/validation/carrusel";
import type { Route } from "./+types/index";

const CAMPOS_POR_DEFECTO: Record<CampoCarrusel, boolean> = {
  foto: true,
  puesto: true,
  departamento: true,
  antiguedad: true,
  certificados: false,
};

interface FilaEmpleado extends EmpleadoCarrusel {
  departamentoId: string | null;
  puestoId: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  const [{ data: carruseles }, { data: departamentos }, { data: puestos }, { data: empleados }, { data: certs }] =
    await Promise.all([
      supabase.from("carruseles").select("*").eq("empresa_id", empresaId).order("creado_en"),
      supabase.from("departamentos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase.from("puestos").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
      supabase
        .from("empleados")
        .select("id, nombre, apellido, foto_url, fecha_ingreso, puesto_id, departamento_id")
        .eq("empresa_id", empresaId)
        .is("eliminado_en", null)
        .neq("estado", "baja")
        .order("apellido"),
      supabase.from("v_certificados").select("empleado_id, tipo_id, estado").eq("empresa_id", empresaId),
    ]);

  const [{ data: tipos }, fotos] = await Promise.all([
    supabase.from("tipos_certificado").select("id, nombre").eq("empresa_id", empresaId),
    // Una sola llamada para todas las fotos: la vista previa muestra lo mismo
    // que la TV, así que necesita las fotos de verdad.
    urlesFirmadas(
      supabase,
      (empleados ?? []).map((e) => e.foto_url).filter((k): k is string => Boolean(k)),
    ),
  ]);

  const nombreTipo = new Map((tipos ?? []).map((t) => [t.id as string, t.nombre as string]));
  const vigentesPorEmpleado = new Map<string, string[]>();
  for (const c of certs ?? []) {
    if (c.estado !== "vigente" && c.estado !== "sin_vencimiento") continue;
    const lista = vigentesPorEmpleado.get(c.empleado_id) ?? [];
    lista.push(nombreTipo.get(c.tipo_id) ?? "—");
    vigentesPorEmpleado.set(c.empleado_id, lista);
  }

  const filas: FilaEmpleado[] = (empleados ?? []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    apellido: e.apellido,
    fotoKey: e.foto_url,
    fotoUrl: e.foto_url ? (fotos.get(e.foto_url) ?? null) : null,
    puesto: (puestos ?? []).find((p) => p.id === e.puesto_id)?.nombre ?? null,
    departamento: (departamentos ?? []).find((d) => d.id === e.departamento_id)?.nombre ?? null,
    fechaIngreso: e.fecha_ingreso,
    certificados: [...new Set(vigentesPorEmpleado.get(e.id) ?? [])],
    departamentoId: e.departamento_id,
    puestoId: e.puesto_id,
  }));

  return {
    carruseles: carruseles ?? [],
    departamentos: departamentos ?? [],
    puestos: puestos ?? [],
    empleados: filas,
    origen: new URL(request.url).origin,
  };
}

interface Errores {
  _form?: string[];
  [campo: string]: string[] | undefined;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id") as string | null;

  if (intent === "crear") {
    const { error } = await supabase.from("carruseles").insert({
      empresa_id: empresaId,
      nombre: "Carrusel sin nombre",
      token: generarToken(),
      campos_visibles: CAMPOS_POR_DEFECTO,
      filtros: {},
    });
    if (error) return { errores: { _form: ["No pudimos crear el carrusel."] } as Errores };
    return { ok: true };
  }

  if (intent === "rotar") {
    // El enlace viejo deja de servir en el acto: la TV que lo tenga abierto
    // se corta en el próximo refresco, a los 30 segundos como mucho.
    const { error } = await supabase
      .from("carruseles")
      .update({ token: generarToken() })
      .eq("id", id)
      .eq("empresa_id", empresaId);
    if (error) return { errores: { _form: ["No pudimos rotar el enlace."] } as Errores };
    return { ok: true, mensaje: "Enlace rotado. El anterior ya no funciona." };
  }

  if (intent === "borrar") {
    await supabase.from("carruseles").delete().eq("id", id).eq("empresa_id", empresaId);
    return { ok: true };
  }

  const parsed = carruselSchema.safeParse(leerFormularioCarrusel(formData));
  if (!parsed.success) {
    return { errores: parsed.error.flatten().fieldErrors as Errores };
  }

  // Los campos permitidos se guardan como un objeto cerrado: lo que no está
  // en CAMPOS_CARRUSEL no llega a la base aunque se agregue a mano al form.
  const campos = Object.fromEntries(
    CAMPOS_CARRUSEL.map((c) => [c.clave, parsed.data.campos.includes(c.clave)]),
  );

  const { error } = await supabase
    .from("carruseles")
    .update({
      nombre: parsed.data.nombre,
      segundos_por_slide: parsed.data.segundosPorSlide,
      activo: parsed.data.activo,
      campos_visibles: campos,
      filtros: {
        departamentos: parsed.data.departamentos,
        puestos: parsed.data.puestos,
        empleados: parsed.data.empleados,
      },
    })
    .eq("id", id)
    .eq("empresa_id", empresaId);

  if (error) return { errores: { _form: ["No pudimos guardar los cambios."] } as Errores };
  return { ok: true, mensaje: "Cambios guardados." };
}

export default function Carrusel({ loaderData, actionData }: Route.ComponentProps) {
  const { carruseles, departamentos, puestos, empleados, origen } = loaderData;
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-seccion font-semibold text-texto">Modo carrusel</h1>
          <p className="max-w-2xl text-menor text-secundario">
            Una pantalla para colgar en el comedor o la recepción. Se abre con un enlace propio, sin usuario ni
            contraseña, y muestra a la gente de a una. No espeja tu pantalla: podés seguir usando SkillBoard
            normalmente.
          </p>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="crear" />
          <button
            type="submit"
            className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
          >
            Nuevo carrusel
          </button>
        </Form>
      </div>

      {actionData?.errores?._form && (
        <p className="rounded-control border border-error px-4 py-2 text-menor text-error">
          {actionData.errores._form[0]}
        </p>
      )}
      {actionData && "mensaje" in actionData && actionData.mensaje && (
        <p className="rounded-control border border-exito px-4 py-2 text-menor text-exito">
          {actionData.mensaje}
        </p>
      )}

      {carruseles.length === 0 ? (
        <div className="rounded-tarjeta border border-dashed border-borde-decorativo p-8 text-center">
          <p className="mx-auto max-w-lg text-menor text-secundario">
            Todavía no creaste ningún carrusel. Al crear uno vas a obtener un enlace para abrir en la TV, y podés
            elegir qué gente entra y qué datos se muestran.
          </p>
        </div>
      ) : (
        carruseles.map((c) => (
          <TarjetaCarrusel
            key={c.id}
            carrusel={c}
            origen={origen}
            abierto={editando === c.id}
            onAbrir={() => setEditando(editando === c.id ? null : c.id)}
            departamentos={departamentos}
            puestos={puestos}
            empleados={empleados}
            errores={actionData?.errores}
          />
        ))
      )}
    </div>
  );
}

interface FilaCarrusel {
  id: string;
  nombre: string;
  token: string;
  activo: boolean;
  segundos_por_slide: number;
  campos_visibles: Record<string, boolean> | null;
  filtros: { departamentos?: string[]; puestos?: string[]; empleados?: string[] } | null;
}

function TarjetaCarrusel({
  carrusel,
  origen,
  abierto,
  onAbrir,
  departamentos,
  puestos,
  empleados,
  errores,
}: {
  carrusel: FilaCarrusel;
  origen: string;
  abierto: boolean;
  onAbrir: () => void;
  departamentos: { id: string; nombre: string }[];
  puestos: { id: string; nombre: string }[];
  empleados: FilaEmpleado[];
  errores?: Errores;
}) {
  const url = `${origen}/tv/${carrusel.token}`;
  const guardados = carrusel.filtros ?? {};

  const [campos, setCampos] = useState<Record<CampoCarrusel, boolean>>({
    ...CAMPOS_POR_DEFECTO,
    ...(carrusel.campos_visibles as Record<CampoCarrusel, boolean> | null),
  });
  const [depSel, setDepSel] = useState<string[]>(guardados.departamentos ?? []);
  const [pueSel, setPueSel] = useState<string[]>(guardados.puestos ?? []);
  const [empSel, setEmpSel] = useState<string[]>(guardados.empleados ?? []);
  const [segundos, setSegundos] = useState(carrusel.segundos_por_slide);
  const [copiado, setCopiado] = useState(false);

  // Misma regla que la función de la base: la selección manual gana sobre los
  // filtros. Así la vista previa no miente respecto de lo que va a salir.
  const incluidos = empSel.length
    ? empleados.filter((e) => empSel.includes(e.id))
    : empleados.filter(
        (e) =>
          (depSel.length === 0 || (e.departamentoId && depSel.includes(e.departamentoId))) &&
          (pueSel.length === 0 || (e.puestoId && pueSel.includes(e.puestoId))),
      );

  const alternar = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);

  return (
    <section className="rounded-tarjeta border border-borde-decorativo bg-superficie">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde-decorativo px-5 py-4">
        <div className="min-w-0">
          <p className="font-medium text-texto">
            {carrusel.nombre}
            {!carrusel.activo && (
              <span className="ml-2 rounded-full bg-borde-decorativo px-2 py-0.5 text-auxiliar font-normal text-secundario">
                Apagado
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate font-mono text-auxiliar text-secundario">{url}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
            className="boton boton-secundario"
          >
            {copiado ? "Copiado" : "Copiar enlace"}
          </button>
          <a
            href={`/tv/${carrusel.token}`}
            target="_blank"
            rel="noreferrer"
            className="boton boton-secundario"
          >
            Abrir
          </a>
          <button
            type="button"
            onClick={onAbrir}
            className="boton boton-secundario"
            aria-expanded={abierto}
          >
            {abierto ? "Cerrar" : "Configurar"}
          </button>
        </div>
      </header>

      {abierto && (
        <div className="px-5 py-5">
          <Form method="post" className="flex flex-col gap-6">
            <input type="hidden" name="intent" value="guardar" />
            <input type="hidden" name="id" value={carrusel.id} />

            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto]">
              <label className="block">
                <span className="text-menor font-medium">Nombre</span>
                <input
                  name="nombre"
                  defaultValue={carrusel.nombre}
                  className="campo mt-1"
                />
                {errores?.nombre && <p className="mt-1 text-auxiliar text-error">{errores.nombre[0]}</p>}
              </label>

              <label className="block">
                <span className="text-menor font-medium">Segundos por pantalla</span>
                <input
                  name="segundosPorSlide"
                  type="number"
                  min={5}
                  max={60}
                  value={segundos}
                  onChange={(e) => setSegundos(Number(e.target.value))}
                  className="campo mt-1"
                />
                {errores?.segundosPorSlide && (
                  <p className="mt-1 text-auxiliar text-error">{errores.segundosPorSlide[0]}</p>
                )}
              </label>

              <label className="flex items-end gap-2 pb-2">
                <input type="checkbox" name="activo" defaultChecked={carrusel.activo} className="h-4 w-4" />
                <span className="text-menor">Encendido</span>
              </label>
            </div>

            <Bloque titulo="Qué se muestra">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {CAMPOS_CARRUSEL.map((c) => (
                  <label key={c.clave} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      name="campos"
                      value={c.clave}
                      checked={campos[c.clave]}
                      onChange={() => setCampos({ ...campos, [c.clave]: !campos[c.clave] })}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="text-menor">
                      {c.etiqueta}
                      {c.detalle && (
                        <span className="block text-auxiliar text-secundario">{c.detalle}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {/* Se listan a propósito: que se vea que la decisión está tomada
                  y no que nos olvidamos de ponerlos. */}
              <p className="mt-4 border-t border-borde-decorativo pt-3 text-auxiliar text-secundario">
                <strong className="font-medium text-texto">
                  Nunca se muestran en la TV, y no se pueden habilitar:
                </strong>{" "}
                {CAMPOS_BLOQUEADOS.join(" · ")}. Una pantalla en el comedor la ve cualquiera, incluidas las
                visitas. Los certificados vencidos tampoco aparecen: eso se resuelve con la persona, no
                exponiéndola frente a sus compañeros.
              </p>
            </Bloque>

            <Bloque titulo="Quién aparece">
              <p className="text-auxiliar text-secundario">
                Sin nada tildado entran todos los empleados activos. Si elegís gente a mano, esa selección manda
                sobre los filtros.
              </p>

              <div className="mt-3 grid gap-5 md:grid-cols-3">
                <Lista titulo="Departamentos">
                  {departamentos.map((d) => (
                    <Casilla
                      key={d.id}
                      name="departamentos"
                      value={d.id}
                      checked={depSel.includes(d.id)}
                      onChange={() => alternar(depSel, setDepSel, d.id)}
                      etiqueta={d.nombre}
                      deshabilitado={empSel.length > 0}
                    />
                  ))}
                </Lista>

                <Lista titulo="Puestos">
                  {puestos.map((p) => (
                    <Casilla
                      key={p.id}
                      name="puestos"
                      value={p.id}
                      checked={pueSel.includes(p.id)}
                      onChange={() => alternar(pueSel, setPueSel, p.id)}
                      etiqueta={p.nombre}
                      deshabilitado={empSel.length > 0}
                    />
                  ))}
                </Lista>

                <Lista titulo={`Selección manual${empSel.length ? ` (${empSel.length})` : ""}`}>
                  {empleados.map((e) => (
                    <Casilla
                      key={e.id}
                      name="empleados"
                      value={e.id}
                      checked={empSel.includes(e.id)}
                      onChange={() => alternar(empSel, setEmpSel, e.id)}
                      etiqueta={`${e.apellido}, ${e.nombre}`}
                    />
                  ))}
                </Lista>
              </div>
            </Bloque>

            <Bloque titulo={`Vista previa · ${incluidos.length} ${incluidos.length === 1 ? "persona" : "personas"}`}>
              <VistaPrevia empleados={incluidos} campos={campos} />
            </Bloque>

            <div className="flex flex-wrap items-center gap-3 border-t border-borde-decorativo pt-4">
              <button
                type="submit"
                className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white"
              >
                Guardar cambios
              </button>
              <span className="text-auxiliar text-secundario">
                La TV toma los cambios sola en menos de un minuto, sin reiniciarla.
              </span>
            </div>
          </Form>

          <div className="mt-6 flex flex-wrap gap-3 border-t border-borde-decorativo pt-4">
            <BotonPeligroso
              intent="rotar"
              id={carrusel.id}
              etiqueta="Rotar enlace"
              confirmacion="Se genera un enlace nuevo y el actual deja de funcionar. Cualquier TV que lo tenga abierto se va a cortar en menos de un minuto. ¿Rotarlo?"
            />
            <BotonPeligroso
              intent="borrar"
              id={carrusel.id}
              etiqueta="Eliminar carrusel"
              confirmacion={`Se elimina "${carrusel.nombre}" y su enlace deja de funcionar. Esto no se puede deshacer. ¿Eliminarlo?`}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// Se muestra la primera pantalla del ciclo, a escala, con el mismo componente
// que usa la TV: lo que se ve acá es literalmente lo que se va a ver allá.
function VistaPrevia({
  empleados,
  campos,
}: {
  empleados: FilaEmpleado[];
  campos: Record<CampoCarrusel, boolean>;
}) {
  const [indice, setIndice] = useState(0);

  if (empleados.length === 0) {
    return (
      <p className="rounded-control border border-dashed border-borde-decorativo px-4 py-6 text-center text-menor text-secundario">
        Con estos filtros no queda nadie para mostrar. La TV mostraría un cartel avisándolo, no una pantalla en
        negro.
      </p>
    );
  }

  const actual = empleados[Math.min(indice, empleados.length - 1)];

  return (
    <div>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-control bg-tv-fondo text-white">
        <SlideCarrusel empleado={actual} campos={campos} escala={0.3} />
      </div>
      {empleados.length > 1 && (
        <div className="mt-2 flex items-center justify-between text-auxiliar text-secundario">
          <span>
            Pantalla {Math.min(indice, empleados.length - 1) + 1} de {empleados.length}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setIndice((i) => (i - 1 + empleados.length) % empleados.length)}
              className="boton boton-secundario"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setIndice((i) => (i + 1) % empleados.length)}
              className="boton boton-secundario"
            >
              Siguiente
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-menor font-semibold text-texto">{titulo}</h3>
      <div className="rounded-control border border-borde-decorativo p-4">{children}</div>
    </section>
  );
}

function Lista({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-auxiliar font-medium uppercase tracking-wide text-secundario">{titulo}</p>
      <div className="mt-2 max-h-48 overflow-y-auto pr-1">
        {children ?? null}
        {Array.isArray(children) && children.length === 0 && (
          <p className="text-auxiliar text-secundario">Nada cargado todavía.</p>
        )}
      </div>
    </div>
  );
}

function Casilla({
  name,
  value,
  checked,
  onChange,
  etiqueta,
  deshabilitado = false,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  etiqueta: string;
  deshabilitado?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 py-0.5 ${deshabilitado ? "opacity-40" : ""}`}>
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={deshabilitado}
        className="h-4 w-4"
      />
      <span className="truncate text-menor">{etiqueta}</span>
    </label>
  );
}

// Regla 2: lo que no se puede deshacer se confirma explicando la consecuencia,
// no con un "¿estás seguro?" genérico.
function BotonPeligroso({
  intent,
  id,
  etiqueta,
  confirmacion,
}: {
  intent: string;
  id: string;
  etiqueta: string;
  confirmacion: string;
}) {
  const navegacion = useNavigation();

  return (
    <Form method="post" onSubmit={(e) => !confirm(confirmacion) && e.preventDefault()}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={navegacion.state !== "idle"}
        className="rounded-control border border-error px-3 py-1.5 text-menor font-medium text-error disabled:opacity-50"
      >
        {etiqueta}
      </button>
    </Form>
  );
}
