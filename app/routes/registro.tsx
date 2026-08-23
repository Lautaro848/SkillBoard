import { Form, Link, redirect, useNavigation } from "react-router";
import { useState } from "react";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { checkPasswordStrength, registroSchema } from "~/lib/validation/auth";
import type { Route } from "./+types/registro";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context);
  const { data } = await supabase.auth.getUser();
  if (data.user) throw redirect("/panel");
  return null;
}

interface RegistroErrors {
  _form?: string[];
  empresa?: string[];
  nombre?: string[];
  apellido?: string[];
  email?: string[];
  password?: string[];
}

export async function action({ request, context }: Route.ActionArgs) {
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const parsed = registroSchema.safeParse(raw);

  if (!parsed.success) {
    const errors: RegistroErrors = parsed.error.flatten().fieldErrors;
    return { errors, values: raw };
  }

  const { supabase, headers } = createSupabaseServerClient(request, context);
  const { empresa, nombre, apellido, email, password } = parsed.data;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { empresa, nombre, apellido } },
  });

  if (error) {
    // Supabase Auth ya deduplica emails; traducimos su mensaje al lenguaje
    // que pide 03-modulos-y-alcance.md en vez de mostrar el error crudo.
    const message = error.message.toLowerCase().includes("already registered")
      ? "Ya existe una cuenta con ese email. Podés iniciar sesión o recuperar tu contraseña."
      : "No pudimos crear la cuenta. Probá de nuevo en unos minutos.";
    const errors: RegistroErrors = { _form: [message] };
    return { errors, values: raw };
  }

  throw redirect("/panel", { headers });
}

export default function Registro({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [password, setPassword] = useState("");
  const strength = checkPasswordStrength(password);
  const values = actionData?.values as Record<string, string> | undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-seccion font-semibold text-texto">Creá tu cuenta de SkillBoard</h1>
      <p className="mt-1 text-menor text-secundario">
        Un panel para tu equipo, sus habilidades y sus certificados.
      </p>

      {actionData?.errors?._form && (
        <p className="mt-4 rounded-control border border-error/30 bg-error/5 p-3 text-menor text-error">
          {actionData.errors._form[0]}
        </p>
      )}

      <Form method="post" className="mt-6 flex flex-col gap-4" noValidate>
        <p className="text-auxiliar text-secundario">
          Los campos marcados con <span aria-hidden>*</span> son obligatorios.
        </p>

        <Field label="Nombre de la empresa" name="empresa" defaultValue={values?.empresa} errors={actionData?.errors?.empresa} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" name="nombre" defaultValue={values?.nombre} errors={actionData?.errors?.nombre} />
          <Field label="Apellido" name="apellido" defaultValue={values?.apellido} errors={actionData?.errors?.apellido} />
        </div>
        <Field label="Email de trabajo" name="email" type="email" defaultValue={values?.email} errors={actionData?.errors?.email} />

        <div>
          <label className="text-menor font-medium text-texto" htmlFor="password">
            Contraseña *
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-control border border-borde-decorativo bg-superficie px-3 py-2 text-menor"
          />
          {password.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-auxiliar">
              {strength.ok ? (
                <li className="text-exito">Contraseña segura.</li>
              ) : (
                strength.reasons.map((reason) => (
                  <li key={reason} className="text-secundario">
                    · {reason}
                  </li>
                ))
              )}
            </ul>
          )}
          {actionData?.errors?.password && (
            <p className="mt-1 text-auxiliar text-error">{actionData.errors.password[0]}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-control bg-primario px-4 py-2 text-menor font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </Form>

      <p className="mt-6 text-center text-menor text-secundario">
        ¿Ya tenés cuenta? <Link to="/iniciar-sesion" className="text-primario underline">Iniciá sesión</Link>
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

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  errors,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  errors?: string[];
}) {
  return (
    <div>
      <label className="text-menor font-medium text-texto" htmlFor={name}>
        {label} *
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-control border border-borde-decorativo bg-superficie px-3 py-2 text-menor"
      />
      {errors?.[0] && <p className="mt-1 text-auxiliar text-error">{errors[0]}</p>}
    </div>
  );
}
