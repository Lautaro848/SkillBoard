# Puesta en marcha (Fases 0, 1 y 2)

Este documento es la continuación práctica de `docs/00-resumen-y-plan.md`.

---

## 🔗 Está en línea

**https://skillboard-git-claude-skillboard-ov-bfd149-lautaro848s-projects.vercel.app**

Entrá con la cuenta de prueba de más abajo. Se actualiza solo con cada push
a la rama de desarrollo.

> La URL corta (`skillboard-phi.vercel.app`) apunta a la rama `main`, que
> todavía no tiene el trabajo — está todo en `claude/skillboard-overview-uopw0a`.
> Al mergear a `main`, la URL corta pasa a servir la versión actual.

**Supabase** (base, auth, archivos) — en producción, con datos reales.
**Vercel** — preview navegable, para *ver* el producto mientras se desarrolla.
**Cloudflare Workers** — destino previsto para producción comercial; el
proyecto sigue pudiendo buildear para ahí (ver abajo).

### El hosting es una decisión reversible

El proyecto buildea para dos plataformas desde el mismo código:

```bash
npm run build                      # Cloudflare Workers (por defecto)
DEPLOY_TARGET=vercel npm run build # Node / Vercel / Hostinger
```

Vercel además se autodetecta (expone `VERCEL=1` en su build), así que su
preview no necesita configuración.

Esto se logró sacando la única atadura dura que había a Cloudflare: los
archivos ya no van a R2 sino a **Supabase Storage** (migración 0007), que
funciona igual en cualquier hosting. Lo único que sabe en qué plataforma
corre es `app/lib/env.server.ts`.

**Sobre monetizar:** el plan gratuito de Vercel prohíbe uso comercial, así
que sirve para probar y mostrar, no para vender. Cloudflare Workers **sí**
permite uso comercial en su plan gratuito (ver `docs/01-arquitectura-y-stack.md` §4),
y Hostinger también con su plan Node.js pago. La decisión se puede tomar
cuando el producto esté listo, no antes.

### Para desplegar a Cloudflare cuando llegue el momento

```bash
npm install
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY  # Supabase → Project Settings → API
npm run deploy
```

`SUPABASE_URL` y `SUPABASE_ANON_KEY` ya están en `wrangler.jsonc`. Ya no hace
falta crear un bucket de R2 ni un secreto de firma: eso lo cubre Supabase
Storage. `RESEND_API_KEY` se carga como secreto de Supabase, no de Cloudflare (ver más abajo).

**Pendiente de la Fase 0 que solo se puede medir ya desplegado:** el tiempo
de CPU por ruta con una empresa de 200 empleados, para anotarlo en
`docs/01-arquitectura-y-stack.md` §4 — es lo que decide si Cloudflare cuesta
0 o 5 USD/mes.

---

## El backend de Supabase ya está vivo

Proyecto real: **`Skillboard`**, ref `bdufwbssueduudhbwzim`, región `sa-east-1`
(São Paulo) — https://supabase.com/dashboard/project/bdufwbssueduudhbwzim

- Las 11 migraciones de `supabase/migrations/` están aplicadas.
- RLS probado con una sesión real: login funciona, `buscar_empleados` y la
  vista `v_certificados` (con el embedding de `tipos_certificado`) devuelven
  los datos correctos con las políticas aplicadas.
- Hay una empresa de prueba cargada ("ACME Demo") con catálogos, 2 empleados,
  aptitudes y 2 certificados (uno vigente, uno por vencer en 12 días) — ver
  **cuenta de prueba** más abajo.
- `SUPABASE_URL` y `SUPABASE_ANON_KEY` ya están en `wrangler.jsonc` (son
  claves públicas, protegidas por RLS: no hace falta ocultarlas).

### Cuatro bugs reales que aparecieron recién al probar contra la base real

Ninguno se veía en `tsc`/`build` porque son de configuración de Postgres, no
de TypeScript. Quedaron corregidos en migraciones nuevas:

1. **`0004_grants.sql`** — faltaba el `GRANT` de Postgres sobre las tablas.
   RLS controla *qué filas* se ven, pero antes de eso Postgres exige el
   permiso de acceso a la tabla en sí; sin el grant, PostgREST devuelve
   401 aunque las políticas estén perfectas.
2. **`0005_grants_schema_app.sql`** — `buscar_empleados` es `SECURITY
   INVOKER` a propósito (para que RLS se aplique con los permisos de quien
   llama). Eso significa que el rol `authenticated` también necesita
   permiso sobre todo lo que la función toca por dentro: el esquema `app`
   y `app.normalizar()`.
