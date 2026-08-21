import { z } from "zod";

const NOMBRE_RE = /^[A-Za-zÀ-ÿñÑ\s\-']{2,50}$/;
const ID_INTERNO_RE = /^[A-Za-z0-9]{3,20}$/;
const TELEFONO_RE = /^[0-9\s\-()+]{8,20}$/;

function capitalizar(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'])\p{L}/gu, (letra) => letra.toUpperCase());
}

function edadEnAnios(fecha: Date, referencia = new Date()): number {
  let edad = referencia.getFullYear() - fecha.getFullYear();
  const aunNoCumplio =
    referencia.getMonth() < fecha.getMonth() ||
    (referencia.getMonth() === fecha.getMonth() && referencia.getDate() < fecha.getDate());
  if (aunNoCumplio) edad--;
  return edad;
}

// Refleja exactamente las restricciones `check` de supabase/migrations/0001_schema.sql
// (edad_valida, ingreso_valido) para que un error de base nunca sea la primera
// vez que el usuario se entera — el mensaje ya salió acá, antes de guardar.
export const empleadoSchema = z
  .object({
    idInterno: z
      .string()
      .trim()
      .regex(ID_INTERNO_RE, "El ID interno debe ser alfanumérico, de 3 a 20 caracteres")
      .transform((v) => v.toUpperCase()),
    nombre: z
      .string()
      .trim()
      .regex(NOMBRE_RE, "El nombre solo puede contener letras, espacios, guiones y apóstrofes")
      .transform(capitalizar),
    apellido: z
      .string()
      .trim()
      .regex(NOMBRE_RE, "El apellido solo puede contener letras, espacios, guiones y apóstrofes")
      .transform(capitalizar),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Ingresá un email válido")
      .optional()
      .or(z.literal("")),
    telefono: z
      .string()
      .trim()
      .regex(TELEFONO_RE, "El teléfono solo puede tener dígitos, espacios, guiones, paréntesis y +")
      .optional()
      .or(z.literal("")),
    fechaNacimiento: z.coerce.date({ message: "Ingresá una fecha de nacimiento válida" }),
    fechaIngreso: z.coerce.date({ message: "Ingresá una fecha de ingreso válida" }),
    puestoId: z.string().uuid("Elegí un puesto"),
    departamentoId: z.string().uuid("Elegí un departamento"),
    estado: z.enum(["activo", "licencia", "baja"]).default("activo"),
    observaciones: z
      .string()
      .trim()
      .max(2000, "Las observaciones no pueden superar los 2000 caracteres")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const edad = edadEnAnios(data.fechaNacimiento);
    if (edad < 16 || edad > 80) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El empleado debe tener entre 16 y 80 años. Revisá la fecha de nacimiento.",
        path: ["fechaNacimiento"],
      });
    }

    const hoy = new Date();
    if (data.fechaIngreso > hoy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de ingreso no puede ser futura",
        path: ["fechaIngreso"],
      });
    } else if (edadEnAnios(data.fechaNacimiento, data.fechaIngreso) < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de ingreso no puede ser anterior a que el empleado cumpliera 16 años",
        path: ["fechaIngreso"],
      });
    }
  });

export type EmpleadoInput = z.infer<typeof empleadoSchema>;

export const empleadoAptitudSchema = z.object({
  aptitudId: z.string().uuid("Elegí una aptitud"),
  nivel: z.coerce.number().int().min(1).max(5),
});

export const NIVEL_ETIQUETAS: Record<number, string> = {
  1: "En formación",
  2: "Básico",
  3: "Competente",
  4: "Avanzado",
  5: "Referente",
};

// Extensión visual del contenido real de un archivo (números mágicos), no
// de su nombre — un .exe renombrado a .jpg no pasa esto (Regla 3).
const FIRMAS_IMAGEN: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
};

export function esImagenValida(bytes: Uint8Array): boolean {
  const esJpegOPng = Object.values(FIRMAS_IMAGEN).some((firma) =>
    firma.every((byte, i) => bytes[i] === byte),
  );
  const esRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const esWebp =
    esRiff && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return esJpegOPng || esWebp;
}

export const FOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
