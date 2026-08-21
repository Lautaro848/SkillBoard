// Lógica pura del carrusel, compartida por la vista de TV y la vista previa
// de la configuración. Sin acceso a datos, para poder probarla sola.

import type { CampoCarrusel } from "~/lib/validation/carrusel";

export interface EmpleadoCarrusel {
  id: string;
  nombre: string;
  apellido: string;
  fotoKey: string | null;
  fotoUrl?: string | null;
  puesto: string | null;
  departamento: string | null;
  fechaIngreso: string | null;
  certificados: string[];
}

export interface ConfigCarrusel {
  nombre: string;
  segundosPorSlide: number;
  empresa: string;
  logoKey: string | null;
  logoUrl?: string | null;
  campos: Record<CampoCarrusel, boolean>;
}

export interface DatosCarrusel {
  carrusel: ConfigCarrusel;
  empleados: EmpleadoCarrusel[];
}

// Antigüedad en texto, sin la fecha exacta de ingreso: en una pantalla
// pública alcanza con "3 años" y la fecha es un dato de legajo.
export function antiguedadTexto(fechaIngreso: string, hoy = new Date()): string {
  const ingreso = new Date(`${fechaIngreso.slice(0, 10)}T12:00:00Z`);
  const meses =
    (hoy.getUTCFullYear() - ingreso.getUTCFullYear()) * 12 + (hoy.getUTCMonth() - ingreso.getUTCMonth());

  if (meses < 1) return "Recién ingresó";
  if (meses < 12) return `${meses} ${meses === 1 ? "mes" : "meses"} en la empresa`;

  const anios = Math.floor(meses / 12);
  return `${anios} ${anios === 1 ? "año" : "años"} en la empresa`;
}

// Al reemplazar la tanda de datos, la TV no debe saltar al principio: si la
// persona que se está mostrando sigue en la lista, se sigue por ella.
export function reubicarIndice(
  anteriores: EmpleadoCarrusel[],
  nuevos: EmpleadoCarrusel[],
  indice: number,
): number {
  if (nuevos.length === 0) return 0;
  const actual = anteriores[indice];
  if (!actual) return 0;
  const encontrado = nuevos.findIndex((e) => e.id === actual.id);
  return encontrado >= 0 ? encontrado : indice % nuevos.length;
}
