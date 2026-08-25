import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { detectarTipo, lineasDeTareas } from "~/lib/tukson/extraccion";
import { extraerTexto } from "~/lib/tukson/extraccion.server";

// Las tareas del día llegan en lo que cada empresa usa. Antes se aceptaban dos
// formatos —PDF y Word— y todo lo demás daba "no pudimos leer el archivo",
// incluido un .txt, que es el caso más simple que existe.
//
// Cada caso de acá construye un archivo DE VERDAD y lo hace pasar por el mismo
// camino que la pantalla: detección por contenido, lectura y separación en
// tareas. Nada de simular la lectura, porque lo que hay que probar es
// justamente que los lectores funcionen.

const TAREAS = [
  "Reparar bomba hidráulica del sector 3",
  "Revisar tablero eléctrico del galpón norte",
  "Cambiar filtros de la línea 2",
];

const enBytes = (texto: string) => new TextEncoder().encode(texto);

async function odf(mimetype: string, contenido: string): Promise<Uint8Array> {
  const zip = new JSZip();
  // El mimetype va primero y sin comprimir: así lo escribe LibreOffice y así
  // lo reconoce la detección.
  zip.file("mimetype", mimetype, { compression: "STORE" });
  zip.file("content.xml", contenido);
  return zip.generateAsync({ type: "uint8array" });
}

describe("texto plano: lo que sale del Bloc de notas", () => {
  it("lee un .txt en UTF-8", async () => {
    const bytes = enBytes(TAREAS.join("\n"));
    expect(detectarTipo(bytes)).toBe("texto");

    const r = await extraerTexto(bytes, "tareas.txt");
    expect(r.ok).toBe(true);
    expect(r.ok && lineasDeTareas(r.texto)).toEqual(TAREAS);
  });

  it("lee un .txt guardado en UTF-16, como hace el Bloc de notas de Windows", async () => {
    const texto = TAREAS.join("\r\n");
    const bytes = new Uint8Array(2 + texto.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe; // BOM UTF-16 LE
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      bytes[2 + i * 2] = c & 0xff;
      bytes[3 + i * 2] = c >> 8;
    }

    const r = await extraerTexto(bytes, "tareas.txt");
    expect(r.ok && lineasDeTareas(r.texto)).toEqual(TAREAS);
  });

  it("lee un .txt viejo en Windows-1252, con los acentos en su lugar", async () => {
    // "Reparar bomba hidráulica" con la á como un solo byte (0xE1), que es
    // como lo guarda un Windows sin UTF-8. En UTF-8 eso es inválido.
    const bytes = new Uint8Array([
      ...enBytes("Reparar bomba hidr"),
      0xe1,
      ...enBytes("ulica del sector 3\nRevisar el tablero del galp"),
      0xf3,
      ...enBytes("n norte"),
    ]);
    expect(detectarTipo(bytes)).toBe("texto");

    const r = await extraerTexto(bytes, "viejo.txt");
    expect(r.ok && r.texto).toContain("hidráulica");
  });

  it("un .csv es texto y cada renglón es una tarea", async () => {
    const bytes = enBytes(`tarea,sector\n${TAREAS[0]},3\n${TAREAS[1]},norte`);
    const r = await extraerTexto(bytes, "tareas.csv");
    expect(r.ok && lineasDeTareas(r.texto)).toHaveLength(3);
  });
});

describe("Excel", () => {
  it("lee una planilla y hace una tarea por fila", async () => {
    const hoja = XLSX.utils.aoa_to_sheet([["Tarea", "Sector"], [TAREAS[0], "3"], [TAREAS[1], "Norte"]]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Tareas");
    const bytes = new Uint8Array(XLSX.write(libro, { type: "array", bookType: "xlsx" }));

    expect(detectarTipo(bytes)).toBe("xlsx");

    const r = await extraerTexto(bytes, "tareas.xlsx");
    expect(r.ok).toBe(true);
    expect(r.ok && r.texto).toContain(TAREAS[0]);
    expect(r.ok && r.texto).toContain("Norte");
    // Una fila, una línea: la celda de al lado no se pierde ni parte la tarea.
    expect(r.ok && lineasDeTareas(r.texto)).toContain(`${TAREAS[0]} · 3`);
  });

  it("no se queda con la primera hoja: recorre todas", async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([["Portada"]]), "Portada");
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([[TAREAS[2]]]), "Lunes");
    const bytes = new Uint8Array(XLSX.write(libro, { type: "array", bookType: "xlsx" }));

    const r = await extraerTexto(bytes, "semana.xlsx");
    expect(r.ok && r.texto).toContain(TAREAS[2]);
  });
});

describe("LibreOffice", () => {
  it("lee un .odt separando los párrafos", async () => {
    const parrafos = TAREAS.map((t) => `<text:p>${t}</text:p>`).join("");
    const bytes = await odf(
      "application/vnd.oasis.opendocument.text",
      `<?xml version="1.0"?><office:document-content><office:body><office:text>${parrafos}</office:text></office:body></office:document-content>`,
    );

    expect(detectarTipo(bytes)).toBe("odt");

    const r = await extraerTexto(bytes, "partes.odt");
    expect(r.ok).toBe(true);
    // Sin cerrar los párrafos con un salto, todo el documento sería una sola
    // línea y no habría forma de separar las tareas.
    expect(r.ok && lineasDeTareas(r.texto)).toEqual(TAREAS);
  });

  it("lee un .ods separando las filas", async () => {
    const filas = TAREAS.map((t) => `<table:table-row><text:p>${t}</text:p></table:table-row>`).join("");
    const bytes = await odf(
      "application/vnd.oasis.opendocument.spreadsheet",
      `<?xml version="1.0"?><office:document-content><table:table>${filas}</table:table></office:document-content>`,
    );

    expect(detectarTipo(bytes)).toBe("ods");
    const r = await extraerTexto(bytes, "planilla.ods");
    expect(r.ok && lineasDeTareas(r.texto)).toEqual(TAREAS);
  });
});

describe("RTF", () => {
  it("saca los códigos de control y deja el texto", async () => {
    const rtf = `{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Arial;}}\\f0\\fs24 ${TAREAS[0]}\\par ${TAREAS[1]}\\par}`;
    const bytes = enBytes(rtf);

    expect(detectarTipo(bytes)).toBe("rtf");

    const r = await extraerTexto(bytes, "parte.rtf");
    expect(r.ok).toBe(true);
    expect(r.ok && lineasDeTareas(r.texto)).toEqual([TAREAS[0], TAREAS[1]]);
  });
});

describe("formatos que reconocemos pero no sabemos leer", () => {
  it("un .doc de Office 97 dice cómo convertirlo, no solo que falló", async () => {
    // Firma OLE, la misma del .doc y el .xls viejos.
    const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(64).fill(0)]);
    expect(detectarTipo(bytes)).toBe("doc-viejo");

    const r = await extraerTexto(bytes, "parte.doc");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toContain("guardalo como .docx");
  });

  it("un PowerPoint dice qué hacer con él", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    expect(detectarTipo(bytes)).toBe("pptx");
    const r = await extraerTexto(bytes, "reunion.pptx");
    expect(!r.ok && r.motivo).toContain("diapositivas");
  });

  it("una imagen sigue sin pasar", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);
    expect(detectarTipo(png)).toBe("desconocido");

    const r = await extraerTexto(png, "foto.png");
    expect(!r.ok && r.motivo).toContain("no parece un documento con texto");
  });
});
