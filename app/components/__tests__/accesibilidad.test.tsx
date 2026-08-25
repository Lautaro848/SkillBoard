// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import axe from "axe-core";
import Panel from "~/routes/app/panel";
import Reglas from "~/routes/app/configuracion/reglas";
import CambiarContrasena from "~/routes/app/configuracion/contrasena";
import AppLayout from "~/routes/app/layout";
import { Boton } from "~/components/ui/boton";
import { Campo, LeyendaObligatorios, Selector } from "~/components/ui/campo";
import { Aviso, EstadoVacio } from "~/components/ui/estados";
import { EstadoCert } from "~/components/estado-certificado";

// Cero incumplimientos críticos para dar una pantalla por terminada
// (05-sistema-de-diseno.md §7). Sin esto, "cumple AA" es una intención.
//
// Corre sobre el HTML que sale del servidor, que es lo que recibe cualquier
// lector de pantalla antes de que el navegador ejecute una línea de JavaScript.

async function revisar(html: string) {
  document.body.innerHTML = `<main>${html}</main>`;

  const resultado = await axe.run(document.body, {
    // Las de contraste necesitan un navegador de verdad para resolver los
    // colores calculados; ese control ya está hecho con la fórmula WCAG en el
    // documento y verificado valor por valor.
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });

  return resultado.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes[0]?.html?.slice(0, 120)}`);
}

// Las pantallas reciben más props de las que necesitan para renderizar; el
// tipo generado las exige todas. Se pasa solo loaderData, como en el resto de
// los tests de render.
 
const props = (datos: unknown) => ({ loaderData: datos }) as any;

const enRouter = (el: React.ReactElement) =>
  renderToStaticMarkup(
    <RouterProvider router={createMemoryRouter([{ path: "/", element: el }], { initialEntries: ["/"] })} />,
  );

describe("accesibilidad", () => {
  // Primero: comprobar que el arnés sirve. Un test que pasa siempre, incluso
  // con markup roto a propósito, no prueba nada.
  it("detecta un campo sin etiqueta, un botón sin nombre y una imagen sin alternativa", async () => {
    // Sin placeholder a propósito: un placeholder le da nombre accesible al
    // campo y la regla `label` deja de saltar, que es justamente por qué el
    // sistema de diseño prohíbe usarlo como único identificador.
    const roto = `
      <input type="text" />
      <button></button>
      <img src="/x.png" />
    `;
    const fallas = await revisar(roto);
    const texto = fallas.join(" ");

    expect(texto).toContain("label");
    expect(texto).toContain("button-name");
    expect(texto).toContain("image-alt");
  });

  it("los campos de formulario tienen etiqueta asociada", async () => {
    const html = renderToStaticMarkup(
      <form>
        <LeyendaObligatorios />
        <Campo etiqueta="Nombre" obligatorio ayuda="Como figura en el documento" />
        <Campo etiqueta="ID interno" error="Ese ID interno ya está en uso" />
        <Selector etiqueta="Departamento">
          <option>Mantenimiento</option>
        </Selector>
        <Boton variante="principal">Guardar</Boton>
      </form>,
    );
    expect(await revisar(html)).toEqual([]);
  });

  it("los avisos y estados vacíos no rompen el orden de encabezados", async () => {
    const html = renderToStaticMarkup(
      <div>
        <h1>Certificados</h1>
        <Aviso tono="error" titulo="No se pudo guardar">
          Volvé a intentar en unos segundos.
        </Aviso>
        <Aviso tono="advertencia">8 certificados vencen este mes.</Aviso>
        <EstadoVacio titulo="Todavía no hay certificados" explicacion="Cargá el primero para empezar." />
        <EstadoCert estado="vencido" diasRestantes={-12} />
      </div>,
    );
    expect(await revisar(html)).toEqual([]);
  });

  it("el panel completo no tiene incumplimientos críticos", async () => {
    const datos = {
      periodo: "mes",
      etiquetaPeriodo: "agosto de 2026",
      etiquetaAnterior: "julio de 2026",
      totales: {
        empleadosActivos: 47,
        certificadosVencidos: 3,
        certificadosPorVencer: 8,
        obligatoriosFaltantes: 2,
      },
      distribucion: [{ clave: "a", etiqueta: "Producción", valor: 21, href: "/empleados" }],
      indice: 78,
      medibles: 3,
      objetivos: [
        {
          id: "o1",
          nombre: "Reducir accidentes",
          periodoInicio: "2026-01-01",
          periodoFin: "2026-12-31",
          valorInicial: 12,
          valorObjetivo: 4,
          direccion: "disminuir",
          peso: 3,
          unidad: "cantidad",
          valorActual: 10,
          avanceReal: 0.25,
          avanceEsperado: 0.64,
          cumplimiento: 39,
          medido: true,
        },
      ],
      comparacion: { texto: "6 puntos más que el período anterior", direccion: "sube" },
      hayEmpleados: true,
    };

    expect(await revisar(enRouter(<Panel {...props(datos)} />))).toEqual([]);
  });

  it("el menú del celular y el cajón tampoco", async () => {
    const html = renderToStaticMarkup(
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: "/",
              element: <AppLayout {...props({ perfil: null, empresaNombre: "Metalúrgica del Sur" })} />,
              children: [{ index: true, element: <h1>Panel</h1> }],
            },
          ],
          { initialEntries: ["/"] },
        )}
      />,
    );
    expect(await revisar(html)).toEqual([]);
  });

  it("la pantalla de reglas tampoco", async () => {
    const datos = {
      reglas: [
        {
          id: "r1",
          tipo: "exclusion",
          enunciado: "Juan Pérez: está con la parada de planta.",
          peso: -10,
          activa: true,
          origen: "derivada",
          condiciones: { vigenciaHasta: "2026-08-29" },
          creada_en: "2026-08-22",
        },
      ],
      metricas: {
        totalAsignaciones: 24,
        corregidas: 5,
        aceptacionSinCambios: 79,
        correccionesPorLote: 1.7,
        reglasPropuestas: 5,
        reglasAprobadas: 2,
        tasaAprobacion: 40,
      },
    };

    expect(await revisar(enRouter(<Reglas {...props(datos)} />))).toEqual([]);
  });

  it("el cambio de contraseña tampoco, y muestra el error donde corresponde", async () => {
    const conError = {
      loaderData: { email: "lautaro@metalurgicadelsur.com.ar" },
      actionData: {
        errores: {
          nueva: ["Esta contraseña aparece 24.230.577 veces en filtraciones de datos públicas."],
        },
      },
    } as any;

    const html = enRouter(<CambiarContrasena {...conError} />);

    // El error de una contraseña filtrada tiene que salir en la pantalla, no
    // solo existir en la respuesta.
    expect(html).toContain("24.230.577 veces");
    expect(await revisar(html)).toEqual([]);
  });
});
