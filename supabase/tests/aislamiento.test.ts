import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// Requiere una instancia local de Supabase corriendo (`supabase start`) con
// la migración 0001_schema.sql aplicada. No corre contra producción.
//
// Fase 0, criterio de "terminada": crea dos empresas con datos, se autentica
// como usuario de la empresa A e intenta leer, modificar y borrar filas de
// la empresa B por todos los caminos posibles. Si alguno devuelve algo
// distinto de vacío o error, la fase no está terminada.

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Sin credenciales no hay instancia contra la cual probar. Se saltea en vez
// de fallar: una suite siempre roja tapa las fallas que sí importan.
const HAY_INSTANCIA = Boolean(ANON_KEY && SERVICE_ROLE_KEY);

const admin = createClient(URL, SERVICE_ROLE_KEY || "sin-clave");

async function crearEmpresaConUsuario(nombreEmpresa: string, email: string) {
  const password = "Prueba-Aislamiento-9!";

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { empresa: nombreEmpresa, nombre: "Prueba", apellido: "Aislamiento" },
  });
  if (authError) throw authError;

  const { data: membresia } = await admin
    .from("membresias")
    .select("empresa_id")
    .eq("usuario_id", authUser.user.id)
    .single();

  const client = createClient(URL, ANON_KEY);
  const { data: session } = await client.auth.signInWithPassword({ email, password });

  return {
    empresaId: membresia!.empresa_id as string,
    userId: authUser.user.id,
    client,
    accessToken: session.session!.access_token,
  };
}

describe.skipIf(!HAY_INSTANCIA)("Aislamiento multiempresa (RLS)", () => {
  let empresaA: Awaited<ReturnType<typeof crearEmpresaConUsuario>>;
  let empresaB: Awaited<ReturnType<typeof crearEmpresaConUsuario>>;
  let empleadoDeB: string;

  beforeAll(async () => {
    if (!ANON_KEY || !SERVICE_ROLE_KEY) {
      throw new Error(
        "Faltan SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY de la instancia local (`supabase status`).",
      );
    }

    empresaA = await crearEmpresaConUsuario("Empresa A", `a-${Date.now()}@test.local`);
    empresaB = await crearEmpresaConUsuario("Empresa B", `b-${Date.now()}@test.local`);

    const { data: puesto } = await admin
      .from("puestos")
      .insert({ empresa_id: empresaB.empresaId, nombre: "Operario" })
      .select()
      .single();

    const { data: empleado } = await admin
      .from("empleados")
      .insert({
        empresa_id: empresaB.empresaId,
        id_interno: "EMPB01",
        nombre: "Empleado",
        apellido: "DeB",
        fecha_nacimiento: "1990-01-01",
        fecha_ingreso: "2020-01-01",
        puesto_id: puesto!.id,
      })
      .select()
      .single();

    empleadoDeB = empleado!.id;
  });

  it("A no puede LEER empleados de B", async () => {
    const { data, error } = await empresaA.client.from("empleados").select("*").eq("id", empleadoDeB);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("A no puede MODIFICAR un empleado de B", async () => {
    const { data, error } = await empresaA.client
      .from("empleados")
      .update({ observaciones: "hackeado" })
      .eq("id", empleadoDeB)
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { data: sigueIgual } = await admin.from("empleados").select("observaciones").eq("id", empleadoDeB).single();
    expect(sigueIgual?.observaciones).not.toBe("hackeado");
  });

  it("A no puede BORRAR un empleado de B", async () => {
    const { data, error } = await empresaA.client.from("empleados").delete().eq("id", empleadoDeB).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { data: sigueExistiendo } = await admin.from("empleados").select("id").eq("id", empleadoDeB).single();
    expect(sigueExistiendo?.id).toBe(empleadoDeB);
  });

  it("A no puede INSERTAR una fila con empresa_id de B", async () => {
    const { error } = await empresaA.client.from("puestos").insert({
      empresa_id: empresaB.empresaId,
      nombre: "Intento cruzado",
    });
    expect(error).not.toBeNull();
  });

  it("A no puede leer la fila de empresas de B", async () => {
    const { data, error } = await empresaA.client.from("empresas").select("*").eq("id", empresaB.empresaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("A sí puede leer y modificar sus propios datos", async () => {
    const { data, error } = await empresaA.client
      .from("puestos")
      .insert({ empresa_id: empresaA.empresaId, nombre: "Puesto de A" })
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
