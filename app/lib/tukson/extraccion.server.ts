import {
  AVISO_ESCANEO,
  decodificarTexto,
  detectarTipo,
  pareceEscaneo,
  validarArchivo,
  type ResultadoExtraccion,
  type TipoDocumento,
} from "~/lib/tukson/extraccion";

// Extracción real de texto. Va aparte del módulo puro para que la validación
// (magic numbers, tamaño, escaneos) se pueda probar sin cargar los lectores,
// que son pesados y se importan solo cuando hacen falta.

const comoArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

async function desdePdf(bytes: Uint8Array): Promise<string> {
  // unpdf está pensado para entornos sin Node completo, que es lo que hay
  // en Workers. Se importa acá adentro para no cargarlo en cada request.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const documento = await getDocumentProxy(bytes);
  const { text } = await extractText(documento, { mergePages: true });
  return text;
}

async function desdeDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  // Se conserva la estructura de listas y tablas: en un parte de trabajo,
  // cada viñeta suele ser una tarea.
  const { value } = await mammoth.extractRawText({ arrayBuffer: comoArrayBuffer(bytes) });
  return value;
}

// Una planilla se lee fila por fila, y cada fila es una línea. Es lo que hace
// que una tarea por renglón siga funcionando igual que en un documento.
//
// Se recorren TODAS las hojas, no la primera: en la importación de empleados
// ya pasó que la hoja con los datos era la segunda.
async function desdeExcel(bytes: Uint8Array): Promise<string> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(bytes, { type: "array", cellDates: true });
  const partes: string[] = [];

  for (const nombre of libro.SheetNames) {
    const filas: unknown[][] = XLSX.utils.sheet_to_json(libro.Sheets[nombre], {
      header: 1,
      raw: false,
      defval: "",
    });

    // El nombre de la hoja solo si hay más de una: en un libro de una hoja
    // sería una línea de ruido que después habría que descartar como tarea.
    if (libro.SheetNames.length > 1) partes.push(nombre);

    for (const fila of filas) {
      const celdas = fila.map((c) => String(c ?? "").trim()).filter(Boolean);
      if (celdas.length > 0) partes.push(celdas.join(" · "));
    }
  }

  return partes.join("\n");
}

// LibreOffice: .odt y .ods son ZIP con un content.xml adentro. Se cierran los
// párrafos y las filas con un salto de línea ANTES de sacar las etiquetas,
// porque si no todo el documento queda en un solo renglón y no hay forma de
// separar las tareas.
async function desdeOpenDocument(bytes: Uint8Array): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(comoArrayBuffer(bytes));
  const contenido = await zip.file("content.xml")?.async("string");
  if (!contenido) return "";

  return contenido
    .replace(/<\/(?:text:p|text:h|table:table-row)>/g, "\n")
    .replace(/<text:tab\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Grupos de un RTF que son metadatos, no contenido. Si no se descartan
// enteros, la tabla de fuentes termina metiendo "Arial;" adelante de la
// primera tarea.
const GRUPOS_DESCARTABLES = /^\\\*?\\?(fonttbl|colortbl|stylesheet|info|generator|listtable|listoverridetable|pntext|themedata|datastore|latentstyles)\b/;

// Salta un grupo {...} entero, contando llaves para no cortar en una anidada.
function finDelGrupo(rtf: string, inicio: number): number {
  let profundidad = 0;
  for (let i = inicio; i < rtf.length; i++) {
    if (rtf[i] === "\\") {
      i++; // lo que sigue a una barra está escapado
      continue;
    }
    if (rtf[i] === "{") profundidad++;
    else if (rtf[i] === "}") {
      profundidad--;
      if (profundidad === 0) return i + 1;
    }
  }
  return rtf.length;
}

// RTF: se descartan los grupos de metadatos y los códigos de control, y queda
// el texto. Alcanza para una lista de tareas, que es para lo que se usa acá.
function desdeRtf(bytes: Uint8Array): string {
  const crudo = decodificarTexto(bytes) ?? "";

  let limpio = "";
  for (let i = 0; i < crudo.length; i++) {
    if (crudo[i] === "{" && GRUPOS_DESCARTABLES.test(crudo.slice(i + 1, i + 40))) {
      i = finDelGrupo(crudo, i) - 1;
      continue;
    }
    limpio += crudo[i];
  }

  return limpio
    .replace(/\\par[d]?\b/g, "\n")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

async function leer(tipo: TipoDocumento, bytes: Uint8Array): Promise<string> {
  switch (tipo) {
    case "pdf":
      return desdePdf(bytes);
    case "docx":
      return desdeDocx(bytes);
    case "xlsx":
      return desdeExcel(bytes);
    case "odt":
    case "ods":
      return desdeOpenDocument(bytes);
    case "rtf":
      return desdeRtf(bytes);
    default:
      return decodificarTexto(bytes) ?? "";
  }
}

export async function extraerTexto(bytes: Uint8Array, nombre: string): Promise<ResultadoExtraccion> {
  const problema = validarArchivo(bytes, nombre);
  if (problema) return problema;

  const tipo = detectarTipo(bytes);

  try {
    const texto = await leer(tipo, bytes);

    if (pareceEscaneo(texto)) {
      // Un PDF sin capa de texto es un escaneo. Se avisa en vez de devolver
      // basura: una tarea mal interpretada es peor que ninguna tarea.
      if (tipo === "pdf") return { ok: false, motivo: AVISO_ESCANEO };
      return {
        ok: false,
        motivo: `El documento "${nombre}" no tiene texto que podamos leer. Probá pegando las tareas directamente.`,
      };
    }

    return { ok: true, texto };
  } catch {
    return {
      ok: false,
      motivo: `No pudimos leer "${nombre}". Puede estar dañado o protegido con contraseña. Probá pegando las tareas como texto.`,
    };
  }
}