3. **`0006_busqueda_similitud.sql`** — el criterio de aceptación dice que
   buscar "peres" tiene que encontrar a "Pérez". Eso no es un caso de
   acento/mayúsculas (ILIKE + normalizar ya lo resolvía) — "peres" no es
   substring de "perez" (difieren en la última letra). Hacía falta el
   operador de similitud por trigramas (`%` de `pg_trgm`), no solo ILIKE.

4. **`0010_grants_service_role.sql`** — la 0004 dio los grants a
   `authenticated` pero no a `service_role`, así que el cron de avisos no
   podía leer ni una tabla. `service_role` saltea RLS, pero el GRANT de
   acceso a la tabla es una capa distinta y se exige igual.

Y de paso, el linter de seguridad de Supabase (`0003_fix_search_path.sql`)
marcó que dos funciones no tenían `search_path` fijo.

## Cuenta de prueba

```
URL:          ver el enlace de arriba
Email:        demo@skillboard.app
Contraseña:   Demo-SkillBoard-2026!
Empresa:      ACME Demo (plan prueba, 25 empleados, vence en 30 días)
Rol:          propietario
```

Esta cuenta se creó de verdad a través de Supabase Auth (no es una fila
insertada a mano): tiene su `perfil`, su `empresa` y su `membresia` creados
por el mismo trigger `app.handle_new_user()` que dispara `/registro`. El
email ya está confirmado para que puedas entrar sin buscar un mail de
verificación.

Se creó con una Edge Function temporal (`crear-cuenta-prueba`) desplegada en
tu proyecto, porque no tengo la clave `service_role` (por diseño: el MCP de
Supabase no la expone). Podés borrarla desde el dashboard → Edge Functions
cuando quieras; solo sabe crear/confirmar esta única cuenta fija, no es un
endpoint genérico de alta de usuarios.

## Cómo probarlo en local

```bash
npm install
npm run dev
```

Abrí `http://localhost:5173/iniciar-sesion` y entrá con la cuenta de prueba
de arriba. No hace falta configurar nada: la URL y la anon key de Supabase
tienen valores por defecto en `app/lib/env.server.ts`, así que login,
catálogos, empleados, importación, certificados y avisos funcionan de una.

Copiá `.dev.vars.example` a `.dev.vars` solo si vas a tocar algo que use
`SUPABASE_SERVICE_ROLE_KEY` (el cron de avisos) o `RESEND_API_KEY`.

`npm run build && wrangler dev` reproduce el entorno de Workers exacto.

## Avisos de vencimiento: falta un paso para que salgan los emails

El pipeline entero está desplegado y probado — la Edge Function corre, arma
el email y registra cada corrida — pero **falta cargar la API key de Resend**,
sin la cual no se envía nada (queda anotado en `avisos_enviados` con el
motivo).

1. Crear una cuenta gratis en https://resend.com (3.000 emails/mes, tope de
   100 por día) y generar una API key.
2. Cargarla como secreto del proyecto de Supabase:
   **Dashboard → Project Settings → Edge Functions → Secrets**, con el nombre
   `RESEND_API_KEY`.
3. Opcional: `AVISOS_REMITENTE` (por defecto usa el dominio de prueba de
   Resend, que solo puede enviarte a vos mismo; para mandar a clientes hay
   que verificar un dominio propio en Resend).

Para probarlo sin esperar a mañana, invocá la función a mano desde el
dashboard de Supabase (Edge Functions → avisar-vencimientos → Invoke), o
mirá el resultado de la última corrida en `/configuracion/avisos`.

El cron ya está programado: `avisar-vencimientos-diario`, todos los días a
las 11:00 UTC (08:00 en Argentina).

## Verificar el aislamiento entre empresas (test automatizado)

```bash
supabase start   # Postgres local con las migraciones aplicadas
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
npx vitest run supabase/tests/aislamiento.test.ts
```

Esto corre contra Postgres local, no contra el proyecto real — no hace falta
tocar datos de producción para validar RLS.

## Lo que falta

- Medir el tiempo de CPU por ruta con datos realistas — solo se puede hacer
  contra un Worker desplegado de verdad en Cloudflare.
- Copia de seguridad diaria (`pg_dump`) vía GitHub Action.
- Cargar `RESEND_API_KEY` para que los avisos salgan de verdad (ver arriba).
- Panel de rendimiento (Fase 3), Modo carrusel (4), Tukson (5), y recién en
  la Fase 6 la página pública con precios, planes y legales — hoy `/` es un
  placeholder deliberado.
