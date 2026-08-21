import { describe, expect, it } from "vitest";
import { corteDe, esClavePeriodo, rangoPeriodo } from "~/lib/periodos";

// 21 de agosto de 2026, un viernes.
const HOY = new Date("2026-08-21T15:00:00Z");

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("rangoPeriodo", () => {
  it("el mes actual va del 1 al último día", () => {
    const r = rangoPeriodo("mes", HOY);
    expect(iso(r.inicio)).toBe("2026-08-01");
    expect(iso(r.fin)).toBe("2026-08-31");
  });

  it("el mes anterior no se pasa de largo en meses de 30 días", () => {
    const r = rangoPeriodo("mes", HOY, -1);
    expect(iso(r.inicio)).toBe("2026-07-01");
    expect(iso(r.fin)).toBe("2026-07-31");
  });

  it("el mes anterior a enero es diciembre del año pasado", () => {
    const r = rangoPeriodo("mes", new Date("2026-01-10T12:00:00Z"), -1);
    expect(iso(r.inicio)).toBe("2025-12-01");
    expect(iso(r.fin)).toBe("2025-12-31");
  });

  it("febrero bisiesto termina el 29", () => {
    const r = rangoPeriodo("mes", new Date("2028-02-10T12:00:00Z"));
    expect(iso(r.fin)).toBe("2028-02-29");
  });

  it("agosto cae en el tercer trimestre", () => {
    const r = rangoPeriodo("trimestre", HOY);
    expect(iso(r.inicio)).toBe("2026-07-01");
    expect(iso(r.fin)).toBe("2026-09-30");
    expect(r.etiqueta).toBe("Trimestre 3 de 2026");
  });

  it("el trimestre anterior al primero es el cuarto del año pasado", () => {
    const r = rangoPeriodo("trimestre", new Date("2026-02-10T12:00:00Z"), -1);
    expect(iso(r.inicio)).toBe("2025-10-01");
    expect(iso(r.fin)).toBe("2025-12-31");
    expect(r.etiqueta).toBe("Trimestre 4 de 2025");
  });

  it("el año va del 1 de enero al 31 de diciembre", () => {
    const r = rangoPeriodo("anio", HOY);
    expect(iso(r.inicio)).toBe("2026-01-01");
    expect(iso(r.fin)).toBe("2026-12-31");
    expect(rangoPeriodo("anio", HOY, -1).etiqueta).toBe("Año 2025");
  });
});

describe("corteDe", () => {
  it("un período en curso se mide hasta hoy, no hasta su cierre", () => {
    expect(corteDe(rangoPeriodo("mes", HOY), HOY)).toBe(HOY);
  });

  it("un período ya terminado se mide hasta su cierre", () => {
    const anterior = rangoPeriodo("mes", HOY, -1);
    expect(corteDe(anterior, HOY)).toBe(anterior.fin);
  });
});

describe("esClavePeriodo", () => {
  it("rechaza lo que venga de la URL o la cookie si no es una clave conocida", () => {
    expect(esClavePeriodo("mes")).toBe(true);
    expect(esClavePeriodo("semana")).toBe(false);
    expect(esClavePeriodo(null)).toBe(false);
  });
});
