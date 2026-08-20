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
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Iniciar sesión</h1>

      {actionData?.errors?._form && (
        <p className="mt-4 rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-sm text-[var(--color-danger)]">
          {actionData.errors._form[0]}
        </p>
      )}

      <Form method="post" className="mt-6 flex flex-col gap-4" noValidate>
        <div>
          <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={values?.email}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-contrast)] disabled:opacity-60"
        >
          {submitting ? "Ingresando..." : "Ingresar"}
        </button>
      </Form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        ¿No tenés cuenta? <Link to="/registro" className="text-[var(--color-primary)] underline">Registrate</Link>
      </p>

      <footer className="mt-12 text-center text-xs text-[var(--color-text-muted)]">
        SkillBoard · v0.1 (Fase 0) ·{" "}
        <a href="mailto:soporte@skillboard.app" className="underline">
          soporte@skillboard.app
        </a>
      </footer>
    </main>
  );
}
