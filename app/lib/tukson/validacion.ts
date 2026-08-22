import type { Postulante } from "~/lib/tukson/asignar";
import type { MapaSeudonimos } from "~/lib/tukson/seudonimo";

// Paso 6 — Validación de la salida del modelo (04-tukson.md §2).
//
// Todo lo que devuelve el modelo pasa por acá antes de tocar nada. El sistema
// nunca se cae por una respuesta rara: cae al puntaje y sigue.

export interface RespuestaModelo {
  elegido: string; // un seudónimo, EMP-0001
  justificacion: string;
}

export type Incidente =
  | { clase: "identificador_invalido"; recibido: string }
  | { clase: "sin_respuesta" }
  | { clase: "formato_invalido"; recibido: string }
  | { clase: "justificacion_con_dato_ajeno"; termino: string };

export interface Validado {
  /** id real del elegido, ya resuelto. */
  empleadoId: string;
  justificacion: string;
  /** true si hubo que caer a la elección por puntaje. */
  porReserva: boolean;
  incidentes: Incidente[];
}

export function validarRespuesta(
  respuesta: RespuestaModelo | null,
  postulantes: Postulante[],
  mapa: MapaSeudonimos,
  justificacionDeReserva: string,
): Validado {
  const incidentes: Incidente[] = [];
  const porPuntaje = postulantes[0];

  const reserva = (): Validado => ({
    empleadoId: porPuntaje.candidato.id,
    justificacion: justificacionDeReserva,
    porReserva: true,
    incidentes,
  });

  if (!respuesta) {
    incidentes.push({ clase: "sin_respuesta" });
    return reserva();
  }

  if (typeof respuesta.elegido !== "string" || typeof respuesta.justificacion !== "string") {
    incidentes.push({ clase: "formato_invalido", recibido: JSON.stringify(respuesta).slice(0, 200) });
    return reserva();
  }

  // Si el modelo propone un identificador que no está en la lista de
  // candidatos, se descarta su respuesta entera: pudo haber inventado a
  // alguien o haber elegido a quien el filtro duro ya descartó.
  const empleadoId = mapa.aReal.get(respuesta.elegido.trim());
  if (!empleadoId) {
    incidentes.push({ clase: "identificador_invalido", recibido: respuesta.elegido });
    return reserva();
  }

  // Si la justificación menciona el seudónimo de otro candidato, algo se
  // mezcló. Se registra pero no se descarta: el elegido es válido.
  for (const [seudonimo, id] of mapa.aReal) {
    if (id === empleadoId) continue;
    if (respuesta.justificacion.includes(seudonimo)) {
      incidentes.push({ clase: "justificacion_con_dato_ajeno", termino: seudonimo });
    }
  }

  return {
    empleadoId,
    // El texto del modelo se muestra tal cual pero sin los seudónimos: el
    // usuario no tiene por qué ver EMP-0003 en pantalla.
    justificacion: reemplazarSeudonimos(respuesta.justificacion, mapa, postulantes),
    porReserva: false,
    incidentes,
  };
}

function reemplazarSeudonimos(
  texto: string,
  mapa: MapaSeudonimos,
  postulantes: Postulante[],
): string {
  let salida = texto;
  for (const [seudonimo, id] of mapa.aReal) {
    const p = postulantes.find((x) => x.candidato.id === id);
    if (!p) continue;
    salida = salida.replaceAll(seudonimo, `${p.candidato.nombre} ${p.candidato.apellido}`);
  }
  return salida;
}
