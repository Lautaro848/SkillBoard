import { useEffect, useRef, useState } from "react";
import { data } from "react-router";
import { datosPorToken } from "~/lib/carrusel.server";
import { reubicarIndice, type DatosCarrusel, type EmpleadoCarrusel } from "~/lib/carrusel";
import { SlideCarrusel } from "~/components/slide-carrusel";
import type { Route } from "./+types/tv";

// Cada cuánto la pantalla vuelve a pedir los datos. Treinta segundos cubren
// dos cosas de una: un empleado nuevo entra al ciclo sin reiniciar la TV, y
// un token rotado deja de funcionar en menos de un minuto, que es el criterio
// de aceptación del módulo 6.
const REFRESCO_MS = 30_000;
const TRANSICION_MS = 600;

export function meta(): Route.MetaDescriptors {
  // Una TV colgada en el comedor no debería aparecer en un buscador.
  return [{ title: "SkillBoard" }, { name: "robots", content: "noindex, nofollow" }];
}

// Esta es la única carga que registra el acceso en auditoría. El refresco va
// por `/tv/:token/datos`, que no lo registra: si no, una TV prendida todo el
// día escribiría la misma línea 2.880 veces.
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const resultado = await datosPorToken(request, context, params.token, true);

  // En la primera carga no hay datos viejos que conservar, así que un error
  // de base y un token muerto muestran lo mismo: el cartel, nunca una
  // pantalla en blanco.
  if (resultado.estado !== "ok") throw data("Carrusel no disponible", { status: 404 });
  return resultado.datos;
}

// Un token inválido, rotado o apagado no muestra un error de la aplicación
// con menús y enlaces: muestra un cartel legible desde lejos y nada más.
export function ErrorBoundary() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0e1a1c] px-8 text-center text-white">
      <h1 className="text-4xl font-bold">Este carrusel no está disponible</h1>
      <p className="mt-4 max-w-xl text-xl opacity-70">
        El enlace puede haber sido rotado o el carrusel apagado desde la configuración. Pedí el enlace nuevo a
        quien administra SkillBoard.
      </p>
    </main>
  );
}

export default function TV({ loaderData, params }: Route.ComponentProps) {
  const inicial = loaderData as DatosCarrusel;
  const [datos, setDatos] = useState(inicial);
  const [indice, setIndice] = useState(0);
  const [visible, setVisible] = useState(true);
  const [estado, setEstado] = useState<"ok" | "sin_conexion" | "revocado">("ok");

  // La última tanda buena queda en memoria: si se cae internet, la pantalla
  // sigue girando con lo que ya tenía en vez de quedar en negro.
  const empleados = datos.empleados;
  const campos = datos.carrusel.campos;

  // Avance del ciclo. El fundido de 600 ms sale y entra: es una herramienta,
  // no un salvapantallas.
  useEffect(() => {
    if (empleados.length <= 1) return;
    const ms = Math.max(datos.carrusel.segundosPorSlide, 5) * 1000;
    let fundido: ReturnType<typeof setTimeout>;

    const ciclo = setInterval(() => {
      setVisible(false);
      fundido = setTimeout(() => {
        setIndice((i) => (i + 1) % empleados.length);
        setVisible(true);
      }, TRANSICION_MS);
    }, ms);

    return () => {
      clearInterval(ciclo);
      // Si llega una tanda nueva justo durante el fundido, este timeout
      // quedaría pendiente con el largo viejo de la lista y devolvería la
      // pantalla a un índice que ya no existe.
      clearTimeout(fundido);
      setVisible(true);
    };
  }, [empleados.length, datos.carrusel.segundosPorSlide]);

  // Refresco de datos. Se guarda en una ref para que el intervalo no se
  // reinicie con cada tanda nueva.
  const indiceRef = useRef(indice);
  indiceRef.current = indice;
  const empleadosRef = useRef(empleados);
  empleadosRef.current = empleados;

  useEffect(() => {
    let cancelado = false;

    async function refrescar() {
      try {
        const res = await fetch(`/tv/${params.token}/datos`, { cache: "no-store" });
        if (cancelado) return;

        if (res.status === 404) {
          // El token dejó de existir. Se corta acá: seguir mostrando gente
          // con un enlace revocado es exactamente lo que hay que evitar.
          setEstado("revocado");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));

        const nuevos = (await res.json()) as DatosCarrusel;
        if (cancelado) return;

        setDatos(nuevos);
        // No saltar al principio: si la persona que está en pantalla sigue
        // en la lista, el ciclo continúa por ella.
        setIndice(reubicarIndice(empleadosRef.current, nuevos.empleados, indiceRef.current));
        setEstado("ok");
      } catch {
        // Se conserva la última tanda y se vuelve a intentar al rato.
        if (!cancelado) setEstado("sin_conexion");
      }
    }

    const reloj = setInterval(refrescar, REFRESCO_MS);
    return () => {
      cancelado = true;
      clearInterval(reloj);
    };
  }, [params.token]);

  if (estado === "revocado") return <ErrorBoundary />;

  return (
    <main
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0e1a1c] text-white"
      // Sin cursor: la TV no tiene mouse y una flecha quieta en el medio de
      // la pantalla se ve como un error.
      style={{ cursor: "none" }}
    >
      <header className="flex shrink-0 items-center justify-between px-12 pt-10">
        <div className="flex items-center gap-5">
          {datos.carrusel.logoUrl && <img src={datos.carrusel.logoUrl} alt="" className="h-14 w-auto" />}
          <p className="text-2xl font-medium opacity-80">{datos.carrusel.empresa}</p>
        </div>
        <div className="flex items-center gap-6">
          {estado === "sin_conexion" && (
            <p className="text-lg opacity-50">Sin conexión · mostrando los últimos datos</p>
          )}
          <Puntos total={empleados.length} actual={indice} />
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center">
        {empleados.length === 0 ? (
          <p className="px-12 text-center text-4xl opacity-70">
            Este carrusel no tiene empleados que mostrar. Revisá los filtros en la configuración.
          </p>
        ) : (
          <div
            style={{
              opacity: visible ? 1 : 0,
              transition: `opacity ${TRANSICION_MS}ms ease-in-out`,
            }}
          >
            {/* Nunca se indexa fuera de rango: una pantalla en blanco es
                justamente lo que no puede pasar en una TV colgada. */}
            <SlideCarrusel
              empleado={empleados[Math.min(indice, empleados.length - 1)] as EmpleadoCarrusel}
              campos={campos}
            />
          </div>
        )}
      </div>
    </main>
  );
}

// Con mucha gente los puntos se vuelven ilegibles desde lejos; ahí se pasa a
// contar en texto.
function Puntos({ total, actual }: { total: number; actual: number }) {
  if (total <= 1) return null;
  if (total > 20) {
    return (
      <p className="text-lg tabular-nums opacity-50">
        {actual + 1} de {total}
      </p>
    );
  }
  return (
    <ul className="flex gap-2" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <li
          key={i}
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: i === actual ? "#ffffff" : "rgba(255,255,255,0.25)" }}
        />
      ))}
    </ul>
  );
}
