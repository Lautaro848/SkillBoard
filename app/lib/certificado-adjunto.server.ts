import type { SupabaseClient } from "@supabase/supabase-js";
import { subirObjeto } from "~/lib/storage.server";
import {
  ADJUNTO_MAX_BYTES,
  detectarTipoAdjunto,
  MIME_POR_TIPO,
} from "~/lib/validation/certificados";

export interface ResultadoAdjunto {
  ok: boolean;
  error?: string;
  key?: string;
}

// Valida tamaño y contenido real del archivo (no la extensión) y lo sube al
// bucket bajo el prefijo de la empresa, que es lo que aísla los archivos
// entre empresas (migración 0007). Devuelve ok sin key si no se adjuntó
// nada: el archivo es opcional.
export async function procesarYSubirAdjunto(
  supabase: SupabaseClient,
  empresaId: string,
  empleadoId: string,
  archivo: File | null,
): Promise<ResultadoAdjunto> {
  if (!archivo || archivo.size === 0) return { ok: true };

  if (archivo.size > ADJUNTO_MAX_BYTES) {
    const mb = (archivo.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `El archivo pesa ${mb} MB y el máximo es 10 MB. Probá con una versión más liviana o comprimila antes de subirla.`,
    };
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = detectarTipoAdjunto(bytes);
  if (!tipo) {
    return {
      ok: false,
      error: "El archivo no es un PDF ni una imagen válida. Se aceptan PDF, JPG y PNG.",
    };
  }

  const key = `${empresaId}/empleados/${empleadoId}/certificados/${Date.now()}.${tipo === "jpeg" ? "jpg" : tipo}`;
  await subirObjeto(supabase, key, bytes, MIME_POR_TIPO[tipo]);
  return { ok: true, key };
}
