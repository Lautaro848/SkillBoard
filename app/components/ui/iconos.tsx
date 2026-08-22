// Íconos mínimos, dibujados a mano y no una librería entera: son cinco y se
// usan siempre acompañados de texto. Decorativos, con aria-hidden, porque el
// significado lo lleva la etiqueta que va al lado (§1, regla de oro del
// color: el color y el ícono nunca son el único portador de información).

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function IconoAlerta() {
  return (
    <svg {...base}>
      <path d="M8 1.8 1.3 13.5h13.4L8 1.8Z" />
      <path d="M8 6.4v3.2" />
      <path d="M8 11.6h.01" />
    </svg>
  );
}

export function IconoError() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M10.2 5.8 5.8 10.2M5.8 5.8l4.4 4.4" />
    </svg>
  );
}

export function IconoTilde() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.4" />
      <path d="m5.2 8.2 2 2 3.6-4" />
    </svg>
  );
}

export function IconoInfo() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 7.4v3.6" />
      <path d="M8 5.2h.01" />
    </svg>
  );
}

export function IconoReloj() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 4.4V8l2.4 1.6" />
    </svg>
  );
}
