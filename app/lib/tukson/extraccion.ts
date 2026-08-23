// Paso 1 — Extracción de texto (04-tukson.md §2).
//
// Nada de OCR en esta versión: agrega dependencias pesadas y, sobre todo, una
// fuente de error silencioso. Un OCR que lee mal un número de sector produce
// una tarea plausible y equivocada, que es peor que no tener la función.

export const TAMANIO_MAXIMO_BYTES = 10 * 1024 * 1024;

export type TipoDocumento = "pdf" | "docx" | "desconocido";

// El tipo se verifica por CONTENIDO, no por extensión: renombrar un .exe a
// .pdf no puede alcanzar para que lo procesemos.
export function detectarTipo(bytes: Uint8Array): TipoDocumento {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf"; // %PDF
  }
  // Un .docx es un ZIP: PK\x03\x04. No alcanza para distinguirlo de otros
  // ZIP, pero sí para descartar lo que directamente no lo es.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "docx";
  }
  return "desconocido";
}

export type ResultadoExtraccion =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

export function validarArchivo(bytes: Uint8Array, nombre: string): ResultadoExtraccion | null {
  if (bytes.length === 0) {
    return { ok: false, motivo: `El archivo "${nombre}" está vacío.` };
  }
  if (bytes.length > TAMANIO_MAXIMO_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1).replace(".", ",");
    return {
      ok: false,
      motivo: `El archivo pesa ${mb} MB y el máximo son 10 MB. Probá subir solo la parte con las tareas.`,
    };
  }

  const tipo = detectarTipo(bytes);
  if (tipo === "desconocido") {
    return {
      ok: false,
      motivo: `No pudimos leer "${nombre}". Aceptamos PDF y Word (.docx). También podés pegar las tareas como texto.`,
    };
  }
  return null;
}

// Un PDF sin capa de texto es un escaneo. Se avisa en lugar de devolver
// basura: el mensaje exacto del documento, porque explica qué hacer.
export const AVISO_ESCANEO =
  "El archivo parece ser un escaneo sin texto seleccionable. " +
  "Podés escribir las tareas directamente o subir un archivo con texto.";

// Cuánto texto legible tiene que aparecer para considerar que el PDF no es un
// escaneo. Un PDF de imágenes igual trae algo de texto en los metadatos.
const MINIMO_CARACTERES_UTILES = 40;

export function pareceEscaneo(texto: string): boolean {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length < MINIMO_CARACTERES_UTILES;
}

// Divide el texto libre en líneas candidatas a tarea. Es lo que permite que
// pegar una lista funcione sin ningún modelo de por medio: la mayoría de la
// gente pega exactamente una tarea por línea, con o sin viñeta.
export function lineasDeTareas(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·–—]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length >= 3);
}
