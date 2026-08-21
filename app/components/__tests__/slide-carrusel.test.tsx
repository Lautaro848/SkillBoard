import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SlideCarrusel } from "~/components/slide-carrusel";
import type { EmpleadoCarrusel } from "~/lib/carrusel";

// El bloqueo real de campos sensibles está en la base (0012_carrusel.sql):
// la consulta que los leería no existe. Esto prueba la otra mitad: que la
// pantalla respete lo que sí se configuró apagar, y que nunca deje un hueco.

const empleado: EmpleadoCarrusel = {
  id: "8f1c0a2e-0000-4000-8000-000000000001",
  nombre: "María",
  apellido: "Gómez",
  fotoKey: null,
  fotoUrl: null,
  puesto: "Operaria de planta",
  departamento: "Producción",
  fechaIngreso: "2021-03-15",
  certificados: ["Curso de altura", "Manejo de autoelevador"],
};

const todos = {
  foto: true,
  puesto: true,
  departamento: true,
  antiguedad: true,
  certificados: true,
};

describe("SlideCarrusel", () => {
  it("muestra lo que está habilitado", () => {
    const html = renderToStaticMarkup(<SlideCarrusel empleado={empleado} campos={todos} />);
    expect(html).toContain("María");
    expect(html).toContain("Gómez");
    expect(html).toContain("Operaria de planta");
    expect(html).toContain("Producción");
    expect(html).toContain("Curso de altura");
  });

  it("apagar un campo lo saca de la pantalla", () => {
    const html = renderToStaticMarkup(
      <SlideCarrusel empleado={empleado} campos={{ ...todos, certificados: false, departamento: false }} />,
    );
    expect(html).toContain("María");
    expect(html).not.toContain("Curso de altura");
    expect(html).not.toContain("Producción");
  });

  it("sin foto van las iniciales, nunca un hueco", () => {
    const html = renderToStaticMarkup(<SlideCarrusel empleado={empleado} campos={todos} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("MG");
  });

  it("con foto no dibuja las iniciales encima", () => {
    const html = renderToStaticMarkup(
      <SlideCarrusel empleado={{ ...empleado, fotoUrl: "https://ejemplo/foto.jpg" }} campos={todos} />,
    );
    expect(html).toContain("https://ejemplo/foto.jpg");
  });

  it("un empleado sin puesto ni departamento no deja líneas vacías", () => {
    const html = renderToStaticMarkup(
      <SlideCarrusel
        empleado={{ ...empleado, puesto: null, departamento: null, certificados: [] }}
        campos={todos}
      />,
    );
    expect(html).toContain("María");
    // Nada de <p> sin contenido donde debería ir el puesto.
    expect(html).not.toMatch(/<p[^>]*><\/p>/);
  });
});
