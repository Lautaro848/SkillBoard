import { z } from "zod";

// Refleja las restricciones `check` de supabase/migrations/0001_schema.sql
// (emision_no_futura, vencimiento_posterior) para que un error de base nunca
// sea la primera vez que el usuario se entera: el mensaje ya salió acá.
export const certificadoSchema = z
  .object({
    tipoId: z.string().uuid("Elegí un tipo de certificado"),
    numero: z
      .string()
      .trim()
      .max(50, "El número no puede superar los 50 caracteres")
      .optional()
      .or(z.literal("")),
    entidadEmisora: z.string().trim().max(100).optional().or(z.literal("")),
    fechaEmision: z.coerce.date({ message: "Ingresá una fecha de emisión válida" }),
    // Opcional: hay tipos de certificado que no vencen (requiere_vencimiento
    // en false), y para esos el campo queda vacío a propósito.
    fechaVencimiento: z.coerce.date().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);

    if (data.fechaEmision > hoy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de emisión no puede ser futura",
        path: ["fechaEmision"],
      });
    }

    if (data.fechaVencimiento instanceof Date && data.fechaVencimiento <= data.fechaEmision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El vencimiento tiene que ser posterior a la fecha de emisión",
        path: ["fechaVencimiento"],
      });
    }
  });

export type CertificadoInput = z.infer<typeof certificadoSchema>;

export const ADJUNTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (02-modelo-de-datos.md)

// Se valida por el contenido real del archivo (números mágicos), no por la
// extensión: un .exe renombrado a .pdf no pasa (Regla 3).
export type TipoAdjunto = "pdf" | "jpeg" | "png";

export function detectarTipoAdjunto(bytes: Uint8Array): TipoAdjunto | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"; // %PDF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

export const MIME_POR_TIPO: Record<TipoAdjunto, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
};

// Estados que devuelve la vista v_certificados. El estado NUNCA se guarda en
// una columna: se calcula al consultar, así un certificado vencido no puede
// quedar mostrándose como vigente porque un cron falló (02-modelo-de-datos.md §4).
export type EstadoCertificado =
  | "vencido"
  | "vence_hoy"
  | "por_vencer"
  | "vigente"
  | "sin_vencimiento";

// Ícono + texto además del color: el estado tiene que distinguirse sin
// depender de ver color (criterio de accesibilidad del módulo 4).
export const ESTADO_CERTIFICADO: Record<
  EstadoCertificado,
  { etiqueta: string; icono: string; color: string; orden: number }
> = {
  vencido: { etiqueta: "Vencido", icono: "⨯", color: "var(--color-danger)", orden: 0 },
  vence_hoy: { etiqueta: "Vence hoy", icono: "!", color: "var(--color-danger)", orden: 1 },
  por_vencer: { etiqueta: "Por vencer", icono: "!", color: "var(--color-warning)", orden: 2 },
  vigente: { etiqueta: "Vigente", icono: "✓", color: "var(--color-success)", orden: 3 },
  sin_vencimiento: { etiqueta: "Sin vencimiento", icono: "∞", color: "var(--color-text-muted)", orden: 4 },
};

// "Vencido hace 3 días" / "Vence en 12 días" / "Vence hoy": el texto explica
// el estado sin obligar a hacer la cuenta mental con la fecha.
export function textoVencimiento(estado: EstadoCertificado, diasRestantes: number | null): string {
  if (estado === "sin_vencimiento" || diasRestantes === null) return "No vence";
  if (estado === "vence_hoy") return "Vence hoy";
  if (diasRestantes < 0) {
    const dias = Math.abs(diasRestantes);
    return `Vencido hace ${dias} ${dias === 1 ? "día" : "días"}`;
  }
  return `Vence en ${diasRestantes} ${diasRestantes === 1 ? "día" : "días"}`;
}
