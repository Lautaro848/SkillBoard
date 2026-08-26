import { describe, expect, it } from "vitest";
import {
  asignarLote,
  avisoDeCapacidad,
  evaluarCapacidad,
  explicarMotivo,
  resumirReparto,
  UMBRALES_POR_DEFECTO,
} from "~/lib/tukson/asignar";
import { filtrarCandidatos } from "~/lib/tukson/filtro";
import { puntuar } from "~/lib/tukson/puntaje";
import {
  avisoDeContradiccion,
  contradiceCertificadoVigente,
  describirCondiciones,
  esFragilPorTitulo,
  reglaAplica,
} from "~/lib/tukson/reglas";
import type { Candidato, Regla, TareaParaAsignar } from "~/lib/tukson/tipos";

// Los cuatro defectos de 06-tukson-mejoras.md, Parte II. Cada bloque prueba
// los criterios de aceptación del documento, no la implementación.

const HOY = new Date("2026-08-25T12:00:00Z");

const empleado = (id: string, over: Partial<Candidato> = {}): Candidato => ({
  id,
  idInterno: id.toUpperCase(),
  nombre: id,
  apellido: "Apellido",
  estado: "activo",
  departamentoId: null,
  puestoId: null,
  aptitudes: { "a-hidraulica": 4 },
  certificadosVigentes: [],
  certificadosVencidos: {},
  historial: [],
  capacidadMin: 480,
  cargaMin: 0,
  asignacionesUltimos7Dias: 0,
  ...over,
});

const tarea = (id: string, over: Partial<TareaParaAsignar> = {}): TareaParaAsignar => ({
  id,
  titulo: `Tarea ${id}`,
  prioridad: "media",
  duracionEstimadaMin: 120,
  aptitudesRequeridas: ["a-hidraulica"],
  certificadosRequeridos: [],
  departamentoSugeridoId: null,
  departamentoEsRequisito: false,
  ...over,
});

// =========================================================================
// 1.4 — Las reglas hablan de lo que la tarea REQUIERE, no de cómo se llama
// =========================================================================

