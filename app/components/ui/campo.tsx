import { useId } from "react";
import { IconoError } from "~/components/ui/iconos";

// Estructura fija, siempre en este orden: etiqueta arriba (nunca dentro del
// campo), campo, ayuda o error debajo. La zona de ayuda ocupa su espacio
// desde el principio, así el formulario no salta cuando aparece un error
// (05-sistema-de-diseno.md §4).

interface Envoltorio {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  obligatorio?: boolean;
  className?: string;
}

function Etiqueta({
  id,
  etiqueta,
  obligatorio,
}: {
  id: string;
  etiqueta: string;
  obligatorio?: boolean;
}) {
  return (
    <label htmlFor={id} className="block text-menor font-medium text-texto">
      {etiqueta}
      {obligatorio && (
        <>
          {" "}
          <span className="text-error" aria-hidden>
            *
          </span>
        </>
      )}
    </label>
  );
}

function Pie({ id, ayuda, error }: { id: string; ayuda?: string; error?: string }) {
  // Altura reservada aunque no haya nada que decir: sin esto el formulario
  // se mueve solo al validar y la persona pierde el lugar donde estaba.
  if (!ayuda && !error) return <div className="pie-campo" aria-hidden />;

  if (error) {
    return (
      <p id={`${id}-error`} className="pie-campo flex items-center gap-1 text-auxiliar text-error">
        <IconoError />
        {error}
      </p>
    );
  }
  return (
    <p id={`${id}-ayuda`} className="pie-campo text-auxiliar text-secundario">
      {ayuda}
    </p>
  );
}

function descriptores(id: string, ayuda?: string, error?: string) {
  if (error) return `${id}-error`;
  if (ayuda) return `${id}-ayuda`;
  return undefined;
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  obligatorio,
  className = "",
  ...resto
}: Envoltorio & React.InputHTMLAttributes<HTMLInputElement>) {
  const generado = useId();
  const id = resto.id ?? generado;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Etiqueta id={id} etiqueta={etiqueta} obligatorio={obligatorio} />
      <input
        {...resto}
        id={id}
        className="campo"
        aria-required={obligatorio || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptores(id, ayuda, error)}
      />
      <Pie id={id} ayuda={ayuda} error={error} />
    </div>
  );
}

// Los campos de fecha son siempre un selector de calendario, con la opción de
// escribir. `type="date"` da las dos cosas de forma nativa y evita la mitad
// de los errores de carga.
export function CampoFecha(props: Envoltorio & React.InputHTMLAttributes<HTMLInputElement>) {
  return <Campo {...props} type="date" />;
}

export function Selector({
  etiqueta,
  ayuda,
  error,
  obligatorio,
  className = "",
  children,
  ...resto
}: Envoltorio & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const generado = useId();
  const id = resto.id ?? generado;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Etiqueta id={id} etiqueta={etiqueta} obligatorio={obligatorio} />
      <select
        {...resto}
        id={id}
        className="campo"
        aria-required={obligatorio || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptores(id, ayuda, error)}
      >
        {children}
      </select>
      <Pie id={id} ayuda={ayuda} error={error} />
    </div>
  );
}

export function AreaTexto({
  etiqueta,
  ayuda,
  error,
  obligatorio,
  className = "",
  ...resto
}: Envoltorio & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generado = useId();
  const id = resto.id ?? generado;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Etiqueta id={id} etiqueta={etiqueta} obligatorio={obligatorio} />
      <textarea
        {...resto}
        id={id}
        className="campo"
        aria-required={obligatorio || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptores(id, ayuda, error)}
      />
      <Pie id={id} ayuda={ayuda} error={error} />
    </div>
  );
}

// Va arriba de todo formulario que tenga campos obligatorios.
export function LeyendaObligatorios() {
  return (
    <p className="text-auxiliar text-secundario">
      Los campos marcados con <span className="text-error">*</span> son obligatorios.
    </p>
  );
}
