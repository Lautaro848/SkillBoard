// Normalización de texto para buscar.
//
// Quien busca "Maria" tiene que encontrar a "María", y quien busca "Munoz" a
// "Muñoz". Nadie escribe los acentos cuando busca, y menos desde el teclado
// de un teléfono.
//
// Esto replica lo que hace `app.normalizar()` en Postgres —`lower(unaccent(…))`,
// migración 0001— para que las dos búsquedas del producto se comporten igual.
// La de Empleados la resuelve la base con trigramas; la de Certificados filtra
// en memoria sobre una lista ya traída. Si cada una normalizara distinto,
// buscar lo mismo en dos pantallas daría resultados distintos, que es peor que
// no tener búsqueda.
//
// Verificado contra la base: 'María'→maria, 'Muñoz'→munoz, 'PEÑA'→pena,
// 'Güemes'→guemes, "D'Angelo"→d'angelo.
export function normalizar(texto: string): string {
  return (
    texto
      // NFD separa cada letra acentuada en letra + marca diacrítica…
      .normalize("NFD")
      // …y esto borra las marcas, que ocupan ese rango de Unicode. Así
      // á→a, é→e, ñ→n, ü→u, igual que unaccent.
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase("es-AR")
      .trim()
  );
}

// ¿Alguno de estos campos contiene lo que se buscó? Un término vacío no
// filtra nada: mostrar cero resultados porque el campo está vacío sería
// desconcertante.
export function coincide(termino: string, ...campos: (string | null | undefined)[]): boolean {
  const buscado = normalizar(termino);
  if (buscado === "") return true;

  return campos.some((campo) => campo != null && normalizar(campo).includes(buscado));
}
