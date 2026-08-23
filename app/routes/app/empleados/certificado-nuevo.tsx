import { useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { requireSesion } from "~/lib/sesion.server";
import { procesarYSubirAdjunto } from "~/lib/certificado-adjunto.server";
import { certificadoSchema } from "~/lib/validation/certificados";
import type { Route } from "./+types/certificado-nuevo";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);

  const [{ data: empleado }, { data: tipos }] = await Promise.all([
    supabase
      .from("empleados")
      .select("id, nombre, apellido")
      .eq("id", params.id)
      .eq("empresa_id", empresaId)
      .single(),
    supabase
      .from("tipos_certificado")
      .select("id, nombre, requiere_vencimiento, dias_alerta")
      .eq("empresa_id", empresaId)
      .order("nombre"),
  ]);

  if (!empleado) throw new Response("No encontrado", { status: 404 });
  return { empleado, tipos: tipos ?? [] };
}

interface Errores {
  _form?: string[];
  [campo: string]: string[] | undefined;
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, empresaId } = await requireSesion(request, context);
  const empleadoId = params.id;
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const valoresEnviados = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;

  const parsed = certificadoSchema.safeParse(raw);
  if (!parsed.success) {
    const errores: Errores = parsed.error.flatten().fieldErrors;
    return { errores, valoresEnviados };
  }

  // El archivo se sube ANTES de insertar la fila: si el adjunto es inválido,
  // no queda un certificado a medias sin su respaldo.
  const archivo = formData.get("archivo");
  let archivoKey: string | undefined;
  if (archivo instanceof File && archivo.size > 0) {
    const resultado = await procesarYSubirAdjunto(supabase, empresaId, empleadoId, archivo);
    if (!resultado.ok) {
      return { errores: { archivo: [resultado.error!] } as Errores, valoresEnviados };
    }
    archivoKey = resultado.key;
  }

  const { error } = await supabase.from("certificados").insert({
    empresa_id: empresaId,
    empleado_id: empleadoId,
    tipo_id: parsed.data.tipoId,
    numero: parsed.data.numero || null,
    entidad_emisora: parsed.data.entidadEmisora || null,
    fecha_emision: parsed.data.fechaEmision.toISOString().slice(0, 10),
    fecha_vencimiento:
      parsed.data.fechaVencimiento instanceof Date
        ? parsed.data.fechaVencimiento.toISOString().slice(0, 10)
        : null,
    archivo_url: archivoKey ?? null,
  });

  if (error) {
    return {
      errores: { _form: ["No pudimos guardar el certificado. Probá de nuevo en unos minutos."] } as Errores,
      valoresEnviados,
    };
  }

  throw redirect(`/empleados/${empleadoId}?tab=certificados`);
}

export default function CertificadoNuevo({ loaderData, actionData }: Route.ComponentProps) {
  const { empleado, tipos } = loaderData;
  const errores = actionData?.errores;
  const v = actionData?.valoresEnviados ?? {};
  const navigation = useNavigation();
  const enviando = navigation.state === "submitting";

  const [tipoId, setTipoId] = useState(v.tipoId ?? "");
  const tipoElegido = tipos.find((t: { id: string }) => t.id === tipoId);
  // Si el tipo no vence, se oculta el campo en vez de dejarlo pidiendo una
  // fecha que no corresponde cargar.
  const pideVencimiento = tipoElegido ? tipoElegido.requiere_vencimiento : true;

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-menor text-secundario">
        <Link to="/empleados" className="underline">
          Empleados
        </Link>{" "}
        ›{" "}
        <Link to={`/empleados/${empleado.id}`} className="underline">
          {empleado.nombre} {empleado.apellido}
        </Link>{" "}
        › Nuevo certificado
      </nav>

      <h1 className="text-seccion font-semibold text-texto">
        Cargar certificado de {empleado.nombre} {empleado.apellido}
      </h1>

      {tipos.length === 0 ? (
        <div className="rounded-tarjeta border border-dashed border-borde-decorativo p-6 text-center text-menor text-secundario">
          <p>Todavía no hay tipos de certificado cargados.</p>
          <Link
            to="/configuracion/catalogos?tipo=tipos_certificado"
            className="mt-3 inline-block rounded-control bg-primario px-4 py-2 font-medium text-white"
          >
            Crear el primero
          </Link>
        </div>
      ) : (
        <Form method="post" encType="multipart/form-data" className="flex max-w-lg flex-col gap-4" noValidate>
          <p className="text-auxiliar text-secundario">
            Los campos marcados con <span aria-hidden>*</span> son obligatorios.
          </p>

          {errores?._form && (
            <p className="rounded-control border border-error/30 bg-error/5 p-3 text-menor text-error">
              {errores._form[0]}
            </p>
          )}

          <div>
            <label className="text-menor font-medium" htmlFor="tipoId">
              Tipo de certificado *
            </label>
            <select
              id="tipoId"
              name="tipoId"
              required
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
              className="campo mt-1"
            >
              <option value="">Elegir...</option>
              {tipos.map((t: { id: string; nombre: string }) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
            {errores?.tipoId && <p className="mt-1 text-auxiliar text-error">{errores.tipoId[0]}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Número" name="numero" defaultValue={v.numero} errores={errores?.numero} />
            <Campo
              label="Entidad emisora"
              name="entidadEmisora"
              defaultValue={v.entidadEmisora}
              errores={errores?.entidadEmisora}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo
              label="Fecha de emisión"
              name="fechaEmision"
              type="date"
              required
              defaultValue={v.fechaEmision}
              errores={errores?.fechaEmision}
            />
            {pideVencimiento && (
              <Campo
                label="Fecha de vencimiento"
                name="fechaVencimiento"
                type="date"
                defaultValue={v.fechaVencimiento}
                errores={errores?.fechaVencimiento}
              />
            )}
          </div>

          {tipoElegido && pideVencimiento && (
            <p className="-mt-2 text-auxiliar text-secundario">
              Se va a avisar {tipoElegido.dias_alerta} días antes del vencimiento.
            </p>
          )}

          <div>
            <label className="text-menor font-medium" htmlFor="archivo">
              Archivo adjunto
            </label>
            <input
              id="archivo"
              name="archivo"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="mt-1 block w-full text-menor"
            />
            <p className="mt-1 text-auxiliar text-secundario">PDF, JPG o PNG. Máximo 10 MB.</p>
            {errores?.archivo && <p className="mt-1 text-auxiliar text-error">{errores.archivo[0]}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-control bg-primario px-4 py-2 text-menor font-medium text-white disabled:opacity-60"
            >
              {enviando ? "Guardando..." : "Guardar certificado"}
            </button>
            <Link
              to={`/empleados/${empleado.id}?tab=certificados`}
              className="rounded-control border border-borde-decorativo px-4 py-2 text-menor font-medium"
            >
              Cancelar
            </Link>
          </div>
        </Form>
      )}
    </div>
  );
}

function Campo({
  label,
  name,
  type = "text",
  defaultValue,
  errores,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  errores?: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-menor font-medium" htmlFor={name}>
        {label} {required && "*"}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="campo mt-1"
      />
      {errores?.[0] && <p className="mt-1 text-auxiliar text-error">{errores[0]}</p>}
    </div>
  );
}
