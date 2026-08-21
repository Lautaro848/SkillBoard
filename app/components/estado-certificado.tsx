import {
  ESTADO_CERTIFICADO,
  textoVencimiento,
  type EstadoCertificado,
} from "~/lib/validation/certificados";

// El estado se distingue por ícono Y texto, no solo por color: es un criterio
// de aceptación del módulo 4 (accesibilidad para daltonismo).
export function EstadoCert({
  estado,
  diasRestantes,
  conDetalle = true,
}: {
  estado: EstadoCertificado;
  diasRestantes: number | null;
  conDetalle?: boolean;
}) {
  const info = ESTADO_CERTIFICADO[estado] ?? ESTADO_CERTIFICADO.vigente;

  return (
    <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: info.color }}>
      <span
        aria-hidden
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ backgroundColor: `color-mix(in srgb, ${info.color} 15%, transparent)` }}
      >
        {info.icono}
      </span>
      <span className="font-medium">{info.etiqueta}</span>
      {conDetalle && (
        <span className="font-normal text-[var(--color-text-muted)]">
          · {textoVencimiento(estado, diasRestantes)}
        </span>
      )}
    </span>
  );
}
