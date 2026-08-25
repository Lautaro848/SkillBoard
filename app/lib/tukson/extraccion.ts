// Paso 1 — Extracción de texto (04-tukson.md §2).
//
// Nada de OCR en esta versión: agrega dependencias pesadas y, sobre todo, una
// fuente de error silencioso. Un OCR que lee mal un número de sector produce
// una tarea plausible y equivocada, que es peor que no tener la función.

export const TAMANIO_MAXIMO_BYTES = 10 * 1024 * 1024;

// Las tareas del día llegan en lo que cada empresa usa: un parte en PDF, una
// planilla de Excel, un mail pegado en el Bloc de notas, un documento de
// LibreOffice. Se lee todo lo que tenga texto adentro.
//
// Los tres últimos NO se pueden leer, pero se reconocen igual: decirle a
// alguien "esto es un .doc de Word 97, guardalo como .docx" es útil;
// "no pudimos leer el archivo" no lo es.
export type TipoDocumento =
  | "pdf"
  | "docx"
  | "xlsx"
  | "odt"
  | "ods"
  | "rtf"
  | "texto"
  | "doc-viejo"
  | "pptx"
  | "desconocido";

const empiezaCon = (bytes: Uint8Array, firma: number[]) =>
  bytes.length >= firma.length && firma.every((b, i) => bytes[i] === b);

// Busca una cadena ASCII dentro de un tramo de bytes. Se usa para mirar los
// nombres de las entradas de un ZIP, que van sin comprimir.
function contiene(bytes: Uint8Array, texto: string, desde: number, hasta: number): boolean {
  const aguja = [...texto].map((c) => c.charCodeAt(0));
  const fin = Math.min(hasta, bytes.length) - aguja.length;

  for (let i = Math.max(0, desde); i <= fin; i++) {
    let coincide = true;
    for (let j = 0; j < aguja.length; j++) {
      if (bytes[i + j] !== aguja[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) return true;
  }
  return false;
}

const VENTANA = 64 * 1024;

// Un .docx, .xlsx, .odt y .ods son todos ZIP: por fuera son idénticos. Lo que
// los distingue es qué hay adentro, y los nombres de las entradas aparecen en
// claro. Se miran los primeros 64 KB (las cabeceras locales) y los últimos
// 64 KB (el índice central), que es donde caen esos nombres.
function tipoDeZip(bytes: Uint8Array): TipoDocumento {
  const enAlgunLado = (texto: string) =>
    contiene(bytes, texto, 0, VENTANA) ||
    contiene(bytes, texto, Math.max(0, bytes.length - VENTANA), bytes.length);

  // El `mimetype` de OpenDocument va primero y sin comprimir, así que se
  // reconoce antes que nada.
  if (enAlgunLado("application/vnd.oasis.opendocument.text")) return "odt";
  if (enAlgunLado("application/vnd.oasis.opendocument.spreadsheet")) return "ods";

  if (enAlgunLado("word/document.xml")) return "docx";
  if (enAlgunLado("xl/workbook.xml")) return "xlsx";
  if (enAlgunLado("ppt/presentation.xml")) return "pptx";

  return "desconocido";
}

// El tipo se verifica por CONTENIDO, no por extensión: renombrar un .exe a
// .pdf no puede alcanzar para que lo procesemos.
export function detectarTipo(bytes: Uint8Array): TipoDocumento {
  if (empiezaCon(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (empiezaCon(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return "rtf"; // {\rtf

  // Formato OLE: el .doc y el .xls viejos de Office 97-2003 comparten firma.
  if (empiezaCon(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc-viejo";

  if (empiezaCon(bytes, [0x50, 0x4b, 0x03, 0x04])) return tipoDeZip(bytes); // PK\x03\x04

  // Sin firma que lo identifique: puede ser texto. Un .txt, un .csv o algo
  // pegado desde el Bloc de notas no tienen ningún encabezado.
  return decodificarTexto(bytes) === null ? "desconocido" : "texto";
}

// --- Texto plano ---------------------------------------------------------
//
// Se decodifica a mano en vez de con TextDecoder porque en Cloudflare Workers
// solo se puede contar con UTF-8, y el Bloc de notas de Windows guarda
// además en UTF-16 y en Windows-1252.

// Windows-1252 coincide con Latin-1 salvo en 0x80–0x9F, que es justo donde
// están las comillas tipográficas y los guiones largos que mete Word.
const WINDOWS_1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "'",
  0x92: "'", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

function decodificarWindows1252(bytes: Uint8Array): string {
  let salida = "";
  for (const b of bytes) salida += WINDOWS_1252[b] ?? String.fromCharCode(b);
  return salida;
}

function decodificarUtf16(bytes: Uint8Array, little: boolean): string {
  let salida = "";
  for (let i = 2; i + 1 < bytes.length; i += 2) {
    salida += String.fromCharCode(little ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
  }
  return salida;
}

// Cuántos caracteres de control tolera antes de decidir que es binario. Un
// texto de verdad no tiene ninguno más allá del tabulador y los saltos.
const MAXIMO_CONTROL = 0.01;

function pareceTexto(texto: string): boolean {
  if (texto.length === 0) return false;
  let control = 0;
  for (const c of texto) {
    const codigo = c.codePointAt(0)!;
    if (codigo === 9 || codigo === 10 || codigo === 13) continue;
    if (codigo < 32 || codigo === 0xfffd) control++;
  }
  return control / texto.length <= MAXIMO_CONTROL;
}

// Devuelve el texto, o null si esto no es un archivo de texto.
export function decodificarTexto(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null;

  if (empiezaCon(bytes, [0xff, 0xfe])) return decodificarUtf16(bytes, true);
  if (empiezaCon(bytes, [0xfe, 0xff])) return decodificarUtf16(bytes, false);

  const sinBom = empiezaCon(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes;

  // UTF-8 primero, en modo estricto: si el archivo es binario, falla acá.
  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(sinBom);
    if (pareceTexto(texto)) return texto;
  } catch {
    // No es UTF-8 válido; puede ser una codificación vieja de Windows.
  }

  const texto = decodificarWindows1252(sinBom);
  return pareceTexto(texto) ? texto : null;
}

// --- Validación ----------------------------------------------------------

export type ResultadoExtraccion = { ok: true; texto: string } | { ok: false; motivo: string };

export const FORMATOS_ACEPTADOS = "PDF, Word, Excel, LibreOffice, CSV y texto plano";

// Los tipos que reconocemos pero no sabemos leer. El mensaje dice qué hacer,
// no solo que no se pudo (05-sistema-de-diseno.md §5).
const SIN_LECTOR: Partial<Record<TipoDocumento, string>> = {
  "doc-viejo":
    "Es un archivo de Office 97-2003 (.doc o .xls), un formato que ya no podemos leer. " +
    "Abrilo y guardalo como .docx o .xlsx, o pegá las tareas como texto.",
  pptx:
    "Es una presentación de PowerPoint. Todavía no leemos diapositivas: " +
    "copiá las tareas a un documento, a una planilla o pegalas como texto.",
};

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

  const sinLector = SIN_LECTOR[tipo];
  if (sinLector) return { ok: false, motivo: `No pudimos leer "${nombre}". ${sinLector}` };

  if (tipo === "desconocido") {
    return {
      ok: false,
      motivo:
        `No pudimos leer "${nombre}": no parece un documento con texto adentro. ` +
        `Aceptamos ${FORMATOS_ACEPTADOS}. También podés pegar las tareas como texto.`,
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
