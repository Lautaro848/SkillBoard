import { describe, expect, it } from "vitest";
import {
  calcularIndice,
  calcularObjetivo,
  compararConAnterior,
  formatearValor,
  indiceAlCorte,
  objetivoEnRango,
  type ObjetivoParaCalculo,
} from "~/lib/cumplimiento";

// Período de 100 días: del 1/1 al 11/4. Con `hoy` al día 50 el avance
// esperado es exactamente 0,5, que hace las cuentas fáciles de leer.
const base: ObjetivoParaCalculo = {
  id: "1",
  nombre: "Objetivo de prueba",
  periodoInicio: "2026-01-01",
  periodoFin: "2026-04-11",
  valorInicial: 0,
  valorObjetivo: 100,
  direccion: "aumentar",
  peso: 1,
  unidad: "cantidad",
  valorActual: null,
};

const dia50 = new Date("2026-02-20T12:00:00Z");

describe("calcularObjetivo", () => {
  it("al ritmo esperado da 100", () => {
    const r = calcularObjetivo({ ...base, valorActual: 50 }, dia50);
    expect(Math.round(r.cumplimiento!)).toBe(100);
  });

  it("a la mitad del ritmo da 50", () => {
    const r = calcularObjetivo({ ...base, valorActual: 25 }, dia50);
    expect(Math.round(r.cumplimiento!)).toBe(50);
  });

  it("se topea en 125 aunque se haya superado la meta", () => {
    const r = calcularObjetivo({ ...base, valorActual: 500 }, dia50);
    expect(r.cumplimiento).toBe(125);
  });

  it("no da negativo si se retrocedió respecto del inicio", () => {
    const r = calcularObjetivo({ ...base, valorInicial: 50, valorObjetivo: 100, valorActual: 20 }, dia50);
    expect(r.cumplimiento).toBe(0);
  });

  it("un objetivo sin medir no cuenta como cero", () => {
    const r = calcularObjetivo(base, dia50);
    expect(r.cumplimiento).toBeNull();
    expect(r.medido).toBe(false);
  });

  it("funciona igual para objetivos de 'disminuir'", () => {
    // Bajar de 100 a 50; a mitad de camino (75) y a mitad de tiempo = 100.
    const r = calcularObjetivo(
      { ...base, valorInicial: 100, valorObjetivo: 50, direccion: "disminuir", valorActual: 75 },
      dia50,
    );
    expect(Math.round(r.cumplimiento!)).toBe(100);
  });

  it("un objetivo de 'disminuir' que sube da 0, no un número grande", () => {
    const r = calcularObjetivo(
      { ...base, valorInicial: 100, valorObjetivo: 50, direccion: "disminuir", valorActual: 120 },
      dia50,
    );
    expect(r.cumplimiento).toBe(0);
  });

  it("no divide por cero cuando la meta es igual al punto de partida", () => {
    const enMeta = calcularObjetivo({ ...base, valorInicial: 10, valorObjetivo: 10, valorActual: 10 }, dia50);
    expect(enMeta.cumplimiento).toBe(100);
    const fuera = calcularObjetivo({ ...base, valorInicial: 10, valorObjetivo: 10, valorActual: 3 }, dia50);
    expect(fuera.cumplimiento).toBe(0);
  });

  it("no da Infinity si el período todavía no empezó", () => {
    const antes = new Date("2025-12-01T12:00:00Z");
    const r = calcularObjetivo({ ...base, valorActual: 10 }, antes);
    expect(r.cumplimiento).toBeNull();
    expect(Number.isFinite(r.avanceEsperado)).toBe(true);
  });

  it("después del fin del período el avance esperado no pasa de 1", () => {
    const despues = new Date("2027-01-01T12:00:00Z");
    const r = calcularObjetivo({ ...base, valorActual: 100 }, despues);
    expect(r.avanceEsperado).toBe(1);
    expect(Math.round(r.cumplimiento!)).toBe(100);
  });
});

