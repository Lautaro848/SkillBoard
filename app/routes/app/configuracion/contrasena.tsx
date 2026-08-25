import { useState } from "react";
import { Form, data, useNavigation } from "react-router";
import { Aviso } from "~/components/ui/estados";
import { requireSesion } from "~/lib/sesion.server";
import { createSupabaseAnonClient, createSupabaseServerClient } from "~/lib/supabase.server";
import { cambioContrasenaSchema } from "~/lib/validation/auth";
import { revisarReglas } from "~/lib/validation/contrasena";
import { motivoContrasenaFiltrada } from "~/lib/validation/pwned.server";
import type { Route } from "./+types/contrasena";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = await requireSesion(request, context);
  const { data } = await supabase.auth.getUser();
  return { email: data.user?.email ?? "" };
}

interface ErroresCambio {
  actual?: string[];
  nueva?: string[];
  repetir?: string[];
  _form?: string[];
}

// Una sola forma para todas las respuestas del action: si cada rama devolviera
// su propia forma, el componente tendría que estrechar una unión para leer
// `errores`.
interface RespuestaCambio {
  ok?: boolean;
  errores?: ErroresCambio;
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireSesion(request, context);

  const formData = await request.formData();
  const parsed = cambioContrasenaSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return data<RespuestaCambio>({ errores: parsed.error.flatten().fieldErrors as ErroresCambio });
  }

  const { supabase, headers } = createSupabaseServerClient(request, context);
  const { data: sesion } = await supabase.auth.getUser();
  const email = sesion.user?.email;
  if (!email) {
    return data<RespuestaCambio>({
      errores: { _form: ["No pudimos identificar tu cuenta. Cerrá sesión y volvé a entrar."] },
    });
  }

  // La contraseña actual se verifica antes de tocar nada. Sin esto, una
  // sesión robada —una computadora que quedó abierta— alcanzaría para
  // apropiarse de la cuenta cambiando la contraseña.
  //
  // Se usa un cliente sin cookies a propósito: el intento de inicio de sesión
  // no debe alterar la sesión que la persona está usando ahora mismo.
  const verificador = createSupabaseAnonClient(context);
  const { error: errorActual } = await verificador.auth.signInWithPassword({
    email,
    password: parsed.data.actual,
  });

  if (errorActual) {
    return data<RespuestaCambio>({ errores: { actual: ["La contraseña actual no es correcta."] } });
  }

  // Misma comprobación que en el registro: cambiar a una contraseña filtrada
  // sería cambiarla para peor.
  const filtrada = await motivoContrasenaFiltrada(parsed.data.nueva);
  if (filtrada) {
    return data<RespuestaCambio>({ errores: { nueva: [filtrada] } });
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.nueva });

  if (error) {
    return data<RespuestaCambio>({
      errores: { _form: ["No pudimos cambiar la contraseña. Probá de nuevo en unos minutos."] },
    });
  }

  // `updateUser` rota los tokens, así que las cookies nuevas tienen que
  // volver con la respuesta o la sesión queda apuntando a un token viejo.
  return data<RespuestaCambio>({ ok: true }, { headers });
}

export default function CambiarContrasena({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const enviando = navigation.state === "submitting";
  const [nueva, setNueva] = useState("");
  const reglas = revisarReglas(nueva);
  const errores = actionData?.errores;

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-seccion font-semibold text-texto">Cambiar contraseña</h1>
        <p className="text-menor text-secundario">
          Vas a cambiar la contraseña de {loaderData.email}.
        </p>
      </div>

      {actionData?.ok && <Aviso tono="exito">Listo, tu contraseña quedó cambiada.</Aviso>}

      {errores?._form && <Aviso tono="error">{errores._form[0]}</Aviso>}

      <Form method="post" className="flex flex-col gap-4" noValidate>
        <div>
          <label className="text-menor font-medium text-texto" htmlFor="actual">
            Contraseña actual *
          </label>
          <input id="actual" name="actual" type="password" required autoComplete="current-password" className="campo mt-1" />
          {errores?.actual?.[0] && <p className="mt-1 text-auxiliar text-error">{errores.actual[0]}</p>}
        </div>

        <div>
          <label className="text-menor font-medium text-texto" htmlFor="nueva">
            Contraseña nueva *
          </label>
          <input
            id="nueva"
            name="nueva"
            type="password"
            required
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className="campo mt-1"
          />
          {nueva.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-auxiliar">
              {reglas.faltantes.map((requisito) => (
                <li key={requisito} className="text-secundario">
                  · {requisito}
                </li>
              ))}
              {reglas.ok && <li className="text-secundario">· Cumple los requisitos</li>}
            </ul>
          )}
          {errores?.nueva?.[0] && <p className="mt-1 text-auxiliar text-error">{errores.nueva[0]}</p>}
        </div>

        <div>
          <label className="text-menor font-medium text-texto" htmlFor="repetir">
            Repetí la contraseña nueva *
          </label>
          <input id="repetir" name="repetir" type="password" required autoComplete="new-password" className="campo mt-1" />
          {errores?.repetir?.[0] && <p className="mt-1 text-auxiliar text-error">{errores.repetir[0]}</p>}
        </div>

        <button type="submit" disabled={enviando} className="boton boton-principal mt-2 self-start">
          {enviando ? "Cambiando..." : "Cambiar contraseña"}
        </button>
      </Form>

      <p className="text-auxiliar text-secundario">
        Al enviarla comprobamos que no figure en filtraciones de datos públicas. Para eso solo viajan los
        primeros cinco caracteres de su huella digital, nunca la contraseña.
      </p>
    </div>
  );
}
