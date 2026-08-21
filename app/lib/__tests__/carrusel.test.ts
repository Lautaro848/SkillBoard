import { describe, expect, it } from "vitest";
import { antiguedadTexto, reubicarIndice, type EmpleadoCarrusel } from "~/lib/carrusel";

const HOY = new Date("2026-08-21T12:00:00Z");

describe("antiguedadTexto", () => {
  it("cuenta años cumplidos", () => {
    expect(antiguedadTexto("2023-08-21", HOY)).toBe("3 años en la empresa");
  });

  it("usa el singular con un año", () => {
    expect(antiguedadTexto("2025-08-01", HOY)).toBe("1 año en la empresa");
  });

  it("por debajo del año cuenta meses", () => {
    expect(antiguedadTexto("2026-02-21", HOY)).toBe("6 meses en la empresa");
  });

  it("quien acaba de entrar no aparece con 0", () => {
    expect(antiguedadTexto("2026-08-15", HOY)).toBe("Recién ingresó");
  });
});

describe("reubicarIndice", () => {
  const emp = (id: string) => ({ id }) as EmpleadoCarrusel;
  const antes = [emp("a"), emp("b"), emp("c")];

  it("sigue por la misma persona aunque cambie el orden", () => {
    // Se estaba mostrando "b"; en la tanda nueva quedó tercera.
    expect(reubicarIndice(antes, [emp("c"), emp("a"), emp("b")], 1)).toBe(2);
  });

  it("si esa persona ya no está, no se sale del rango", () => {
    const nuevos = [emp("a"), emp("c")];
    const i = reubicarIndice(antes, nuevos, 2);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(nuevos.length);
  });

  it("una lista vacía no deja un índice inválido", () => {
    expect(reubicarIndice(antes, [], 2)).toBe(0);
  });

  it("la primera carga arranca en cero", () => {
    expect(reubicarIndice([], [emp("a")], 0)).toBe(0);
  });
});
