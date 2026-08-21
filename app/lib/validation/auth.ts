import { z } from "zod";
// @ts-expect-error -- no published type definitions
import dumbPasswords from "dumb-passwords";

export interface PasswordCheck {
  ok: boolean;
  reasons: string[];
}

// Rule-based strength check with visible text per requisite, not just a color
// bar (03-modulos-y-alcance.md §Contraseñas). The blocklist is the offline
// "10,000 most common passwords" list bundled by dumb-passwords — no
// external calls, as required.
export function checkPasswordStrength(password: string): PasswordCheck {
  const reasons: string[] = [];
  if (password.length < 10) reasons.push("Al menos 10 caracteres");
  if (!/[a-z]/.test(password)) reasons.push("Una letra minúscula");
  if (!/[A-Z]/.test(password)) reasons.push("Una letra mayúscula");
  if (!/[0-9]/.test(password)) reasons.push("Un número");
  if (!/[^A-Za-z0-9]/.test(password)) reasons.push("Un símbolo");
  if (password.length >= 10 && dumbPasswords.check(password)) {
    reasons.push("No puede ser una de las contraseñas más comunes");
  }
  return { ok: reasons.length === 0, reasons };
}

const passwordSchema = z.string().superRefine((value, ctx) => {
  const { ok, reasons } = checkPasswordStrength(value);
  if (!ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: reasons.join(" · ") });
  }
});

export const registroSchema = z.object({
  empresa: z
    .string()
    .trim()
    .min(2, "El nombre de la empresa debe tener al menos 2 caracteres")
    .max(100, "El nombre de la empresa no puede superar los 100 caracteres"),
  nombre: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre")
    .max(50)
    .regex(/^[A-Za-zÀ-ÿñÑ\s\-']+$/, "Solo letras, espacios, guiones y apóstrofes"),
  apellido: z
    .string()
    .trim()
    .min(2, "Ingresá tu apellido")
    .max(50)
    .regex(/^[A-Za-zÀ-ÿñÑ\s\-']+$/, "Solo letras, espacios, guiones y apóstrofes"),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido"),
  password: passwordSchema,
});

export type RegistroInput = z.infer<typeof registroSchema>;

export const iniciarSesionSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export type IniciarSesionInput = z.infer<typeof iniciarSesionSchema>;
