const LADO = 400;

// Recorte centrado a cuadrado + reescalado a 400×400 + WebP, del lado del
// cliente (03-modulos-y-alcance.md §Alta y edición). No es un recortador
// interactivo con arrastre — es una simplificación deliberada de esta
// primera versión: se ve el resultado al instante y se puede volver a elegir
// la foto si no gusta, pero no reposicionar el recuadro a mano.
export async function procesarFoto(file: File): Promise<{ blob: Blob; previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const lado = Math.min(bitmap.width, bitmap.height);
  const offsetX = (bitmap.width - lado) / 2;
  const offsetY = (bitmap.height - lado) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, offsetX, offsetY, lado, lado, 0, 0, LADO, LADO);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))),
      "image/webp",
      0.9,
    );
  });

  return { blob, previewUrl: URL.createObjectURL(blob) };
}
