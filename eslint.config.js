import js from "@eslint/js";
import tseslint from "typescript-eslint";

// El sistema de diseño (05-sistema-de-diseno.md §9) exige que ningún
// componente escriba un color en hexadecimal ni una medida en píxeles de
// forma directa. Sin una regla que lo haga cumplir, la "fuente única de
// verdad" dura hasta que alguien tiene apuro.
//
// Los valores arbitrarios de Tailwind son la puerta de atrás típica:
// text-[#1D4ED8], p-[13px], bg-[rgba(0,0,0,.5)], text-[var(--lo-que-sea)].
// Se bloquean en el atributo className, que es donde aparecen.
const VALOR_ARBITRARIO = String.raw`\[(#[0-9a-fA-F]{3,8}|-?[0-9.]+(px|rem|em|pt)|rgba?\(|hsla?\(|var\(--)`;

const MENSAJE =
  "Valor arbitrario de Tailwind. El sistema de diseño es la única fuente de verdad: " +
  "usá un token de app.css (bg-primario, text-secundario, rounded-tarjeta, p-6…). " +
  "Si el valor que necesitás no existe como token, agregalo al @theme y documentalo.";

// La otra puerta de atrás: la paleta que trae Tailwind. `bg-blue-500` no está
// en el sistema de diseño, no tiene contraste verificado y rompe la
// coherencia igual que un hexadecimal suelto.
const PALETA_TAILWIND = String.raw`\b(bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|divide|accent|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]`;

const MENSAJE_PALETA =
  "Color de la paleta por defecto de Tailwind. Solo se usan los colores del sistema de diseño " +
  "(primario, acento, exito, advertencia, error, texto, secundario, borde, fondo, superficie, serie-1…6), " +
  "que tienen el contraste calculado con la fórmula WCAG.";

// WCAG 1.4.11 pide 3:1 para el límite visual de un control. En el sistema hay
// dos bordes y es fácil agarrar el que no va:
//
//   --color-borde              #64748b  4,76:1  → controles
//   --color-borde-decorativo   #e2e8f0  1,23:1  → separar tarjetas y filas
//
// Un campo con el borde decorativo se ve bien en el monitor de quien lo
// escribe y desaparece en una pantalla con reflejo o para alguien con la
// vista cansada. Pasó dos veces —34 controles la última—, así que ahora lo
// dice la herramienta y no la revisión.
const CONTROLES = String.raw`^(input|select|textarea|button)$`;

const MENSAJE_BORDE =
  "Borde decorativo (#e2e8f0, 1,23:1) en un control. WCAG 1.4.11 exige 3:1 para el límite " +
  "visual de algo con lo que se interactúa. Usá la clase `campo` en campos y " +
  "`boton boton-secundario` en botones, que ya traen el borde correcto además del foco y el " +
  "estado deshabilitado. Si necesitás conservar otra forma, `border-borde` (#64748b, 4,76:1).";

export default tseslint.config(
  // Los *.tmp.* son andamios de un rato (medición, capturas) y no forman
  // parte de la aplicación.
  { ignores: ["build/**", "node_modules/**", ".react-router/**", "public/**", "**/*.tmp.*"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXAttribute[name.name=/^(className|class)$/] Literal[value=/${VALOR_ARBITRARIO}/]`,
          message: MENSAJE,
        },
        {
          // Misma prohibición dentro de plantillas: className={`... ${x}`}.
          selector: `JSXAttribute[name.name=/^(className|class)$/] TemplateElement[value.raw=/${VALOR_ARBITRARIO}/]`,
          message: MENSAJE,
        },
        {
          selector: `JSXAttribute[name.name=/^(className|class)$/] Literal[value=/${PALETA_TAILWIND}/]`,
          message: MENSAJE_PALETA,
        },
        {
          selector: `JSXAttribute[name.name=/^(className|class)$/] TemplateElement[value.raw=/${PALETA_TAILWIND}/]`,
          message: MENSAJE_PALETA,
        },
        {
          selector: `JSXOpeningElement[name.name=/${CONTROLES}/] JSXAttribute[name.name=/^(className|class)$/] Literal[value=/border-borde-decorativo/]`,
          message: MENSAJE_BORDE,
        },
        {
          selector: `JSXOpeningElement[name.name=/${CONTROLES}/] JSXAttribute[name.name=/^(className|class)$/] TemplateElement[value.raw=/border-borde-decorativo/]`,
          message: MENSAJE_BORDE,
        },
      ],
    },
  },

  {
    // La vista de TV y sus componentes calculan tamaños en píxeles a propósito:
    // es una pantalla con su propia escala, que se lee a tres metros y se
    // achica proporcionalmente para la vista previa. Los píxeles ahí son el
    // dato, no un atajo. Igual salen de las constantes de app/lib/tv.ts.
    files: ["app/components/slide-carrusel.tsx", "app/routes/tv.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },

  {
    // Las filas que devuelve PostgREST llegan sin tipar y hoy se anotan como
    // `any` en unos veinte lugares. Escribirles interfaces de verdad es una
    // mejora real, pero es una limpieza aparte del sistema de diseño y toca
    // archivos que este cambio no necesita mover. Queda apagada a propósito
    // y anotada como pendiente, no ignorada en silencio.
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

  {
    // Un argumento que el framework exige recibir pero la función no usa.
    files: ["app/entry.server.tsx"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
);
