import { describe, expect, it } from "vitest";
import { puntuar, TOPES } from "~/lib/tukson/puntaje";
import type { Candidato, Regla, TareaParaAsignar } from "~/lib/tukson/tipos";

const HOY = new Date("2026-08-22T12:00:00Z");

const empleado = (over: Partial<Candidato> = {}): Candidato => ({
  id: "e1",
  idInterno: "E1",
  nombre: "Juan",
  apellido: "Pérez",
  estado: "activo",
  departamentoId: "d-mant",
  puestoId: "p-tec",
  aptitudes: { hidraulica: 4, mecanica: 4 },
  certificadosVigentes: [],
  certificadosVencidos: {},
  historial: [],
  capacidadMin: 480,
  cargaMin: 0,
  asignacionesUltimos7Dias: 0,
  ...over,
});

const tarea = (over: Partial<TareaParaAsignar> = {}): TareaParaAsignar => ({
  id: "t1",
  titulo: "Reparar bomba",
  prioridad: "alta",
  duracionEstimadaMin: 180,
  aptitudesRequeridas: ["hidraulica", "mecanica"],
  certificadosRequeridos: [],
  departamentoSugeridoId: null,
  departamentoEsRequisito: false,
  ...over,
});

describe("componente de aptitudes", () => {
  it("tenerlas todas da el puntaje completo", () => {
    expect(puntuar(empleado(), tarea(), [], HOY).aptitudes).toBe(TOPES.aptitudes);
  });

  it("tener la mitad da la mitad", () => {
    expect(puntuar(empleado({ aptitudes: { hidraulica: 3 } }), tarea(), [], HOY).aptitudes).toBe(20);
  });

  it("una tarea sin aptitudes declaradas no discrimina por aptitud", () => {
    const r = puntuar(empleado({ aptitudes: {} }), tarea({ aptitudesRequeridas: [] }), [], HOY);
    expect(r.aptitudes).toBe(TOPES.aptitudes);
    expect(r.nivel).toBe(TOPES.nivel);
  });
});

describe("componente de nivel", () => {
  it("nivel máximo da el componente completo", () => {
    const r = puntuar(empleado({ aptitudes: { hidraulica: 5, mecanica: 5 } }), tarea(), [], HOY);
    expect(r.nivel).toBe(TOPES.nivel);
  });

  it("nivel 1 no da cero: sabe algo, no es un segundo filtro", () => {
    const r = puntuar(empleado({ aptitudes: { hidraulica: 1, mecanica: 1 } }), tarea(), [], HOY);
    expect(r.nivel).toBeGreaterThan(0);
    expect(r.nivel).toBe(4);
  });

  it("promedia solo las aptitudes que la tarea pide", () => {
    const r = puntuar(
      empleado({ aptitudes: { hidraulica: 4, mecanica: 2, soldadura: 5 } }),
      tarea(),
      [],
      HOY,
    );
    expect(r.detalle.nivelPromedio).toBe(3);
  });
});

describe("componente de historial", () => {
  it("sin historial vale la mitad, no cero", () => {
    expect(puntuar(empleado(), tarea(), [], HOY).historial).toBe(TOPES.historial / 2);
  });

  it("todas completadas da el componente entero", () => {
    const h = [
      { aptitudes: ["hidraulica"], completada: true },
      { aptitudes: ["hidraulica"], completada: true },
    ];
    expect(puntuar(empleado({ historial: h }), tarea(), [], HOY).historial).toBe(TOPES.historial);
  });

  it("solo cuentan las tareas que comparten alguna aptitud", () => {
    const h = [
      { aptitudes: ["pintura"], completada: false },
      { aptitudes: ["pintura"], completada: false },
    ];
    // Ninguna comparte aptitud con la tarea, así que sigue siendo neutro.
    expect(puntuar(empleado({ historial: h }), tarea(), [], HOY).historial).toBe(TOPES.historial / 2);
  });
});

