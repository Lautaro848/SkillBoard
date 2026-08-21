import { z } from "zod";

// Campos que SÍ pueden mostrarse en una TV (03-modulos-y-alcance.md, módulo 6).
// La lista es cerrada. El bloqueo real está en la función `carrusel_datos` de
// la base, que solo selecciona estas columnas; esto de acá es la interfaz.
export const CAMPOS_CARRUSEL = [
  { clave: "foto", etiqueta: "Foto", detalle: "Si no hay foto se muestran las iniciales" },
  { clave: "puesto", etiqueta: "Puesto", detalle: "" },
  { clave: "departamento", etiqueta: "Departamento", detalle: "" },
  { clave: "antiguedad", etiqueta: "Antigüedad", detalle: "Años en la empresa, sin la fecha exacta" },
  {
    clave: "certificados",
    etiqueta: "Certificados vigentes",
    detalle: "Solo el tipo, nunca el número. Los vencidos no se muestran.",
  },
] as const;

export type CampoCarrusel = (typeof CAMPOS_CARRUSEL)[number]["clave"];

// Se listan en la pantalla para que quede claro que la decisión está tomada,
// no que nos olvidamos de ponerlos. Una TV en el comedor la ve cualquiera,
// incluidas las visitas.
export const CAMPOS_BLOQUEADOS = [
  "Documento",
  "Email",
  "Teléfono",
  "Fecha de nacimiento",
  "Dirección",
  "Observaciones",
  "Número de certificado",
  "Salario",
] as const;

export const carruselSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(60, "El nombre no puede superar los 60 caracteres"),
  // Mismo rango que el check `segundos_por_slide` de la base.
  segundosPorSlide: z.coerce
    .number({ message: "Ingresá un número" })
    .int()
    .min(5, "Menos de 5 segundos no alcanza para leer una pantalla")
    .max(60, "Más de 60 segundos por persona hace el ciclo demasiado lento"),
  activo: z.boolean(),
  departamentos: z.array(z.string().uuid()),
  puestos: z.array(z.string().uuid()),
  empleados: z.array(z.string().uuid()),
  campos: z.array(z.enum(["foto", "puesto", "departamento", "antiguedad", "certificados"])),
});

export type CarruselInput = z.infer<typeof carruselSchema>;

// El formulario manda varias casillas con el mismo nombre; getAll las junta.
export function leerFormularioCarrusel(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    segundosPorSlide: formData.get("segundosPorSlide"),
    activo: formData.get("activo") === "on",
    departamentos: formData.getAll("departamentos").map(String),
    puestos: formData.getAll("puestos").map(String),
    empleados: formData.getAll("empleados").map(String),
    campos: formData.getAll("campos").map(String),
  };
}

// 24 bytes en hexadecimal: 48 caracteres, el mismo largo que genera el
// default de la columna. Web Crypto existe igual en Workers, Node y el
// navegador, así que no hace falta una función en la base para rotarlo.
export function generarToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
