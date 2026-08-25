import { Form, Link, redirect, useNavigation } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { iniciarSesionSchema } from "~/lib/validation/auth";
import type { Route } from "./+types/iniciar-sesion";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context);
  const { data } = await supabase.auth.getUser();
  if (data.user) throw redirect("/panel");
  return null;
}

interface IniciarSesionErrors {
  _form?: string[];
  email?: string[];
  password?: string[];
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const parsed = iniciarSesionSchema.safeParse(raw);

  if (!parsed.success) {
    const errors: IniciarSesionErrors = parsed.error.flatten().fieldErrors;
    return { errors, values: raw };
  }

  const { supabase, headers } = createSupabaseServerClient(request, context);
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    const errors: IniciarSesionErrors = { _form: ["Email o contraseña incorrectos."] };
    return { errors, values: raw };
  }

  throw redirect("/panel", { headers });
}

export default function IniciarSesion({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const values = actionData?.values as Record<string, string> | undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-seccion font-semibold text-texto">Iniciar sesión</h1>

      {actionData?.errors?._form && (
        <p className="mt-4 rounded-control border border-error/30 bg-error/5 p-3 text-menor text-error">
          {actionData.errors._form[0]}
        </p>
      )}

      <Form method="post" className="mt-6 flex flex-col gap-4" noValidate>
        <div>
          <label className="text-menor font-medium text-texto" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={values?.email}
            className="campo mt-1"
          />
        </div>
        <div>
          <label className="text-menor font-medium text-texto" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="campo mt-1"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-control bg-primario px-4 py-2 text-menor font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Ingresando..." : "Ingresar"}
        </button>
      </Form>

      <p className="mt-6 text-center text-menor text-secundario">
        ¿No tenés cuenta? <Link to="/registro" className="text-primario underline">Registrate</Link>
      </p>

      <footer className="mt-12 text-center text-auxiliar text-secundario">
        SkillBoard · v0.1 (Fase 0) ·{" "}
        <a href="mailto:soporte@skillboard.app" className="underline">
          soporte@skillboard.app
        </a>
      </footer>
    </main>
  );
}
