import { useEffect, useRef } from "react";
import { Form } from "react-router";
import { Boton } from "~/components/ui/boton";

// Diálogo de confirmación, solo para lo destructivo o masivo.
//
// Guardar un cambio menor NO pide confirmación: un producto que pregunta
// "¿estás seguro?" a cada paso enseña a hacer clic sin leer, y entonces la
// confirmación que sí importaba tampoco se lee (05-sistema-de-diseno.md §4).
//
// El nombre completo va en el título, el botón dice la acción —nunca
// "Aceptar"— y el botón destructivo va a la derecha y no recibe el foco.
export function DialogoConfirmacion({
  abierto,
  titulo,
  consecuencia,
  etiquetaConfirmar,
  onCancelar,
  campos,
  action,
}: {
  abierto: boolean;
  titulo: string;
  // Qué va a pasar exactamente, en concreto. No "esta acción es irreversible".
  consecuencia: string;
  etiquetaConfirmar: string;
  onCancelar: () => void;
  // Los campos ocultos que identifican qué se está confirmando.
  campos: Record<string, string>;
  action?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;

    if (abierto && !el.open) {
      // showModal atrapa el foco dentro del diálogo y habilita Escape, las
      // dos cosas que el documento exige, sin escribirlas a mano.
      el.showModal();
      cancelar.current?.focus();
    } else if (!abierto && el.open) {
      el.close();
    }
  }, [abierto]);

  return (
    <dialog
      ref={dialogo}
      onCancel={(e) => {
        e.preventDefault();
        onCancelar();
      }}
      onClose={onCancelar}
      className="tarjeta m-auto max-w-md p-6 backdrop:bg-texto/50"
      aria-labelledby="dialogo-titulo"
    >
      <h2 id="dialogo-titulo" className="text-tarjeta font-semibold text-texto">
        {titulo}
      </h2>
      <p className="mt-2 text-menor text-secundario">{consecuencia}</p>

      <div className="mt-6 flex justify-end gap-3">
        <Boton ref={cancelar} type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Form method="post" action={action}>
          {Object.entries(campos).map(([nombre, valor]) => (
            <input key={nombre} type="hidden" name={nombre} value={valor} />
          ))}
          <Boton type="submit" variante="destructivo">
            {etiquetaConfirmar}
          </Boton>
        </Form>
      </div>
    </dialog>
  );
}
