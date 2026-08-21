import { antiguedadTexto, type ConfigCarrusel, type EmpleadoCarrusel } from "~/lib/carrusel";
import { colorDesdeId, iniciales } from "~/lib/avatar";

// Una pantalla del carrusel. La misma que se ve en la TV y en la vista previa
// de la configuración: `escala` la achica sin cambiar proporciones, así lo
// que se previsualiza es exactamente lo que se va a ver.
//
// Tipografía pensada para 3 metros de distancia: nombre a 72 px, puesto a
// 40 px (03-modulos-y-alcance.md, módulo 6).
export function SlideCarrusel({
  empleado,
  campos,
  escala = 1,
}: {
  empleado: EmpleadoCarrusel;
  campos: ConfigCarrusel["campos"];
  escala?: number;
}) {
  const px = (n: number) => `${n * escala}px`;
  const foto = campos.foto ? empleado.fotoUrl : null;
  const tamanioFoto = 320 * escala;

  return (
    <div className="flex items-center justify-center gap-[8%] px-[6%]">
      {campos.foto &&
        (foto ? (
          <img
            src={foto}
            alt=""
            className="shrink-0 rounded-full object-cover"
            style={{ width: tamanioFoto, height: tamanioFoto }}
          />
        ) : (
          // Nunca un hueco vacío: si no hay foto, van las iniciales.
          <div
            className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
            style={{
              width: tamanioFoto,
              height: tamanioFoto,
              backgroundColor: colorDesdeId(empleado.id),
              fontSize: px(120),
            }}
          >
            {iniciales(empleado.nombre, empleado.apellido)}
          </div>
        ))}

      <div className="min-w-0">
        <p className="font-bold leading-tight" style={{ fontSize: px(72) }}>
          {empleado.nombre} {empleado.apellido}
        </p>

        {campos.puesto && empleado.puesto && (
          <p className="mt-[0.4em] leading-tight opacity-90" style={{ fontSize: px(40) }}>
            {empleado.puesto}
          </p>
        )}

        {campos.departamento && empleado.departamento && (
          <p className="mt-[0.3em] leading-tight opacity-70" style={{ fontSize: px(32) }}>
            {empleado.departamento}
          </p>
        )}

        {campos.antiguedad && empleado.fechaIngreso && (
          <p className="mt-[0.3em] leading-tight opacity-70" style={{ fontSize: px(28) }}>
            {antiguedadTexto(empleado.fechaIngreso)}
          </p>
        )}

        {campos.certificados && empleado.certificados.length > 0 && (
          <ul className="mt-[1em] flex flex-wrap" style={{ gap: px(12) }}>
            {empleado.certificados.map((c) => (
              <li
                key={c}
                className="rounded-full border border-white/25 bg-white/10 leading-none"
                style={{ fontSize: px(24), padding: `${px(14)} ${px(24)}` }}
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
