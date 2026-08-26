import { describe, expect, it } from "vitest";
import { filtrarCandidatos, motivoSinCandidatos } from "~/lib/tukson/filtro";
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
  aptitudes: { "a-hidraulica": 4 },
  certificadosVigentes: ["c-altura"],
  certificadosVencidos: {},
  historial: [],
  capacidadMin: 480,
  cargaMin: 0,
  asignacionesUltimos7Dias: 0,
  ...over,
});

const tarea = (over: Partial<TareaParaAsignar> = {}): TareaParaAsignar => ({
  id: "t1",
  titulo: "Reparar bomba hidráulica del sector 3",
  prioridad: "alta",
  duracionEstimadaMin: 180,
  aptitudesRequeridas: ["a-hidraulica"],
  certificadosRequeridos: ["c-altura"],
  departamentoSugeridoId: null,
  departamentoEsRequisito: false,
  ...over,
});

const nombreTipo = (id: string) => (id === "c-altura" ? "el carnet de trabajo en altura" : id);
const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

describe("filtro duro", () => {
  it("deja pasar a quien cumple todo", () => {
    const r = filtrarCandidatos([empleado()], tarea(), [], HOY);
    expect(r.candidatos).toHaveLength(1);
    expect(r.descartes).toHaveLength(0);
  });

  it("descarta a quien no está activo", () => {
    const r = filtrarCandidatos([empleado({ estado: "licencia" })], tarea(), [], HOY);
    expect(r.candidatos).toHaveLength(0);
    expect(r.descartes[0].motivo).toEqual({ clase: "no_activo", estado: "licencia" });
  });

  it("descarta a quien no tiene el certificado requerido", () => {
    const r = filtrarCandidatos([empleado({ certificadosVigentes: [] })], tarea(), [], HOY);
    expect(r.descartes[0].motivo).toEqual({ clase: "certificado_faltante", tipoId: "c-altura" });
  });

  it("un certificado vencido no es lo mismo que uno que falta", () => {
    const r = filtrarCandidatos(
      [empleado({ certificadosVigentes: [], certificadosVencidos: { "c-altura": "2026-07-12" } })],
      tarea(),
      [],
      HOY,
    );
    expect(r.descartes[0].motivo).toEqual({
      clase: "certificado_vencido",
      tipoId: "c-altura",
      vencioEl: "2026-07-12",
    });
  });

  it("una regla de exclusión activa saca al candidato", () => {
    const regla: Regla = {
      id: "r1",
      tipo: "exclusion",
      enunciado: "Juan Pérez no está disponible durante la parada de planta.",
      peso: -10,
      activa: true,
      condiciones: { empleadoId: "e1", vigenciaHasta: "2026-08-24" },
    };
    const r = filtrarCandidatos([empleado()], tarea(), [regla], HOY);
    expect(r.candidatos).toHaveLength(0);
    expect(r.descartes[0].motivo).toMatchObject({ clase: "regla", reglaId: "r1" });
  });

  it("una regla vencida deja de aplicarse sola", () => {
    const regla: Regla = {
      id: "r1",
      tipo: "exclusion",
      enunciado: "Durante la parada de planta.",
      peso: -10,
      activa: true,
      condiciones: { empleadoId: "e1", vigenciaHasta: "2026-08-01" },
    };
    expect(filtrarCandidatos([empleado()], tarea(), [regla], HOY).candidatos).toHaveLength(1);
  });

  it("una regla sin confirmar no hace nada", () => {
    const regla: Regla = {
      id: "r1",
      tipo: "exclusion",
      enunciado: "Propuesta todavía sin aprobar.",
      peso: -10,
      activa: false,
      condiciones: { empleadoId: "e1" },
    };
    expect(filtrarCandidatos([empleado()], tarea(), [regla], HOY).candidatos).toHaveLength(1);
  });

  it("el departamento descarta solo si es requisito", () => {
    const ajeno = empleado({ departamentoId: "d-produccion" });
    const blanda = tarea({ departamentoSugeridoId: "d-mant", departamentoEsRequisito: false });
    const dura = tarea({ departamentoSugeridoId: "d-mant", departamentoEsRequisito: true });

    expect(filtrarCandidatos([ajeno], blanda, [], HOY).candidatos).toHaveLength(1);
    expect(filtrarCandidatos([ajeno], dura, [], HOY).candidatos).toHaveLength(0);
  });
});

describe("motivoSinCandidatos", () => {
  it("dice qué falta y quién lo tenía vencido", () => {
    const { descartes } = filtrarCandidatos(
      [
        empleado({
          id: "e1",
          certificadosVigentes: [],
          certificadosVencidos: { "c-altura": "2026-07-12" },
        }),
        empleado({
          id: "e2",
          nombre: "Ana",
          apellido: "Díaz",
          certificadosVigentes: [],
          certificadosVencidos: { "c-altura": "2026-08-03" },
        }),
      ],
      tarea(),
      [],
      HOY,
    );

    expect(motivoSinCandidatos(descartes, nombreTipo, fecha)).toBe(
      "Ningún empleado activo tiene el carnet de trabajo en altura vigente. " +
        "2 empleados lo tienen vencido: Juan Pérez (venció el 12/07/2026) y Ana Díaz (venció el 03/08/2026).",
    );
  });

  it("distingue el que nunca lo cargó del que lo dejó vencer", () => {
    const { descartes } = filtrarCandidatos(
      [
        empleado({ id: "e1", certificadosVigentes: [], certificadosVencidos: { "c-altura": "2026-07-12" } }),
        empleado({ id: "e2", nombre: "Ana", apellido: "Díaz", certificadosVigentes: [] }),
      ],
      tarea(),
      [],
      HOY,
    );

    const texto = motivoSinCandidatos(descartes, nombreTipo, fecha);
    expect(texto).toContain("1 empleado lo tiene vencido: Juan Pérez (venció el 12/07/2026)");
    expect(texto).toContain("1 no lo tiene registrado");
  });

  it("cuando la culpa es de una regla, la nombra y dice dónde revisarla", () => {
    const regla: Regla = {
      id: "r1",
      tipo: "exclusion",
      enunciado: "Nadie de Mantenimiento en tareas del sector 3.",
      peso: -10,
      activa: true,
      condiciones: { departamentoId: "d-mant" },
    };
    const { descartes } = filtrarCandidatos([empleado()], tarea(), [regla], HOY);
    const texto = motivoSinCandidatos(descartes, nombreTipo, fecha);
    expect(texto).toContain("Nadie de Mantenimiento en tareas del sector 3.");
    expect(texto).toContain("Reglas de Tukson");
  });

  it("sin empleados cargados no culpa a un certificado", () => {
    expect(motivoSinCandidatos([], nombreTipo, fecha)).toContain("No hay empleados cargados");
  });
});
