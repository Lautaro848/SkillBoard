import { useRef, useState } from "react";
import { useNavigation, useSubmit } from "react-router";
import { procesarFoto } from "~/lib/foto.client";
import { NIVEL_ETIQUETAS } from "~/lib/validation/empleados";

interface Opcion {
  id: string;
  nombre: string;
}

interface AptitudFila {
  aptitudId: string;
  nivel: number;
}

interface Props {
  puestos: Opcion[];
  departamentos: Opcion[];
  aptitudesCatalogo: Opcion[];
  valoresIniciales?: Record<string, string>;
  aptitudesIniciales?: AptitudFila[];
  fotoUrlActual?: string | null;
  errores?: Record<string, string[] | undefined>;
  valoresEnviados?: Record<string, string>;
}

const PESTANIAS = ["personales", "puesto", "aptitudes"] as const;
type Pestania = (typeof PESTANIAS)[number];
const ETIQUETAS: Record<Pestania, string> = {
  personales: "Datos personales",
  puesto: "Puesto y organización",
  aptitudes: "Aptitudes",
};

export function EmpleadoForm({
  puestos,
  departamentos,
  aptitudesCatalogo,
  valoresIniciales = {},
  aptitudesIniciales = [],
  fotoUrlActual,
  errores = {},
  valoresEnviados,
}: Props) {
  const v = valoresEnviados ?? valoresIniciales;
  const formRef = useRef<HTMLFormElement>(null);
  const submit = useSubmit();
  const navigation = useNavigation();
  const enviando = navigation.state === "submitting";

  const [pestania, setPestania] = useState<Pestania>("personales");
  const [preview, setPreview] = useState<string | null>(fotoUrlActual ?? null);
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [aptitudes, setAptitudes] = useState<AptitudFila[]>(aptitudesIniciales);
  const [nuevaAptitud, setNuevaAptitud] = useState("");
  const [nuevoNivel, setNuevoNivel] = useState(3);

  async function onFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFotoError(
        `La foto pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB y el máximo es 5 MB. Probá con una imagen más liviana o reducila antes de subirla.`,
      );
      return;
    }
    try {
      const { blob, previewUrl } = await procesarFoto(file);
      setFotoBlob(blob);
      setPreview(previewUrl);
      setFotoError(null);
    } catch {
      setFotoError("El archivo no es una imagen válida. Se aceptan JPG, PNG y WebP.");
    }
  }

  function agregarAptitud() {
    if (!nuevaAptitud) return;
    setAptitudes((actual) => [
      ...actual.filter((a) => a.aptitudId !== nuevaAptitud),
      { aptitudId: nuevaAptitud, nivel: nuevoNivel },
    ]);
    setNuevaAptitud("");
    setNuevoNivel(3);
  }

  function quitarAptitud(aptitudId: string) {
    setAptitudes((actual) => actual.filter((a) => a.aptitudId !== aptitudId));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    if (fotoBlob) formData.set("foto", fotoBlob, "foto.webp");
    formData.set("aptitudes", JSON.stringify(aptitudes));
    submit(formData, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <p className="text-auxiliar text-secundario">
        Los campos marcados con <span aria-hidden>*</span> son obligatorios.
      </p>

      {errores._form && (
        <p className="rounded-control border border-error/30 bg-error/5 p-3 text-menor text-error">
          {errores._form[0]}
        </p>
      )}

      <nav className="flex gap-1 border-b border-borde-decorativo">
        {PESTANIAS.map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => setPestania(p)}
            className={`px-3 py-2 text-menor ${
              p === pestania
                ? "border-b-2 border-primario font-medium text-primario"
                : "text-secundario"
            }`}
          >
            {ETIQUETAS[p]}
          </button>
        ))}
      </nav>

      <section className={pestania === "personales" ? "flex flex-col gap-4" : "hidden"}>
        <div className="flex items-center gap-4">
          {preview ? (
            <img src={preview} alt="Vista previa" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-borde-decorativo text-menor text-secundario">
              Sin foto
            </div>
          )}
          <div>
            <label className="block text-menor font-medium" htmlFor="fotoInput">
              Foto
            </label>
            <input id="fotoInput" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFotoChange} className="mt-1 text-menor" />
            {fotoError && <p className="mt-1 text-auxiliar text-error">{fotoError}</p>}
          </div>
        </div>

        <Campo label="ID interno" name="idInterno" defaultValue={v.idInterno} errores={errores.idInterno} required />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nombre" name="nombre" defaultValue={v.nombre} errores={errores.nombre} required />
          <Campo label="Apellido" name="apellido" defaultValue={v.apellido} errores={errores.apellido} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha de nacimiento" name="fechaNacimiento" type="date" defaultValue={v.fechaNacimiento} errores={errores.fechaNacimiento} required />
          <Campo label="Teléfono" name="telefono" defaultValue={v.telefono} errores={errores.telefono} />
        </div>
        <Campo label="Email" name="email" type="email" defaultValue={v.email} errores={errores.email} />
      </section>

      <section className={pestania === "puesto" ? "flex flex-col gap-4" : "hidden"}>
        <div className="grid grid-cols-2 gap-3">
          <Selector label="Departamento" name="departamentoId" opciones={departamentos} defaultValue={v.departamentoId} errores={errores.departamentoId} required />
          <Selector label="Puesto" name="puestoId" opciones={puestos} defaultValue={v.puestoId} errores={errores.puestoId} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha de ingreso" name="fechaIngreso" type="date" defaultValue={v.fechaIngreso} errores={errores.fechaIngreso} required />
          <div>
            <label className="text-menor font-medium" htmlFor="estado">
              Estado
            </label>
            <select id="estado" name="estado" defaultValue={v.estado ?? "activo"} className="campo mt-1">
              <option value="activo">Activo</option>
              <option value="licencia">Licencia</option>
              <option value="baja">Baja</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-menor font-medium" htmlFor="observaciones">
            Observaciones
          </label>
          <textarea id="observaciones" name="observaciones" defaultValue={v.observaciones} maxLength={2000} rows={3} className="campo mt-1" />
          {errores.observaciones && <p className="mt-1 text-auxiliar text-error">{errores.observaciones[0]}</p>}
        </div>
      </section>

      <section className={pestania === "aptitudes" ? "flex flex-col gap-4" : "hidden"}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-menor font-medium" htmlFor="nuevaAptitud">
              Aptitud
            </label>
            <select id="nuevaAptitud" value={nuevaAptitud} onChange={(e) => setNuevaAptitud(e.target.value)} className="campo mt-1">
              <option value="">Elegir...</option>
              {aptitudesCatalogo
                .filter((a) => !aptitudes.some((x) => x.aptitudId === a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-menor font-medium" htmlFor="nuevoNivel">
              Nivel
            </label>
            <select id="nuevoNivel" value={nuevoNivel} onChange={(e) => setNuevoNivel(Number(e.target.value))} className="campo mt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} · {NIVEL_ETIQUETAS[n]}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={agregarAptitud} className="rounded-control border border-borde-decorativo px-3 py-1.5 text-menor font-medium">
            Agregar
          </button>
        </div>

        {aptitudes.length === 0 ? (
          <p className="text-menor text-secundario">
            Todavía no se cargaron aptitudes. Las aptitudes permiten que Tukson asigne tareas con criterio.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {aptitudes.map((a) => {
              const nombre = aptitudesCatalogo.find((x) => x.id === a.aptitudId)?.nombre ?? a.aptitudId;
              return (
                <li key={a.aptitudId} className="flex items-center justify-between rounded-control border border-borde-decorativo px-3 py-2 text-menor">
                  <span>
                    {nombre} — {NIVEL_ETIQUETAS[a.nivel]}
                  </span>
                  <button type="button" onClick={() => quitarAptitud(a.aptitudId)} className="text-secundario underline">
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button type="submit" disabled={enviando} className="w-fit rounded-control bg-primario px-4 py-2 text-menor font-medium text-white disabled:opacity-60">
        {enviando ? "Guardando..." : "Guardar"}
      </button>
    </form>
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
        className="mt-1 block w-full rounded-control border border-borde-decorativo px-3 py-2 text-menor"
      />
      {errores?.[0] && <p className="mt-1 text-auxiliar text-error">{errores[0]}</p>}
    </div>
  );
}

function Selector({
  label,
  name,
  opciones,
  defaultValue,
  errores,
  required,
}: {
  label: string;
  name: string;
  opciones: Opcion[];
  defaultValue?: string;
  errores?: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-menor font-medium" htmlFor={name}>
        {label} {required && "*"}
      </label>
      <select id={name} name={name} required={required} defaultValue={defaultValue} className="campo mt-1">
        <option value="">Elegir...</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
      {errores?.[0] && <p className="mt-1 text-auxiliar text-error">{errores[0]}</p>}
    </div>
  );
}
