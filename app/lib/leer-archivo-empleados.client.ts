import * as XLSX from "xlsx";

export interface ArchivoLeido {
  encabezados: string[];
  filas: Record<string, string>[];
  // El número de fila que cada dato tiene EN LA PLANILLA, no en este arreglo.
  // Van paralelos a `filas`. Sin esto, el reporte de errores manda a la
  // persona a una fila equivocada en cuanto el archivo tiene un título arriba
  // o una fila en blanco en el medio.
  numerosDeFila: number[];
  // Todas las hojas del libro, para poder ofrecer el cambio si elegimos mal.
  hojas: string[];
  hoja: string;
  // 1 = la primera fila. Se muestra para que se entienda qué se leyó.
  filaEncabezados: number;
}

// Cuántas filas del principio se miran buscando los encabezados. Alcanza para
// un título, un logo y un par de filas en blanco.
const FILAS_A_MIRAR = 10;

const llenas = (fila: unknown[]) => fila.filter((c) => String(c ?? "").trim() !== "").length;

// ¿En qué fila están los encabezados?
//
// Muchas plantillas —sobre todo las que genera un modelo de lenguaje— ponen un
// título arriba, a veces con celdas combinadas, y recién después la tabla. La
// fila con más celdas llenas de las primeras diez es la tabla; un título tiene
// una sola. En caso de empate gana la de más arriba, que es la que corresponde
// cuando la última fila es un total.
//
// Devuelve -1 si ninguna fila parece una tabla.
function filaDeEncabezados(filas: unknown[][]): number {
  let mejor = -1;
  let maximo = 0;

  for (let i = 0; i < Math.min(filas.length, FILAS_A_MIRAR); i++) {
    const cantidad = llenas(filas[i]);
    if (cantidad > maximo) {
      maximo = cantidad;
      mejor = i;
    }
  }

  // Una sola columna no es una tabla de empleados; es un título.
  return maximo >= 2 ? mejor : -1;
}

interface HojaLeida {
  encabezados: string[];
  filas: unknown[][];
  // Paralelo a `filas`: en qué fila de la planilla estaba cada una.
  numerosDeFila: number[];
  filaEncabezados: number;
}

function leerHoja(libro: XLSX.WorkBook, nombre: string): HojaLeida | null {
  const hoja = libro.Sheets[nombre];
  if (!hoja) return null;

  const todas: unknown[][] = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    raw: false,
    dateNF: "yyyy-mm-dd",
  });

  const indice = filaDeEncabezados(todas);
  if (indice === -1) return null;

  const conNumero = todas
    .map((fila, i) => ({ fila, numero: i + 1 }))
    .slice(indice + 1)
    .filter(({ fila }) => llenas(fila) > 0);

  return {
    encabezados: todas[indice].map((h) => String(h ?? "").trim()),
    filas: conNumero.map((f) => f.fila),
    numerosDeFila: conNumero.map((f) => f.numero),
    filaEncabezados: indice + 1,
  };
}

// Qué hoja tiene los empleados.
//
// Un libro puede traer una portada, un "Dashboard" con gráficos o una hoja de
// instrucciones antes de los datos. Quedarse con la primera —que es lo que
// hacía esto— deja al usuario mirando un desplegable con el título de la
// portada como única columna. Se elige la hoja con más datos: columnas por
// filas.
function elegirHoja(libro: XLSX.WorkBook): { nombre: string; datos: HojaLeida } | null {
  let mejor: { nombre: string; datos: HojaLeida; puntaje: number } | null = null;

  for (const nombre of libro.SheetNames) {
    const datos = leerHoja(libro, nombre);
    if (!datos) continue;

    const puntaje = datos.encabezados.filter(Boolean).length * datos.filas.length;
    if (!mejor || puntaje > mejor.puntaje) mejor = { nombre, datos, puntaje };
  }

  return mejor ? { nombre: mejor.nombre, datos: mejor.datos } : null;
}

// Lee .xlsx y .csv enteramente en el navegador — nunca llega al Worker, así
// que no compite por el presupuesto de CPU de Cloudflare (01-arquitectura-y-stack.md §4).
//
// `hojaPedida` la manda la pantalla cuando la persona elige otra hoja a mano.
export function leerLibroEmpleados(buffer: ArrayBuffer, hojaPedida?: string): ArchivoLeido {
  const libro = XLSX.read(buffer, { type: "array", cellDates: true });
  const hojas = libro.SheetNames;

  const elegida =
    hojaPedida && hojas.includes(hojaPedida)
      ? { nombre: hojaPedida, datos: leerHoja(libro, hojaPedida) }
      : elegirHoja(libro);

  if (!elegida?.datos) {
    return {
      encabezados: [],
      filas: [],
      numerosDeFila: [],
      hojas,
      hoja: elegida?.nombre ?? hojas[0] ?? "",
      filaEncabezados: 0,
    };
  }

  const { encabezados, filas: filasCrudas, numerosDeFila, filaEncabezados } = elegida.datos;

  const filas = filasCrudas.map((fila) => {
    const objeto: Record<string, string> = {};
    encabezados.forEach((encabezado, i) => {
      if (encabezado) objeto[encabezado] = String(fila[i] ?? "").trim();
    });
    return objeto;
  });

  return {
    encabezados: encabezados.filter(Boolean),
    filas,
    numerosDeFila,
    hojas,
    hoja: elegida.nombre,
    filaEncabezados,
  };
}

export async function leerArchivoEmpleados(file: File, hojaPedida?: string): Promise<ArchivoLeido> {
  return leerLibroEmpleados(await file.arrayBuffer(), hojaPedida);
}