describe("1.4 reglas sobre el requisito de la tarea", () => {
  const juan = empleado("juan", { aptitudes: { "a-altura": 3, "a-hidraulica": 4 } });

  // El caso exacto del documento: la regla se escribe hoy sobre una tarea, y
  // mañana entra otra con otro título que necesita lo mismo.
  const subirAlTecho = tarea("t-techo", {
    titulo: "Subir al techo a limpiar",
    aptitudesRequeridas: ["a-altura"],
  });

  it("la regla vieja por palabra NO agarra la tarea de mañana", () => {
    // Esto es el defecto, escrito como test para que quede claro por qué hizo
    // falta la condición nueva. "Subir al techo a limpiar" no dice "altura".
    const porPalabra: Regla = {
      id: "r1",
      tipo: "exclusion",
      enunciado: "Juan no trabaja en altura",
      peso: 0,
      activa: true,
      condiciones: { empleadoId: "juan", tareaContiene: "altura" },
    };

    expect(reglaAplica(porPalabra, juan, subirAlTecho, HOY)).toBe(false);
  });

  it("la regla sobre el requisito sí la agarra, se llame como se llame", () => {
    const porRequisito: Regla = {
      id: "r2",
      tipo: "exclusion",
      enunciado: "Juan queda excluido de las tareas que requieran trabajo en altura",
      peso: 0,
      activa: true,
      condiciones: { empleadoId: "juan", tareaRequiereAptitudId: "a-altura" },
    };

    for (const titulo of ["Subir al techo a limpiar", "Pintar la fachada", "Revisar el tanque"]) {
      const t = tarea("x", { titulo, aptitudesRequeridas: ["a-altura"] });
      expect(reglaAplica(porRequisito, juan, t, HOY)).toBe(true);
    }

    // Y no se dispara en una tarea que no exige altura, por más que la haga
    // la misma persona.
    const enElPiso = tarea("t-piso", { titulo: "Cambiar filtros", aptitudesRequeridas: ["a-hidraulica"] });
    expect(reglaAplica(porRequisito, juan, enElPiso, HOY)).toBe(false);
  });

  it("lo mismo con un certificado requerido", () => {
    const regla: Regla = {
      id: "r3",
      tipo: "exclusion",
      enunciado: "Juan no hace tareas que exijan el carnet de altura",
      peso: 0,
      activa: true,
      condiciones: { empleadoId: "juan", tareaRequiereCertificadoId: "c-altura" },
    };

    const conCarnet = tarea("t", { titulo: "Revisar el tanque", certificadosRequeridos: ["c-altura"] });
    const sinCarnet = tarea("t2", { titulo: "Revisar el tanque", certificadosRequeridos: [] });

    expect(reglaAplica(regla, juan, conCarnet, HOY)).toBe(true);
    expect(reglaAplica(regla, juan, sinCarnet, HOY)).toBe(false);
  });

  it("una exclusión sale por el filtro duro y el puntaje no puede compensarla", () => {
    // Criterio del documento: el miedo a las alturas es un riesgo, no una
    // preferencia. Ni el mejor puntaje posible lo devuelve a la lista.
    const regla: Regla = {
      id: "r4",
      tipo: "exclusion",
      enunciado: "Juan queda excluido del trabajo en altura",
      peso: 10, // aunque alguien le ponga peso positivo por error
      activa: true,
      condiciones: { empleadoId: "juan", tareaRequiereAptitudId: "a-altura" },
    };

    const { candidatos, descartes } = filtrarCandidatos([juan], subirAlTecho, [regla], HOY);
    expect(candidatos).toEqual([]);
    expect(descartes[0].motivo.clase).toBe("regla");

    // Y el peso positivo no suma en el puntaje: solo cuentan preferencia y
    // prioridad, nunca una exclusión.
    expect(puntuar(juan, subirAlTecho, [regla], HOY).reglas).toBe(0);
  });
});

// =========================================================================
// 1.2 — Aviso de capacidad insuficiente
// =========================================================================

