import { z } from "zod";

export const objetivoSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(3, "El nombre debe tener al menos 3 caracteres")
      .max(100, "El nombre no puede superar los 100 caracteres"),
    descripcion: z.string().trim().max(500).optional().or(z.literal("")),
    periodicidad: z.enum(["semanal", "mensual", "trimestral", "anual"]),
    periodoInicio: z.coerce.date({ message: "Ingresá una fecha de inicio válida" }),
    periodoFin: z.coerce.date({ message: "Ingresá una fecha de fin válida" }),
    unidad: z.enum(["cantidad", "porcentaje", "moneda", "horas"]),
    valorInicial: z.coerce.number({ message: "Ingresá un número" }),
    valorObjetivo: z.coerce.number({ message: "Ingresá un número" }),
    direccion: z.enum(["aumentar", "disminuir"]),
    // Pondera el promedio del índice: un objetivo con peso 5 pesa cinco veces
    // más que uno con peso 1.
    peso: z.coerce.number().int().min(1).max(5),
  })
  .superRefine((data, ctx) => {
    // Misma restricción que el check `periodo_valido` de la base.
    if (data.periodoFin <= data.periodoInicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de fin tiene que ser posterior a la de inicio",
        path: ["periodoFin"],
      });
    }

    // Un objetivo que dice "aumentar" pero cuya meta es menor al punto de
    // partida está mal cargado: el índice lo mediría al revés de lo que la
    // persona espera.
    if (data.direccion === "aumentar" && data.valorObjetivo < data.valorInicial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si el objetivo es aumentar, la meta tiene que ser mayor al valor inicial",
        path: ["valorObjetivo"],
      });
    }
    if (data.direccion === "disminuir" && data.valorObjetivo > data.valorInicial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si el objetivo es disminuir, la meta tiene que ser menor al valor inicial",
        path: ["valorObjetivo"],
      });
    }
  });

export type ObjetivoInput = z.infer<typeof objetivoSchema>;

export const medicionSchema = z.object({
  objetivoId: z.string().uuid(),
  valor: z.coerce.number({ message: "Ingresá un número" }),
  fecha: z.coerce.date({ message: "Ingresá una fecha válida" }),
  nota: z.string().trim().max(300).optional().or(z.literal("")),
});

export const ETIQUETAS_PERIODICIDAD: Record<string, string> = {
  semanal: "Semanal",
  mensual: "Mensual",
  trimestral: "Trimestral",
  anual: "Anual",
};

export const ETIQUETAS_UNIDAD: Record<string, string> = {
  cantidad: "Cantidad",
  porcentaje: "Porcentaje",
  moneda: "Moneda",
  horas: "Horas",
};

export const ETIQUETAS_PESO: Record<number, string> = {
  1: "1 · Muy baja",
  2: "2 · Baja",
  3: "3 · Normal",
  4: "4 · Alta",
  5: "5 · Crítica",
};