describe("componente de disponibilidad", () => {
  it("sin carga da el componente completo", () => {
    expect(puntuar(empleado(), tarea(), [], HOY).disponibilidad).toBe(TOPES.disponibilidad);
  });

  it("a media jornada da la mitad", () => {
    expect(puntuar(empleado({ cargaMin: 240 }), tarea(), [], HOY).disponibilidad).toBe(7.5);
  });

  it("pasado de carga no da negativo", () => {
    expect(puntuar(empleado({ cargaMin: 900 }), tarea(), [], HOY).disponibilidad).toBe(0);
  });
});

describe("componente de departamento", () => {
  it("sin departamento sugerido no penaliza a nadie", () => {
    expect(puntuar(empleado({ departamentoId: null }), tarea(), [], HOY).departamento).toBe(
      TOPES.departamento,
    );
  });

  it("coincidir da el componente entero", () => {
    const t = tarea({ departamentoSugeridoId: "d-mant" });
    expect(puntuar(empleado(), t, [], HOY).departamento).toBe(TOPES.departamento);
  });

  it("pertenecer a otro departamento da cero", () => {
    const t = tarea({ departamentoSugeridoId: "d-mant" });
    expect(puntuar(empleado({ departamentoId: "d-prod" }), t, [], HOY).departamento).toBe(0);
  });

  it("no tener departamento cargado vale más que tener el equivocado", () => {
    const t = tarea({ departamentoSugeridoId: "d-mant" });
    const sinDato = puntuar(empleado({ departamentoId: null }), t, [], HOY).departamento;
    const equivocado = puntuar(empleado({ departamentoId: "d-prod" }), t, [], HOY).departamento;
    expect(sinDato).toBeGreaterThan(equivocado);
  });
});

describe("componente de reglas", () => {
  const preferencia = (peso: number): Regla => ({
    id: `r${peso}`,
    tipo: "preferencia",
    enunciado: "Preferencia de prueba",
    peso,
    activa: true,
    condiciones: { empleadoId: "e1" },
  });

  it("suma los pesos de las que aplican", () => {
    expect(puntuar(empleado(), tarea(), [preferencia(5)], HOY).reglas).toBe(5);
  });

  it("se topea en ±10 aunque haya muchas", () => {
    const muchas = [preferencia(8), { ...preferencia(9), id: "r9" }];
    expect(puntuar(empleado(), tarea(), muchas, HOY).reglas).toBe(10);
  });

  it("las de exclusión no suman acá: ya actuaron en el filtro duro", () => {
    const exclusion: Regla = { ...preferencia(-10), id: "rx", tipo: "exclusion" };
    expect(puntuar(empleado(), tarea(), [exclusion], HOY).reglas).toBe(0);
  });
});

describe("total", () => {
  it("el mejor caso posible da 100", () => {
    const perfecto = empleado({
      aptitudes: { hidraulica: 5, mecanica: 5 },
      historial: [{ aptitudes: ["hidraulica"], completada: true }],
      cargaMin: 0,
    });
    const t = tarea({ departamentoSugeridoId: "d-mant" });
    expect(puntuar(perfecto, t, [], HOY).total).toBe(100);
  });

  it("nunca es negativo aunque las reglas resten", () => {
    const malo = empleado({ aptitudes: {}, cargaMin: 480, departamentoId: "d-otro" });
    const t = tarea({ departamentoSugeridoId: "d-mant" });
    const castigo: Regla = {
      id: "r1",
      tipo: "preferencia",
      enunciado: "Penalización",
      peso: -10,
      activa: true,
      condiciones: {},
    };
    expect(puntuar(malo, t, [castigo], HOY).total).toBeGreaterThanOrEqual(0);
  });

  it("es reproducible: los mismos datos dan el mismo número", () => {
    const a = puntuar(empleado(), tarea(), [], HOY);
    const b = puntuar(empleado(), tarea(), [], HOY);
    expect(a.total).toBe(b.total);
  });
});
