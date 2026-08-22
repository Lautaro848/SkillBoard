import {
  ESTADO_CERTIFICADO,
  textoVencimiento,
  type EstadoCertificado,
  type TonoEstado,
} from "~/lib/validation/certificados";
import { IconoAlerta, IconoError, IconoReloj, IconoTilde } from "~/components/ui/iconos";

// El estado se distingue por ícono Y texto, no solo por color: es un criterio
// de aceptación del módulo 4 y la regla de oro del color del sistema de
// diseño. Cerca del 8 % de los varones tiene alguna forma de daltonismo, y en
// el rubro industrial esa proporción está sentada frente a la pantalla.
const TONOS: Record<TonoEstado, { clase: string; Icono: () => React.ReactElement }> = {
  error: { clase: "text-error", Icono: IconoError },
  advertencia: { clase: "text-advertencia", Icono: IconoAlerta },
  exito: { clase: "text-exito", Icono: IconoTilde },
  neutro: { clase: "text-secundario", Icono: IconoReloj },
};

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
  const { clase, Icono } = TONOS[info.tono];

  return (
    <span className={`inline-flex items-center gap-1.5 text-menor ${clase}`}>
      <span className="shrink-0">
        <Icono />
      </span>
      <span className="font-medium">{info.etiqueta}</span>
      {conDetalle && (
        <span className="font-normal text-secundario">· {textoVencimiento(estado, diasRestantes)}</span>
      )}
    </span>
  );
}
