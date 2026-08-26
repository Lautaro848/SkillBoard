import { describe, expect, it } from "vitest";
import { armarPrompt, contieneDatosPersonales, seudonimizar } from "~/lib/tukson/seudonimo";
import { validarRespuesta } from "~/lib/tukson/validacion";
import { puntuar } from "~/lib/tukson/puntaje";
import type { Postulante } from "~/lib/tukson/asignar";
import type { Candidato, TareaParaAsignar } from "~/lib/tukson/tipos";

const HOY = new Date("2026-08-22T12:00:00Z");

const tarea: TareaParaAsignar = {
  id: "t1",
  titulo: "Reparar bomba hidráulica del sector 3",
  prioridad: "alta",
  duracionEstimadaMin: 180,
  aptitudesRequeridas: ["a-hid", "a-mec"],
  certificadosRequeridos: ["c-altura"],
  departamentoSugeridoId: null,
  departamentoEsRequisito: false,
};

const empleado = (id: string, nombre: string, apellido: string, over: Partial<Candidato> = {}): Candidato => ({
  id,
  idInterno: id.toUpperCase(),
  nombre,
  apellido,
  estado: "activo",
  departamentoId: null,
  puestoId: null,
  aptitudes: { "a-hid": 4, "a-mec": 4 },
  certificadosVigentes: ["c-altura"],
  certificadosVencidos: {},
  historial: [{ aptitudes: ["a-hid"], completada: true }],
  capacidadMin: 480,
  cargaMin: 120,
  asignacionesUltimos7Dias: 0,
  ...over,
});

const postular = (c: Candidato): Postulante => ({ candidato: c, desglose: puntuar(c, tarea, [], HOY) });

const equipo = [
  postular(empleado("id-1", "Juan", "Pérez")),
  postular(empleado("id-2", "María", "Gómez", { aptitudes: { "a-hid": 3, "a-mec": 5 } })),
];

const nombreAptitud = (id: string) => ({ "a-hid": "hidráulica", "a-mec": "mecánica" })[id] ?? id;
const nombreCert = (id: string) => (id === "c-altura" ? "carnet de trabajo en altura" : id);

describe("seudonimización", () => {
  it("el prompt no contiene ningún nombre real", () => {
    const mapa = seudonimizar(equipo);
    const prompt = armarPrompt(tarea, equipo, mapa, nombreAptitud, nombreCert, []);

    expect(prompt).not.toContain("Juan");
    expect(prompt).not.toContain("Pérez");
    expect(prompt).not.toContain("María");
    expect(prompt).not.toContain("Gómez");
    expect(prompt).toContain("EMP-0001");
    expect(prompt).toContain("EMP-0002");
  });

  it("el seudónimo no se deriva del id real, así que no filtra nada", () => {
    const mapa = seudonimizar(equipo);
    const prompt = armarPrompt(tarea, equipo, mapa, nombreAptitud, nombreCert, []);
    expect(prompt).not.toContain("id-1");
    expect(prompt).not.toContain("id-2");
  });

  it("sí lleva lo que el modelo necesita para desempatar", () => {
    const mapa = seudonimizar(equipo);
    const prompt = armarPrompt(tarea, equipo, mapa, nombreAptitud, nombreCert, [
      "Las tareas del sector 3 requieren conocimiento previo del equipo instalado.",
    ]);

    expect(prompt).toContain("Reparar bomba hidráulica del sector 3");
    expect(prompt).toContain("hidráulica 4/5");
    expect(prompt).toContain("pts");
    expect(prompt).toContain("carga hoy 2/8 h");
    expect(prompt).toContain("REGLAS ACTIVAS DE LA EMPRESA");
  });

  it("la red de seguridad detecta un nombre si alguna vez se cuela", () => {
    const filtrado = armarPrompt(tarea, equipo, seudonimizar(equipo), nombreAptitud, nombreCert, []);
    expect(contieneDatosPersonales(filtrado, equipo)).toEqual([]);

    const roto = `${filtrado}\nObservación: Juan viene de la parada de planta.`;
    expect(contieneDatosPersonales(roto, equipo)).toContain("Juan");
  });
});

describe("validación de la salida del modelo", () => {
  const mapa = seudonimizar(equipo);
  const reserva = "Mayor coincidencia de aptitudes.";

  it("una elección válida se traduce al empleado real", () => {
    const r = validarRespuesta(
      { elegido: "EMP-0002", justificacion: "EMP-0002 tiene mejor nivel en mecánica." },
      equipo,
      mapa,
      reserva,
    );
    expect(r.empleadoId).toBe("id-2");
    expect(r.porReserva).toBe(false);
    // El usuario no tiene por qué ver EMP-0002 en pantalla.
    expect(r.justificacion).toBe("María Gómez tiene mejor nivel en mecánica.");
  });

  it("un identificador inventado se descarta y se asigna por puntaje", () => {
    const r = validarRespuesta(
      { elegido: "EMP-9999", justificacion: "Elijo a este." },
      equipo,
      mapa,
      reserva,
    );
    expect(r.empleadoId).toBe(equipo[0].candidato.id);
    expect(r.porReserva).toBe(true);
    expect(r.justificacion).toBe(reserva);
    expect(r.incidentes[0]).toEqual({ clase: "identificador_invalido", recibido: "EMP-9999" });
  });

  it("sin respuesta del modelo el sistema no se cae", () => {
    const r = validarRespuesta(null, equipo, mapa, reserva);
    expect(r.empleadoId).toBe(equipo[0].candidato.id);
    expect(r.porReserva).toBe(true);
    expect(r.incidentes[0]).toEqual({ clase: "sin_respuesta" });
  });

  it("una respuesta con forma inválida tampoco lo tumba", () => {
     
    const r = validarRespuesta({ elegido: 42, justificacion: null } as any, equipo, mapa, reserva);
    expect(r.porReserva).toBe(true);
    expect(r.incidentes[0].clase).toBe("formato_invalido");
  });

  it("si la justificación menciona a otro candidato se registra el incidente", () => {
    const r = validarRespuesta(
      { elegido: "EMP-0001", justificacion: "Mejor que EMP-0002 en historial." },
      equipo,
      mapa,
      reserva,
    );
    expect(r.empleadoId).toBe("id-1");
    expect(r.porReserva).toBe(false);
    expect(r.incidentes).toContainEqual({ clase: "justificacion_con_dato_ajeno", termino: "EMP-0002" });
  });
});
