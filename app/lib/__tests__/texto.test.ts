import { describe, expect, it } from "vitest";
import { coincide, normalizar } from "~/lib/texto";

describe("normalizar", () => {
  // Los valores esperados salen de correr app.normalizar() contra la base
  // real. Si alguna vez dejan de coincidir, las dos búsquedas del producto se
  // comportan distinto y buscar lo mismo en dos pantallas da resultados
  // distintos.
  const COMO_EN_POSTGRES: [string, string][] = [
    ["María", "maria"],
    ["Muñoz", "munoz"],
    ["PEÑA", "pena"],
    ["Güemes", "guemes"],
    ["D'Angelo", "d'angelo"],
  ];

  it.each(COMO_EN_POSTGRES)("normaliza %s igual que la base", (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });

  it("saca los espacios de los costados", () => {
    expect(normalizar("  Pérez  ")).toBe("perez");
  });
});

describe("coincide", () => {
  it("buscar sin acentos encuentra lo acentuado", () => {
    expect(coincide("Maria", "María Gómez")).toBe(true);
    expect(coincide("gomez", "María Gómez")).toBe(true);
    expect(coincide("munoz", "Ana Muñoz")).toBe(true);
  });

  it("buscar con acentos también encuentra", () => {
    expect(coincide("María", "María Gómez")).toBe(true);
    expect(coincide("MARÍA", "maría gómez")).toBe(true);
  });

  it("encuentra por cualquiera de los campos", () => {
    expect(coincide("TM0087", "María Gómez", "TM0087")).toBe(true);
    expect(coincide("altura", "María Gómez", "TM0087", "Curso de altura")).toBe(true);
  });

  it("no encuentra lo que no está", () => {
    expect(coincide("Rodríguez", "María Gómez", "TM0087")).toBe(false);
  });

  it("un término vacío no filtra nada", () => {
    expect(coincide("", "cualquier cosa")).toBe(true);
    expect(coincide("   ", "cualquier cosa")).toBe(true);
  });

  it("un campo nulo no rompe la comparación", () => {
    expect(coincide("maria", null, undefined, "María Gómez")).toBe(true);
    expect(coincide("maria", null, undefined)).toBe(false);
  });

  it("encuentra por una parte del nombre, no solo por el principio", () => {
    expect(coincide("gome", "María Gómez")).toBe(true);
  });
});
