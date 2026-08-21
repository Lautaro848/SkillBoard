import { colorDesdeId, iniciales } from "~/lib/avatar";

export function Avatar({
  nombre,
  apellido,
  idInterno,
  fotoUrl,
  size = 40,
}: {
  nombre: string;
  apellido: string;
  idInterno: string;
  fotoUrl?: string | null;
  size?: number;
}) {
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={`${nombre} ${apellido}`}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, backgroundColor: colorDesdeId(idInterno), fontSize: size * 0.4 }}
    >
      {iniciales(nombre, apellido)}
    </div>
  );
}
