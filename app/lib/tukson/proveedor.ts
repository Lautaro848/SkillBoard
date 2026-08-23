// El modelo de lenguaje interviene en tres pasos y en ninguno decide solo.
// Esta es la frontera: todo lo que hay del otro lado es reemplazable, y lo que
// hay de este lado —filtro, puntaje, validación— funciona sin él.
//
// Hoy NO hay ningún proveedor conectado, a propósito. Tukson asigna por
// puntaje y explica por plantilla, que es la reserva que el propio documento
// exige que exista (04-tukson.md §2, paso 6). Conectar un proveedor es
// implementar esta interfaz y devolverlo desde `proveedorConfigurado`.

export interface Uso {
  proveedor: string;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
  latenciaMs: number;
}

export interface RespuestaProveedor<T> {
  datos: T | null;
  uso: Uso;
  error?: string;
}

export interface ProveedorModelo {
  nombre: string;

  /** Paso 2: texto libre → lista de tareas. El usuario la revisa siempre. */
  estructurarTareas(texto: string): Promise<RespuestaProveedor<unknown[]>>;

  /** Paso 5: desempate entre candidatos ya filtrados y seudonimizados. */
  elegirCandidato(prompt: string): Promise<RespuestaProveedor<{ elegido: string; justificacion: string }>>;

  /** Paso 7: el motivo de una corrección → regla candidata. */
  proponerRegla(motivo: string, contexto: string): Promise<RespuestaProveedor<unknown>>;
}

// Tiempo máximo de espera. Pasado esto se usa la reserva: es preferible una
// asignación por puntaje en 30 segundos que una pantalla colgada.
export const ESPERA_MAXIMA_MS = 30_000;

export function proveedorConfigurado(): ProveedorModelo | null {
  // Cuando se conecte uno, acá se lee su clave del entorno y se devuelve la
  // implementación. Mientras devuelva null, todo el pipeline corre por el
  // camino determinista y la pantalla lo dice de frente.
  return null;
}

// Envuelve una llamada con su límite de tiempo. Que un proveedor lento cuelgue
// la pantalla es el modo de falla más molesto y el más fácil de evitar.
export async function conEspera<T>(
  promesa: Promise<RespuestaProveedor<T>>,
  ms = ESPERA_MAXIMA_MS,
): Promise<RespuestaProveedor<T> | null> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const limite = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => resolver(null), ms);
  });

  try {
    return await Promise.race([promesa, limite]);
  } catch {
    return null;
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}
