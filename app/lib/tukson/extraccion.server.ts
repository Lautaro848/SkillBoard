import {
  AVISO_ESCANEO,
  detectarTipo,
  pareceEscaneo,
  validarArchivo,
  type ResultadoExtraccion,
} from "~/lib/tukson/extraccion";

// Extracción real de texto. Va aparte del módulo puro para que la validación
// (magic numbers, tamaño, escaneos) se pueda probar sin cargar los lectores,
// que son pesados y se importan solo cuando hacen falta.

export async function extraerTexto(bytes: Uint8Array, nombre: string): Promise<ResultadoExtraccion> {
  const problema = validarArchivo(bytes, nombre);
  if (problema) return problema;

  const tipo = detectarTipo(bytes);

  try {
    if (tipo === "pdf") {
      // unpdf está pensado para entornos sin Node completo, que es lo que hay
      // en Workers. Se importa acá adentro para no cargarlo en cada request.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const documento = await getDocumentProxy(bytes);
      const { text } = await extractText(documento, { mergePages: true });

      // Un PDF sin capa de texto es un escaneo. Se avisa en vez de devolver
      // basura: una tarea mal interpretada es peor que ninguna tarea.
      if (pareceEscaneo(text)) return { ok: false, motivo: AVISO_ESCANEO };
      return { ok: true, texto: text };
    }

    const mammoth = await import("mammoth");
    // Se conserva la estructura de listas y tablas: en un parte de trabajo,
    // cada viñeta suele ser una tarea.
    const { value } = await mammoth.extractRawText({
      arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });

    if (pareceEscaneo(value)) {
      return {
        ok: false,
        motivo: `El documento "${nombre}" no tiene texto que podamos leer. Probá pegando las tareas directamente.`,
      };
    }
    return { ok: true, texto: value };
  } catch {
    return {
      ok: false,
      motivo: `No pudimos leer "${nombre}". Puede estar dañado o protegido con contraseña. Probá pegando las tareas como texto.`,
    };
  }
}
