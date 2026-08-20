// Avatar de iniciales cuando no hay foto — nunca un ícono de persona
// genérico repetido en toda la lista (03-modulos-y-alcance.md módulo 2).
export function iniciales(nombre: string, apellido: string): string {
  return `${nombre[0] ?? ""}${apellido[0] ?? ""}`.toUpperCase();
}

export function colorDesdeId(idInterno: string): string {
  let hash = 0;
  for (let i = 0; i < idInterno.length; i++) {
    hash = idInterno.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 40%)`;
}
