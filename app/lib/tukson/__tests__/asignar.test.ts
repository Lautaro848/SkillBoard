import { describe, expect, it } from "vitest";
import { asignarLote, resumirReparto } from "~/lib/tukson/asignar";
import type { Candidato, TareaParaAsignar } from "~/lib/tukson/tipos";

const HOY = new Date("2026-08-22T12:00:00Z");

const empleado = (id: string, over: Partial<Candidato> = {}): Candidato => ({
  id,
  nombre: id.toUpperCase(),
  apellido: "Apellido",
  estado: "activo",
  departamentoId: null,
  puestoId: null,
  aptitudes: { hidraulica: 4 },
  certificadosVigentes: ["c-altura"],
  certificadosVencidos: {},
  historial: [],
  capacidadMin: 480,
  cargaMin: 0,
  ...over,
});

const tarea = (id: string, over: Partial<TareaParaAsignar> = {}): TareaParaAsignar => ({
  id,
  titulo: `Tarea ${id}`,
  prioridad: "media",
  duracionEstimadaMin: 120,
  aptitudesRequeridas: ["hidraulica"],
  certificadosRequeridos: [],
  departamentoSugeridoId: null,
  departamentoEsRequisito: false,
  ...over,
});

describe("reparto en cascada", () => {
  it("el mejor no se lleva todas las tareas del día", () => {
    // El mejor candidato en aptitud, contra uno apenas peor.
    const equipo = [
      empleado("bueno", { aptitudes: { hidraulica: 5 } }),
      empleado("normal", { aptitudes: { hidraulica: 4 } }),
    ];
    // Cuatro tareas de 2 h cada una: 8 h en total, una jornada completa.
    const tareas = [tarea("t1"), tarea("t2"), tarea("t3"), tarea("t4")];

    const resultados = asignarLote(tareas, equipo, [], HOY);
    const elegidos = resultados.map((r) => r.elegido?.candidato.id);

    expect(elegidos).toHaveLength(4);
    // Sin el componente de disponibilidad, "bueno" se llevaría las cuatro.
    expect(new Set(elegidos).size).toBeGreaterThan(1);
    expect(elegidos.filter((e) => e === "bueno").length).toBeLessThan(4);
  });

  it("las tareas críticas se asignan antes que las de baja prioridad", () => {
    const equipo = [empleado("unico")];
    const tareas = [
      tarea("baja", { prioridad: "baja" }),
      tarea("critica", { prioridad: "critica" }),
      tarea("media", { prioridad: "media" }),
    ];

    const orden = asignarLote(tareas, equipo, [], HOY).map((r) => r.tarea.id);
    expect(orden[0]).toBe("critica");
    expect(orden[orden.length - 1]).toBe("baja");
  });

  it("a igual prioridad, primero la tarea con menos candidatos", () => {
    const equipo = [
      empleado("especialista", { certificadosVigentes: ["c-altura", "c-electricista"] }),
      empleado("general", { certificadosVigentes: ["c-altura"] }),
    ];
    const tareas = [
      tarea("abierta"),
      tarea("restringida", { certificadosRequeridos: ["c-electricista"] }),
    ];

    const orden = asignarLote(tareas, equipo, [], HOY).map((r) => r.tarea.id);
    // La restringida tiene un solo candidato: si va segunda, corre riesgo de
    // que la abierta se lleve al único que puede hacerla.
    expect(orden[0]).toBe("restringida");
  });

  it("una tarea sin candidatos no rompe el resto del lote", () => {
    const equipo = [empleado("e1", { certificadosVigentes: [] })];
    const tareas = [tarea("imposible", { certificadosRequeridos: ["c-altura"] }), tarea("posible")];

    const resultados = asignarLote(tareas, equipo, [], HOY);
    const imposible = resultados.find((r) => r.tarea.id === "imposible")!;
    const posible = resultados.find((r) => r.tarea.id === "posible")!;

    expect(imposible.elegido).toBeNull();
    expect(imposible.descartes.length).toBeGreaterThan(0);
    expect(posible.elegido).not.toBeNull();
  });

  it("no modifica la carga de los empleados que recibió", () => {
    const equipo = [empleado("e1")];
    asignarLote([tarea("t1"), tarea("t2")], equipo, [], HOY);
    expect(equipo[0].cargaMin).toBe(0);
  });

  it("un lote vacío no explota", () => {
    expect(asignarLote([], [empleado("e1")], [], HOY)).toEqual([]);
  });
});

describe("resumirReparto", () => {
  it("cuenta tareas, personas y quién quedó más cargado", () => {
    const equipo = [empleado("a"), empleado("b")];
    const resultados = asignarLote([tarea("t1"), tarea("t2"), tarea("t3")], equipo, [], HOY);
    const resumen = resumirReparto(resultados);

    expect(resumen.tareasAsignadas).toBe(3);
    expect(resumen.tareasSinCandidatos).toBe(0);
    expect(resumen.personas).toBeGreaterThan(0);
    expect(resumen.cargaMaxima).not.toBeNull();
    expect(resumen.cargaMaxima!.minutos).toBeGreaterThan(0);
  });

  it("informa las tareas que quedaron sin nadie", () => {
    const equipo = [empleado("e1", { certificadosVigentes: [] })];
    const resultados = asignarLote([tarea("t1", { certificadosRequeridos: ["c-altura"] })], equipo, [], HOY);
    const resumen = resumirReparto(resultados);

    expect(resumen.tareasSinCandidatos).toBe(1);
    expect(resumen.cargaMaxima).toBeNull();
  });
});