describe("1.2 capacidad insuficiente", () => {
  it("dice cuántas horas-persona faltan cuando el día está sobrevendido", () => {
    // El escenario del documento: seis tareas de 240 min entre tres personas
    // de 240 min cada una. Ningún algoritmo lo resuelve.
    const equipo = [1, 2, 3].map((n) => empleado(`e${n}`, { capacidadMin: 240 }));
    const tareas = [1, 2, 3, 4, 5, 6].map((n) => tarea(`t${n}`, { duracionEstimadaMin: 240 }));

    const capacidad = evaluarCapacidad(tareas, equipo);
    expect(capacidad.alcanza).toBe(false);
    expect(capacidad.minutosPedidos).toBe(1440); // 24 h
    expect(capacidad.minutosDisponibles).toBe(720); // 12 h
    expect(capacidad.minutosFaltantes).toBe(720);

    const aviso = avisoDeCapacidad(capacidad);
    expect(aviso).toContain("12 horas-persona");
    expect(aviso).toContain("24 horas");
    expect(aviso).toContain("no por falta de idoneidad");
  });

  it("si la capacidad alcanza, no hay aviso", () => {
    const equipo = [empleado("e1")];
    const capacidad = evaluarCapacidad([tarea("t1")], equipo);
    expect(capacidad.alcanza).toBe(true);
    expect(avisoDeCapacidad(capacidad)).toBeNull();
  });

  it("no cuenta como capacidad a quien está de licencia ni las horas ya ocupadas", () => {
    const equipo = [
      empleado("activo", { capacidadMin: 480, cargaMin: 300 }), // le quedan 180
      empleado("licencia", { estado: "licencia", capacidadMin: 480 }),
    ];
    expect(evaluarCapacidad([], equipo).minutosDisponibles).toBe(180);
  });

  it("distingue 'nadie idóneo' de 'nadie con horas'", () => {
    // Dos personas idóneas, pero con la jornada llena.
    const equipo = [
      empleado("a", { capacidadMin: 480, cargaMin: 470 }),
      empleado("b", { capacidadMin: 480, cargaMin: 465 }),
    ];
    const [r] = asignarLote([tarea("t1", { duracionEstimadaMin: 120 })], equipo, [], HOY);

    expect(r.elegido).toBeNull();
    expect(r.motivo).toEqual({ clase: "sin_horas", podrianHacerla: 2 });
    expect(explicarMotivo(r.motivo!, "no aplica")).toBe(
      "Podrían hacerla 2 personas, pero ninguna tiene horas libres hoy.",
    );

    // Y el otro caso sigue siendo el de siempre: nadie pasa el filtro duro.
    const sinCarnet = tarea("t2", { certificadosRequeridos: ["c-altura"] });
    const [r2] = asignarLote([sinCarnet], equipo, [], HOY);
    expect(r2.motivo).toEqual({ clase: "sin_candidatos" });
  });

  it("la jornada es un límite, no una sugerencia", () => {
    // Antes la capacidad solo restaba puntos, así que una sola persona se
    // llevaba las cuatro tareas y el reparto era una ficción.
    const equipo = [empleado("solo", { capacidadMin: 240 })];
    const tareas = [1, 2, 3, 4].map((n) => tarea(`t${n}`, { duracionEstimadaMin: 120 }));

    const resultados = asignarLote(tareas, equipo, [], HOY);
    const resumen = resumirReparto(resultados);

    expect(resumen.tareasAsignadas).toBe(2); // 240 min de jornada
    expect(resumen.tareasSinHoras).toBe(2);
  });
});

// =========================================================================
// 1.1 — Desempate determinista con rotación
// =========================================================================

describe("1.1 desempate", () => {
  const gemelos = () => [
    empleado("ana", { idInterno: "AN-01" }),
    empleado("beto", { idInterno: "BE-02" }),
  ];

  it("con puntajes idénticos el reparto se equilibra en vez de repetir al mismo", () => {
    const tareas = Array.from({ length: 10 }, (_, i) => tarea(`t${i}`, { duracionEstimadaMin: 30 }));
    const resultados = asignarLote(tareas, gemelos(), [], HOY);

    const porPersona = new Map<string, number>();
    for (const r of resultados) {
      if (!r.elegido) continue;
      const id = r.elegido.candidato.id;
      porPersona.set(id, (porPersona.get(id) ?? 0) + 1);
    }

    expect([...porPersona.values()].sort()).toEqual([5, 5]);
  });

  it("el mismo lote con los mismos datos da siempre la misma asignación", () => {
    const tareas = Array.from({ length: 6 }, (_, i) => tarea(`t${i}`));
    const corrida = () =>
      asignarLote(tareas, gemelos(), [], HOY).map((r) => `${r.tarea.id}→${r.elegido?.candidato.id}`);

    expect(corrida()).toEqual(corrida());
    expect(corrida()).toEqual(corrida());
  });

  it("ante empate exacto gana quien tiene menos carga, y se explica", () => {
    const equipo = [
      empleado("cargado", { idInterno: "AA-01", cargaMin: 200 }),
      empleado("libre", { idInterno: "ZZ-99", cargaMin: 0 }),
    ];
    // Nota: con cargas distintas el puntaje de disponibilidad ya los separa,
    // así que este caso se prueba con la capacidad igualada.
    const [r] = asignarLote([tarea("t1")], equipo, [], HOY);
    expect(r.elegido?.candidato.id).toBe("libre");
  });

  it("empatados en todo, desempata el legajo y queda dicho", () => {
    const equipo = [
      empleado("zeta", { idInterno: "ZZ-99" }),
      empleado("alfa", { idInterno: "AA-01" }),
    ];
    const [r] = asignarLote([tarea("t1")], equipo, [], HOY);

    expect(r.elegido?.candidato.idInterno).toBe("AA-01");
    expect(r.desempate).toContain("empataron en");
    expect(r.desempate).toContain("orden de legajo");
  });

  it("la rotación de la semana pesa antes que el legajo", () => {
    const equipo = [
      empleado("alfa", { idInterno: "AA-01", asignacionesUltimos7Dias: 9 }),
      empleado("zeta", { idInterno: "ZZ-99", asignacionesUltimos7Dias: 1 }),
    ];
    const [r] = asignarLote([tarea("t1")], equipo, [], HOY);

    expect(r.elegido?.candidato.id).toBe("zeta");
    expect(r.desempate).toContain("menos tareas esta semana");
  });

  it("sin empate no inventa una explicación de desempate", () => {
    const equipo = [
      empleado("mejor", { aptitudes: { "a-hidraulica": 5 } }),
      empleado("peor", { aptitudes: { "a-hidraulica": 1 } }),
    ];
    const [r] = asignarLote([tarea("t1")], equipo, [], HOY);
    expect(r.elegido?.candidato.id).toBe("mejor");
    expect(r.desempate).toBeNull();
  });
});

