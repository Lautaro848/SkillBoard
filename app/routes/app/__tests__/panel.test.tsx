import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import Panel from "~/routes/app/panel";

// Criterio de aceptación del módulo 5 (03-modulos-y-alcance.md): "sin
// objetivos cargados, el panel no muestra un índice inventado ni gráficos de
// ejemplo". Es fácil de romper sin darse cuenta al retocar la vista, así que
// se prueba en vez de confiar en la revisión.

const vacio = {
  periodo: "mes" as const,
  etiquetaPeriodo: "agosto de 2026",
  etiquetaAnterior: "julio de 2026",
  totales: {
    empleadosActivos: 3,
    certificadosVencidos: 0,
    certificadosPorVencer: 0,
    obligatoriosFaltantes: 0,
  },
  distribucion: [{ clave: "d1", etiqueta: "Producción", valor: 3, href: "/empleados?departamento=d1" }],
  indice: null,
  medibles: 0,
  objetivos: [],
  comparacion: { texto: "Sin período anterior para comparar", direccion: "sin_dato" as const },
  hayEmpleados: true,
};

// Un router de datos, no un MemoryRouter a secas: el selector de período usa
// <Form>, que necesita el contexto de datos para existir.
 
const render = (loaderData: any) => {
  const router = createMemoryRouter(
    [
      {
        path: "/panel",
         
        element: <Panel loaderData={loaderData} {...({} as any)} />,
      },
    ],
    { initialEntries: ["/panel"] },
  );
  return renderToStaticMarkup(<RouterProvider router={router} />);
};

describe("Panel", () => {
  it("sin objetivos no muestra ningún índice", () => {
    const html = render(vacio);
    expect(html).toContain("Índice de cumplimiento");
    expect(html).toContain("Todavía no hay objetivos en este período");
    // Si no hay índice, no hay figura: la clase de la cifra protagonista no
    // llega a renderizarse.
    expect(html).not.toContain("text-figura");
  });

  it("con objetivos pero sin mediciones dice qué falta, no un cero", () => {
    const html = render({
      ...vacio,
      objetivos: [
        {
          id: "o1",
          nombre: "Reducir accidentes",
          periodoInicio: "2026-08-01",
          periodoFin: "2026-08-31",
          valorInicial: 10,
          valorObjetivo: 4,
          direccion: "disminuir",
          peso: 3,
          unidad: "cantidad",
          valorActual: null,
          avanceReal: 0,
          avanceEsperado: 0.65,
          cumplimiento: null,
          medido: false,
        },
      ],
    });
    expect(html).toContain("ninguno tiene mediciones todavía");
    expect(html).toContain("Sin medir");
    expect(html).not.toContain("text-figura");
  });

  it("con un objetivo medido muestra la figura y el texto de comparación", () => {
    const html = render({
      ...vacio,
      indice: 72,
      medibles: 1,
      comparacion: { texto: "5 puntos más que el período anterior", direccion: "sube" },
      objetivos: [
        {
          id: "o1",
          nombre: "Reducir accidentes",
          periodoInicio: "2026-08-01",
          periodoFin: "2026-08-31",
          valorInicial: 10,
          valorObjetivo: 4,
          direccion: "disminuir",
          peso: 3,
          unidad: "cantidad",
          valorActual: 7,
          avanceReal: 0.5,
          avanceEsperado: 0.65,
          cumplimiento: 72,
          medido: true,
        },
      ],
    });
    expect(html).toContain(">72<");
    // La flecha nunca va sola.
    expect(html).toContain("5 puntos más que el período anterior");
    expect(html).toContain("julio de 2026");
    // El color no lleva solo el significado: el estado va escrito.
    expect(html).toContain("Atrasado");
  });

  it("sin empleados no dibuja tarjetas ni gráficos", () => {
    const html = render({ ...vacio, hayEmpleados: false });
    expect(html).toContain("Todavía no cargaste empleados");
    expect(html).not.toContain("Índice de cumplimiento");
    expect(html).not.toContain("por departamento");
  });
});
