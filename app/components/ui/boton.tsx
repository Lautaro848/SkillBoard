import { Link } from "react-router";
import { useNavigation } from "react-router";

export type VarianteBoton = "principal" | "secundario" | "terciario" | "destructivo";

const CLASES: Record<VarianteBoton, string> = {
  principal: "boton boton-principal",
  secundario: "boton boton-secundario",
  terciario: "boton boton-terciario",
  destructivo: "boton boton-destructivo",
};

interface Comunes {
  variante?: VarianteBoton;
  children: React.ReactNode;
  className?: string;
}

export function Boton({
  variante = "secundario",
  cargando = false,
  etiquetaCargando,
  children,
  className = "",
  ...resto
}: Comunes &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    // React 19 pasa `ref` como una prop más, sin forwardRef.
    ref?: React.Ref<HTMLButtonElement>;
    cargando?: boolean;
    // En gerundio: "Guardando…". El documento pide cambiar la etiqueta y
    // deshabilitar, no reemplazar el texto por una rueda que no dice nada.
    etiquetaCargando?: string;
  }) {
  return (
    <button
      {...resto}
      disabled={resto.disabled || cargando}
      className={`${CLASES[variante]} ${className}`}
    >
      {cargando && etiquetaCargando ? etiquetaCargando : children}
    </button>
  );
}

// Un enlace que se ve como botón. Sigue siendo un enlace: se puede abrir en
// otra pestaña y el lector de pantalla lo anuncia como lo que es.
export function BotonEnlace({
  variante = "secundario",
  to,
  children,
  className = "",
  ...resto
}: Comunes & { to: string } & Omit<React.ComponentProps<typeof Link>, "to" | "className">) {
  return (
    <Link {...resto} to={to} className={`${CLASES[variante]} ${className}`}>
      {children}
    </Link>
  );
}

// Botón de envío que toma su estado de carga de React Router en vez de una
// bandera a mano, que es donde se olvidan casos (§4, estados).
export function BotonEnviar({
  variante = "principal",
  etiquetaCargando,
  children,
  className = "",
  ...resto
}: Comunes &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { etiquetaCargando?: string }) {
  const navegacion = useNavigation();
  const enviando = navegacion.state === "submitting";

  return (
    <Boton
      {...resto}
      type="submit"
      variante={variante}
      cargando={enviando}
      etiquetaCargando={etiquetaCargando}
      className={className}
    >
      {children}
    </Boton>
  );
}
