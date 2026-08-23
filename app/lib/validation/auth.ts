import { z } from "zod";
import { revisarReglas } from "~/lib/validation/contrasena";

export interface PasswordCheck {
  ok: boolean;
  reasons: string[];
}

// La comprobación del servidor, que es la que decide (Regla 3).
//
// Acá había además una consulta contra `dumb-passwords`, la lista de las
// 10.000 contraseñas más usadas. Se sacó porque es inalcanzable: ninguna
// entrada de esa lista puede pasar las cinco reglas, así que la rama nunca
// se ejecutaba. La cuenta está en el test, con los datos.
//
// Que sea inalcanzable no significa que no haga falta protección contra
// contraseñas filtradas: significa que esa lista no la daba. La da Supabase
// Auth con su comprobación contra HaveIBeenPwned, que se activa en el panel
// del proyecto y consulta un corpus de miles de millones, no de 10.000.
export function checkPasswordStrength(password: string): PasswordCheck {
  const { ok, faltantes } = revisarReglas(password);
  return { ok, reasons: faltantes };
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
