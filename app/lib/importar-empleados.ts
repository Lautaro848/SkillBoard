import { empleadoSchema } from "~/lib/validation/empleados";

export interface ColumnaImportacion {
  clave: string;
  etiqueta: string;
  requerido: boolean;
  sinonimos: string[];
}

// El orden es el de la plantilla descargable y el de las columnas de la
// previsualización (03-modulos-y-alcance.md §Importación masiva).
export const COLUMNAS: ColumnaImportacion[] = [
  { clave: "idInterno", etiqueta: "ID interno", requerido: true, sinonimos: ["id interno", "legajo", "id"] },
  { clave: "nombre", etiqueta: "Nombre", requerido: true, sinonimos: ["nombre", "nombres"] },
  { clave: "apellido", etiqueta: "Apellido", requerido: true, sinonimos: ["apellido", "apellidos"] },
  { clave: "email", etiqueta: "Email", requerido: false, sinonimos: ["email", "correo", "mail"] },
  { clave: "telefono", etiqueta: "Teléfono", requerido: false, sinonimos: ["telefono", "teléfono", "celular"] },
  { clave: "fechaNacimiento", etiqueta: "Fecha de nacimiento", requerido: true, sinonimos: ["fecha de nacimiento", "nacimiento"] },
  { clave: "fechaIngreso", etiqueta: "Fecha de ingreso", requerido: true, sinonimos: ["fecha de ingreso", "ingreso"] },
  { clave: "puesto", etiqueta: "Puesto", requerido: true, sinonimos: ["puesto", "cargo"] },
  { clave: "departamento", etiqueta: "Departamento", requerido: true, sinonimos: ["departamento", "área", "area", "sector"] },
  { clave: "estado", etiqueta: "Estado", requerido: false, sinonimos: ["estado"] },
  { clave: "observaciones", etiqueta: "Observaciones", requerido: false, sinonimos: ["observaciones", "notas"] },
];

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type Mapeo = Record<string, string | null>; // clave de columna -> encabezado del archivo

// Propone la correspondencia automática ("Apellido y Nombre" → Apellido,
// Nombre queda para una corrección manual: si un encabezado combina dos
// campos, esta primera versión no lo separa sola, el usuario lo corrige en
// el paso de mapeo con los desplegables).
export function proponerMapeo(encabezados: string[]): Mapeo {
  const mapeo: Mapeo = {};
  for (const columna of COLUMNAS) {
    const encontrado = encabezados.find((h) => {
      const hNorm = normalizar(h);
      return columna.sinonimos.some((s) => normalizar(s) === hNorm);
    });
    mapeo[columna.clave] = encontrado ?? null;
  }
  return mapeo;
}

// Los puestos y departamentos que el archivo menciona y la empresa no tiene.
//
// Se calcula sobre las filas crudas y no leyendo los mensajes de error,
// porque un texto de error es para una persona, no para que otro código lo
// interprete. Devuelve los nombres tal como los escribió el archivo, sin
// repetir: si veinte filas dicen "Producción", se crea un departamento.
export interface CatalogosFaltantes {
  puestos: string[];
  departamentos: string[];
}

