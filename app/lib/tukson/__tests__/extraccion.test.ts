import { describe, expect, it } from "vitest";
import {
  detectarTipo,
  lineasDeTareas,
  pareceEscaneo,
  validarArchivo,
} from "~/lib/tukson/extraccion";

const bytes = (...n: number[]) => new Uint8Array([...n, ...new Array(64).fill(0x41)]);

describe("detectarTipo", () => {
  it("reconoce un PDF por su contenido", () => {
    expect(detectarTipo(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("pdf");
  });

  it("reconoce un docx por la firma de ZIP", () => {
    expect(detectarTipo(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("docx");
  });

  it("un ejecutable renombrado a .pdf no pasa", () => {
    // MZ: cabecera de un .exe de Windows.
    expect(detectarTipo(bytes(0x4d, 0x5a, 0x90, 0x00))).toBe("desconocido");
  });
});

describe("validarArchivo", () => {
  it("acepta un PDF normal", () => {
    expect(validarArchivo(bytes(0x25, 0x50, 0x44, 0x46), "tareas.pdf")).toBeNull();
  });

  it("rechaza un archivo vacío diciendo cuál", () => {
    const r = validarArchivo(new Uint8Array(), "vacio.pdf");
    expect(r?.ok).toBe(false);
    expect(r && !r.ok && r.motivo).toContain("vacio.pdf");
  });

  it("rechaza por tamaño diciendo cuánto pesa y qué hacer", () => {
    const grande = new Uint8Array(11 * 1024 * 1024);
    grande.set([0x25, 0x50, 0x44, 0x46]);
    const r = validarArchivo(grande, "enorme.pdf");
    expect(r && !r.ok && r.motivo).toContain("11,0 MB");
    expect(r && !r.ok && r.motivo).toContain("10 MB");
  });

  it("ante un tipo desconocido ofrece la salida de pegar texto", () => {
    const r = validarArchivo(bytes(0x4d, 0x5a), "raro.bin");
    expect(r && !r.ok && r.motivo).toContain("pegar las tareas como texto");
  });
});

describe("pareceEscaneo", () => {
  it("un PDF de imágenes casi no trae texto", () => {
    expect(pareceEscaneo("  \n \n Página 1 \n")).toBe(true);
  });

  it("un PDF con texto real no se confunde con un escaneo", () => {
    expect(
      pareceEscaneo(
        "Reparar bomba hidráulica del sector 3. Revisar tablero eléctrico del galpón norte.",
      ),
    ).toBe(false);
  });
});

describe("lineasDeTareas", () => {
  it("una tarea por línea, con o sin viñeta", () => {
    const texto = `
- Reparar bomba hidráulica del sector 3
* Revisar tablero eléctrico
1. Cambiar filtros de la línea 2
2) Limpiar el pozo
   Pintar el portón

`;
    expect(lineasDeTareas(texto)).toEqual([
      "Reparar bomba hidráulica del sector 3",
      "Revisar tablero eléctrico",
      "Cambiar filtros de la línea 2",
      "Limpiar el pozo",
      "Pintar el portón",
    ]);
  });

  it("descarta líneas que no son una tarea", () => {
    expect(lineasDeTareas("Reparar bomba\n-\n \nok")).toEqual(["Reparar bomba"]);
  });

  it("un texto vacío no inventa tareas", () => {
    expect(lineasDeTareas("   \n\n  ")).toEqual([]);
  });
});