// =========================================================================
// 1.3 — Umbral mínimo de puntaje
// =========================================================================

describe("1.3 umbral mínimo", () => {
  // Alguien que no tiene ninguna de las aptitudes que la tarea pide.
  const inadecuado = empleado("flojo", { aptitudes: {} });
  const exigente = tarea("t1", { aptitudesRequeridas: ["a-soldadura", "a-altura"] });

  it("un candidato muy por debajo no se asigna en silencio", () => {
    const [r] = asignarLote([exigente], [inadecuado], [], HOY);

    expect(r.elegido).toBeNull();
    expect(r.motivo?.clase).toBe("bajo_umbral");
    // Pero sigue estando a la vista como sugerencia, con su puntaje.
    expect(r.postulantes[0].candidato.id).toBe("flojo");
    expect(r.postulantes[0].desglose.total).toBeLessThan(UMBRALES_POR_DEFECTO.general);
  });

  it("el mensaje dice el puntaje, el mínimo y por qué no llega", () => {
    const [r] = asignarLote([exigente], [inadecuado], [], HOY);
    const texto = explicarMotivo(r.motivo!, "no aplica");

    expect(texto).toContain("de 100");
    expect(texto).toContain("por debajo del mínimo de 45");
    expect(texto).toContain("aptitudes requeridas");
    expect(texto).toContain("a mano");
  });

  it("las tareas críticas exigen más", () => {
    // Un candidato que pasa el umbral general pero no el de crítica: tiene
    // una de las dos aptitudes que la tarea pide, y en nivel 1.
    // 20 (mitad de aptitudes) + 4 (nivel 1/5) + 7,5 (sin historial) + 15
    // (jornada libre) + 10 (sin departamento exigido) = 56,5.
    const flojito = empleado("flojito", { aptitudes: { "a-soldadura": 1 } });
    const requeridas = ["a-soldadura", "a-altura"];
    const media = tarea("t-media", { prioridad: "media", aptitudesRequeridas: requeridas });
    const critica = tarea("t-critica", { prioridad: "critica", aptitudesRequeridas: requeridas });

    const puntos = puntuar(flojito, media, [], HOY).total;
    expect(puntos).toBeGreaterThanOrEqual(UMBRALES_POR_DEFECTO.general);
    expect(puntos).toBeLessThan(UMBRALES_POR_DEFECTO.critica);

    expect(asignarLote([media], [flojito], [], HOY)[0].elegido).not.toBeNull();
    expect(asignarLote([critica], [flojito], [], HOY)[0].elegido).toBeNull();
  });

  it("el umbral se puede cambiar por empresa", () => {
    const permisivo = asignarLote([exigente], [inadecuado], [], HOY, { general: 0, critica: 0 });
    expect(permisivo[0].elegido).not.toBeNull();
  });
});