export function catalogosFaltantes(
  filasCrudas: Record<string, string>[],
  mapeo: Mapeo,
  catalogos: Pick<CatalogosImportacion, "puestos" | "departamentos">,
): CatalogosFaltantes {
  const conocidos = (lista: { nombre: string }[]) => new Set(lista.map((x) => normalizar(x.nombre)));
  const puestosConocidos = conocidos(catalogos.puestos);
  const departamentosConocidos = conocidos(catalogos.departamentos);

  const juntar = (clave: string, conocidos: Set<string>) => {
    const vistos = new Map<string, string>(); // normalizado -> como lo escribió el archivo
    for (const fila of filasCrudas) {
      const encabezado = mapeo[clave];
      const nombre = encabezado ? (fila[encabezado] ?? "").toString().trim() : "";
      if (!nombre) continue;
      const norm = normalizar(nombre);
      if (conocidos.has(norm) || vistos.has(norm)) continue;
      vistos.set(norm, nombre);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es-AR"));
  };

  return {
    puestos: juntar("puesto", puestosConocidos),
    departamentos: juntar("departamento", departamentosConocidos),
  };
}

export interface DatosEmpleadoResueltos {
  idInterno: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
  fechaIngreso: string;
  puestoId: string;
  departamentoId: string;
  estado: string;
  observaciones: string;
}

export interface FilaImportacion {
  fila: number; // el número de fila tal cual el usuario lo ve en su planilla
  valores: Record<string, string>; // para mostrar en la previsualización y el reporte de errores
  datosParaGuardar: DatosEmpleadoResueltos | null; // solo si empresaListaParaImportar
  erroresPorCampo: Record<string, string>;
  erroresGenerales: string[];
  idInternoResuelto: string | null;
  empresaListaParaImportar: boolean;
}

export interface CatalogosImportacion {
  puestos: { id: string; nombre: string }[];
  departamentos: { id: string; nombre: string }[];
  idsExistentes: Set<string>; // id_interno ya usados en la empresa
}

const ESTADOS_VALIDOS = new Set(["activo", "licencia", "baja"]);

export function validarFilas(
  filasCrudas: Record<string, string>[],
  mapeo: Mapeo,
  catalogos: CatalogosImportacion,
  // En qué fila de la planilla estaba cada dato. Lo calcula el lector, que es
  // el único que sabe si el archivo traía un título arriba o filas en blanco
  // en el medio. Sin esto el reporte de errores manda a la fila equivocada.
  numerosDeFila?: number[],
): FilaImportacion[] {
  const puestosPorNombre = new Map(catalogos.puestos.map((p) => [normalizar(p.nombre), p.id]));
  const departamentosPorNombre = new Map(catalogos.departamentos.map((d) => [normalizar(d.nombre), d.id]));
  const idsVistosEnArchivo = new Map<string, number>(); // id_interno normalizado -> primera fila donde aparece

  return filasCrudas.map((filaCruda, index) => {
    // El respaldo supone encabezados en la fila 1: +1 por 0-index, +1 por ellos.
    const numeroFila = numerosDeFila?.[index] ?? index + 2;
    const valorDe = (clave: string) => {
      const encabezado = mapeo[clave];
      return encabezado ? (filaCruda[encabezado] ?? "").toString().trim() : "";
    };

    const erroresPorCampo: Record<string, string> = {};
    const erroresGenerales: string[] = [];

    const puestoNombre = valorDe("puesto");
    const departamentoNombre = valorDe("departamento");
    const puestoId = puestosPorNombre.get(normalizar(puestoNombre));
    const departamentoId = departamentosPorNombre.get(normalizar(departamentoNombre));
    if (!puestoNombre) erroresPorCampo.puesto = "El puesto es obligatorio.";
    else if (!puestoId) erroresPorCampo.puesto = `El puesto "${puestoNombre}" no existe en los catálogos de la empresa.`;
    if (!departamentoNombre) erroresPorCampo.departamento = "El departamento es obligatorio.";
    else if (!departamentoId) {
      erroresPorCampo.departamento = `El departamento "${departamentoNombre}" no existe en los catálogos de la empresa.`;
    }

    const estadoCrudo = normalizar(valorDe("estado") || "activo");
    const estado = ESTADOS_VALIDOS.has(estadoCrudo) ? estadoCrudo : "activo";

    const mostrar = {
      idInterno: valorDe("idInterno"),
      nombre: valorDe("nombre"),
      apellido: valorDe("apellido"),
      email: valorDe("email"),
      telefono: valorDe("telefono"),
      fechaNacimiento: valorDe("fechaNacimiento"),
      fechaIngreso: valorDe("fechaIngreso"),
      puesto: puestoNombre,
      departamento: departamentoNombre,
      estado,
      observaciones: valorDe("observaciones"),
    };

    const raw = {
      ...mostrar,
      puestoId: puestoId ?? "00000000-0000-0000-0000-000000000000",
      departamentoId: departamentoId ?? "00000000-0000-0000-0000-000000000000",
    };

    const parsed = empleadoSchema.safeParse(raw);
    if (!parsed.success) {
      for (const [campo, mensajes] of Object.entries(parsed.error.flatten().fieldErrors)) {
        if (campo === "puestoId" || campo === "departamentoId") continue; // ya cubierto arriba con el nombre
        if (mensajes?.[0]) erroresPorCampo[campo] = mensajes[0];
      }
    }

    const idInternoNormalizado = raw.idInterno.toUpperCase();
    if (idInternoNormalizado) {
      if (catalogos.idsExistentes.has(idInternoNormalizado)) {
        erroresPorCampo.idInterno = `El ID interno ${idInternoNormalizado} ya está en uso en la empresa.`;
      } else if (idsVistosEnArchivo.has(idInternoNormalizado)) {
        erroresGenerales.push(`ID interno duplicado dentro del archivo: también aparece en la fila ${idsVistosEnArchivo.get(idInternoNormalizado)}.`);
      } else {
        idsVistosEnArchivo.set(idInternoNormalizado, numeroFila);
      }
    }

    const empresaListaParaImportar = Object.keys(erroresPorCampo).length === 0 && erroresGenerales.length === 0;

    return {
      fila: numeroFila,
      valores: mostrar,
      datosParaGuardar: empresaListaParaImportar ? raw : null,
      erroresPorCampo,
      erroresGenerales,
      idInternoResuelto: empresaListaParaImportar ? idInternoNormalizado : null,
      empresaListaParaImportar,
    };
  });
}
