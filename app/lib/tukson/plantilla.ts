import type { Desglose } from "~/lib/tukson/puntaje";

// Justificación por plantilla, sin modelo de lenguaje.
//
// Es la reserva del paso 6: si el modelo no responde, devuelve algo inválido o
// directamente no hay proveedor conectado, el sistema NO se cae — asigna por
// puntaje y explica con esto. Tukson sin IA disponible sigue siendo útil
// (04-tukson.md §2, paso 6).
//
// Como hoy no hay proveedor conectado, esta es la justificación que se usa
// siempre. No es un texto de relleno: sale del desglose real.

function listar(nombres: string[]): string {
  if (nombres.length === 0) return "";
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

export function justificacionPorPlantilla(
  desglose: Desglose,
  nombreAptitud: (id: string) => string,
): string {
  const d = desglose.detalle;
  const partes: string[] = [];

  if (d.aptitudesQueTiene.length > 0) {
    const conNivel = d.aptitudesQueTiene.map(
      (id) => `${nombreAptitud(id)} ${desgloseNivel(desglose, id)}`,
    );
    partes.push(`Cubre ${listar(conNivel)}`);
  } else if (d.aptitudesQueFaltan.length > 0) {
    // Se dice de frente: es el candidato con mejor puntaje, no el ideal.
    partes.push(
      `No tiene cargada ninguna de las aptitudes que pide la tarea (${listar(
        d.aptitudesQueFaltan.map(nombreAptitud),
      )})`,
    );
  }

  if (d.tareasSimilares > 0) {
    partes.push(
      `${d.tareasCompletadas} de ${d.tareasSimilares} ${
        d.tareasSimilares === 1 ? "tarea similar completada" : "tareas similares completadas"
      }`,
    );
  } else {
    partes.push("sin historial previo en tareas parecidas");
  }

  const horas = (min: number) => (min / 60).toFixed(1).replace(".", ",").replace(",0", "");
  partes.push(`carga del día ${horas(d.cargaMin)} de ${horas(d.capacidadMin)} h`);

  for (const r of d.reglasAplicadas) {
    partes.push(`${r.peso > 0 ? "favorecido" : "penalizado"} por la regla "${r.enunciado}"`);
  }

  return `${partes.join(" · ")}.`;
}

// El nivel de una aptitud puntual, tal como entró al promedio.
function desgloseNivel(desglose: Desglose, aptitudId: string): string {
  const nivel = desglose.detalle.nivelesPorAptitud[aptitudId];
  return nivel ? `${nivel}/5` : "";
}
