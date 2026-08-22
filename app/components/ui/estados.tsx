import { IconoAlerta, IconoError, IconoInfo, IconoTilde } from "~/components/ui/iconos";

export type Tono = "exito" | "advertencia" | "error" | "info";

// El color nunca es el único portador de información: cada tono lleva su
// ícono, y el texto dice qué pasó (05-sistema-de-diseno.md §1).
const TONOS: Record<Tono, { fondo: string; texto: string; borde: string; Icono: () => React.ReactElement }> = {
  exito: { fondo: "bg-exito-fondo", texto: "text-exito", borde: "border-exito", Icono: IconoTilde },
  advertencia: {
    fondo: "bg-advertencia-fondo",
    texto: "text-advertencia",
    borde: "border-advertencia",
    Icono: IconoAlerta,
  },
  error: { fondo: "bg-error-fondo", texto: "text-error", borde: "border-error", Icono: IconoError },
  info: { fondo: "bg-info-fondo", texto: "text-info", borde: "border-info", Icono: IconoInfo },
};

// Franja de estado. Los cambios se anuncian a los lectores de pantalla: sin
// aria-live, quien no ve la pantalla no se entera de que algo pasó.
export function Aviso({
  tono,
  titulo,
  children,
  className = "",
}: {
  tono: Tono;
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { fondo, texto, borde, Icono } = TONOS[tono];

  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      aria-live={tono === "error" ? "assertive" : "polite"}
      className={`flex gap-3 rounded-control border ${borde} ${fondo} p-4 ${className}`}
    >
      <span className={`mt-0.5 shrink-0 ${texto}`}>
        <Icono />
      </span>
      <div className="min-w-0">
        {titulo && <p className={`text-menor font-semibold ${texto}`}>{titulo}</p>}
        <div className="text-menor text-texto">{children}</div>
      </div>
    </div>
  );
}

// Estado vacío: qué falta, por qué importa y qué hacer al respecto. Nunca una
// pantalla en blanco ni un "no hay datos" a secas.
export function EstadoVacio({
  titulo,
  explicacion,
  children,
}: {
  titulo: string;
  explicacion: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-tarjeta border border-dashed border-borde p-12 text-center">
      <h2 className="text-tarjeta font-semibold text-texto">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-prose text-menor text-secundario">{explicacion}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

// Esqueleto con la forma del contenido que va a aparecer, no una rueda
// centrada que no dice nada de lo que se está cargando.
export function Esqueleto({ filas = 3 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-control bg-deshabilitado" />
      ))}
    </div>
  );
}
