import { z } from "zod";

// Mismo esquema para departamentos, puestos y aptitudes: nombre 2-50, se
// recorta antes de validar (Regla 3, doble capa por construcción).
export const catalogoNombreSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(50, "El nombre no puede superar los 50 caracteres"),
});

export const puestoSchema = catalogoNombreSchema.extend({
  departamentoId: z.string().uuid().optional().or(z.literal("")),
});

export const aptitudSchema = catalogoNombreSchema.extend({
  categoria: z.enum(["tecnica", "operativa", "administrativa", "blanda"]),
});

export const tipoCertificadoSchema = catalogoNombreSchema.extend({
  requiereVencimiento: z.coerce.boolean().default(true),
  diasAlerta: z.coerce.number().int().min(1).max(365).default(30),
});

export type PuestoInput = z.infer<typeof puestoSchema>;
export type AptitudInput = z.infer<typeof aptitudSchema>;
export type TipoCertificadoInput = z.infer<typeof tipoCertificadoSchema>;