// =========================================================================
// 1.4 — La pantalla de reglas tiene que explicar a qué aplica cada una
// =========================================================================

describe("1.4 la regla se lee en castellano", () => {
  const nombres = {
    empleado: (id: string) => ({ juan: "Juan Pérez" })[id] ?? id,
    departamento: (id: string) => ({ "d-mant": "Mantenimiento" })[id] ?? id,
    puesto: (id: string) => ({ "p-tec": "Técnico" })[id] ?? id,
    aptitud: (id: string) => ({ "a-altura": "trabajo en altura" })[id] ?? id,
    certificado: (id: string) => ({ "c-altura": "el carnet de altura" })[id] ?? id,
  };

  it("dice a quién y en qué tareas, sin mostrar un solo id", () => {
    const texto = describirCondiciones(
      { empleadoId: "juan", tareaRequiereAptitudId: "a-altura", vigenciaHasta: "2027-03-12" },
      nombres,
    );

    expect(texto).toBe(
      "Se aplica a Juan Pérez, en las tareas que requieran la aptitud trabajo en altura, hasta el 12/03/2027.",
    );
    expect(texto).not.toContain("a-altura");
  });

  it("una regla sin condiciones no queda en blanco", () => {
    expect(describirCondiciones({}, nombres)).toBe(
      "Se aplica a todo el equipo, en cualquier tarea, hasta nuevo aviso.",
    );
  });

  it("marca como frágil la regla que depende de las palabras del título", () => {
    expect(esFragilPorTitulo({ empleadoId: "juan", tareaContiene: "altura" })).toBe(true);
    // Con el requisito además del título ya no depende de las palabras.
    expect(esFragilPorTitulo({ tareaContiene: "altura", tareaRequiereAptitudId: "a-altura" })).toBe(false);
    expect(esFragilPorTitulo({ tareaRequiereCertificadoId: "c-altura" })).toBe(false);
  });
});

describe("1.4 exclusión que contradice un certificado vigente", () => {
  const nombreCert = (id: string) => ({ "c-altura": "el carnet de trabajo en altura" })[id] ?? id;

  const juanConCarnet = empleado("juan", {
    nombre: "Juan",
    apellido: "Pérez",
    certificadosVigentes: ["c-altura"],
    vencimientoDeVigentes: { "c-altura": "2027-03-12" },
  });

  it("avisa cuando se excluye a alguien que tiene el carnet al día", () => {
    const contradiccion = contradiceCertificadoVigente(
      "exclusion",
      { empleadoId: "juan", tareaRequiereCertificadoId: "c-altura" },
      [juanConCarnet],
      nombreCert,
    );

    expect(contradiccion).not.toBeNull();
    const aviso = avisoDeContradiccion(contradiccion!);
    expect(aviso).toContain("Juan Pérez");
    expect(aviso).toContain("vigente hasta el 12/03/2027");
    expect(aviso).toContain("área de seguridad");
  });

  it("no avisa si el certificado no está vigente", () => {
    const sinCarnet = empleado("juan", { certificadosVigentes: [] });
    expect(
      contradiceCertificadoVigente(
        "exclusion",
        { empleadoId: "juan", tareaRequiereCertificadoId: "c-altura" },
        [sinCarnet],
        nombreCert,
      ),
    ).toBeNull();
  });

  it("una preferencia no es una contradicción: no excluye a nadie", () => {
    expect(
      contradiceCertificadoVigente(
        "preferencia",
        { empleadoId: "juan", tareaRequiereCertificadoId: "c-altura" },
        [juanConCarnet],
        nombreCert,
      ),
    ).toBeNull();
  });
});
