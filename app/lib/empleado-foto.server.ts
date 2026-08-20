import type { AppLoadContext } from "react-router";
import { subirObjeto } from "~/lib/storage.server";
import { esImagenValida, FOTO_MAX_BYTES } from "~/lib/validation/empleados";

export interface ResultadoFoto {
  ok: boolean;
  error?: string;
  key?: string;
}

// Valida tamaño y contenido real del archivo (no la extensión) y lo sube a
// R2 con una clave nueva por empresa/empleado. Devuelve error=null cuando no
// se adjuntó ninguna foto: es un campo opcional.
export async function procesarYSubirFoto(
  context: AppLoadContext,
  empresaId: string,
  empleadoId: string,
  foto: File | null,
): Promise<ResultadoFoto> {
  if (!foto || foto.size === 0) return { ok: true };

  if (foto.size > FOTO_MAX_BYTES) {
    const mb = (foto.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `La foto pesa ${mb} MB y el máximo es 5 MB. Probá con una imagen más liviana o reducila antes de subirla.`,
    };
  }

  const bytes = new Uint8Array(await foto.arrayBuffer());
  if (!esImagenValida(bytes)) {
    return { ok: false, error: "El archivo no es una imagen válida. Se aceptan JPG, PNG y WebP." };
  }

  const key = `${empresaId}/empleados/${empleadoId}/foto-${Date.now()}.webp`;
  await subirObjeto(context, key, bytes, foto.type || "image/webp");
  return { ok: true, key };
}