describe("calcularIndice", () => {
  it("pondera por peso", () => {
    // Uno al 100 con peso 1, otro al 0 con peso 4 → (100*1 + 0*4)/5 = 20.
    const r = calcularIndice(
      [
        { ...base, id: "a", valorActual: 50, peso: 1 },
        { ...base, id: "b", valorActual: 0, peso: 4 },
      ],
      dia50,
    );
    expect(r.indice).toBe(20);
  });

  it("ignora los objetivos sin medir en vez de contarlos como cero", () => {
    const r = calcularIndice(
      [
        { ...base, id: "a", valorActual: 50 },
        { ...base, id: "b", valorActual: null },
      ],
      dia50,
    );
    expect(r.indice).toBe(100);
    expect(r.medibles).toBe(1);
  });

  it("devuelve null cuando no hay nada medible, en vez de inventar un cero", () => {
    const r = calcularIndice([{ ...base, valorActual: null }], dia50);
    expect(r.indice).toBeNull();
  });

  it("sin objetivos no hay índice", () => {
    expect(calcularIndice([], dia50).indice).toBeNull();
  });
});

describe("compararConAnterior", () => {
  it("describe la subida en texto, no solo con una flecha", () => {
    expect(compararConAnterior(80, 72)).toEqual({
      texto: "8 puntos más que el período anterior",
      direccion: "sube",
    });
  });

  it("usa singular cuando es un punto", () => {
    expect(compararConAnterior(73, 72).texto).toBe("1 punto más que el período anterior");
  });

  it("avisa cuando no hay con qué comparar", () => {
    expect(compararConAnterior(80, null).direccion).toBe("sin_dato");
  });
});

describe("formatearValor", () => {
  it("usa el formato argentino de miles", () => {
    expect(formatearValor(1234567, "cantidad")).toBe("1.234.567");
  });

  it("agrega el símbolo según la unidad", () => {
    expect(formatearValor(85, "porcentaje")).toBe("85%");
    expect(formatearValor(1500, "moneda")).toBe("$1.500");
    expect(formatearValor(40, "horas")).toBe("40 h");
  });
});

describe("objetivoEnRango", () => {
  const anual = { ...base, periodoInicio: "2026-01-01", periodoFin: "2026-12-31" };

  it("un objetivo anual también corre durante un mes de ese año", () => {
    expect(
      objetivoEnRango(anual, new Date("2026-08-01T12:00:00Z"), new Date("2026-08-31T12:00:00Z")),
    ).toBe(true);
  });

  it("un objetivo que terminó antes del período queda afuera", () => {
    expect(
      objetivoEnRango(anual, new Date("2027-01-01T12:00:00Z"), new Date("2027-01-31T12:00:00Z")),
    ).toBe(false);
  });

  it("basta con que se pisen por un día", () => {
    expect(
      objetivoEnRango(anual, new Date("2026-12-31T12:00:00Z"), new Date("2027-06-30T12:00:00Z")),
    ).toBe(true);
  });
});

describe("indiceAlCorte", () => {
  // Mismo objetivo de 100 días, con dos mediciones: una al día 25 y otra al 50.
  const mediciones = new Map([
    [
      "1",
      [
        { fecha: "2026-01-26", valor: 25 },
        { fecha: "2026-02-20", valor: 50 },
      ],
    ],
  ]);

  it("usa la última medición anterior al corte, no la más reciente de todas", () => {
    // Al día 25 el avance esperado es 0,25 y el real 0,25: va al ritmo.
    const r = indiceAlCorte([base], mediciones, new Date("2026-01-26T12:00:00Z"));
    expect(r.indice).toBe(100);
  });

  it("no ve mediciones futuras al corte", () => {
    // Antes de la primera medición no hay valor: el objetivo no es medible.
    const r = indiceAlCorte([base], mediciones, new Date("2026-01-10T12:00:00Z"));
    expect(r.indice).toBeNull();
    expect(r.medibles).toBe(0);
  });

  it("sin mediciones no inventa un índice", () => {
    expect(indiceAlCorte([base], new Map(), dia50).indice).toBeNull();
  });

  it("sin objetivos tampoco", () => {
    expect(indiceAlCorte([], mediciones, dia50).indice).toBeNull();
  });
});
