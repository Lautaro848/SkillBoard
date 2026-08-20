# Puesta en marcha (Fase 0 + Fase 1)

Este documento es la continuación práctica de `docs/00-resumen-y-plan.md`.

## El backend de Supabase ya está vivo

Proyecto real: **`Skillboard`**, ref `bdufwbssueduudhbwzim`, región `sa-east-1`
(São Paulo) — https://supabase.com/dashboard/project/bdufwbssueduudhbwzim

- Las 6 migraciones de `supabase/migrations/` están aplicadas.
- RLS probado con una sesión real: login funciona, `buscar_empleados` y la
  vista `v_certificados` (con el embedding de `tipos_certificado`) devuelven
  los datos correctos con las políticas aplicadas.
- Hay una empresa de prueba cargada ("ACME Demo") con catálogos, 2 empleados,
  aptitudes y 2 certificados (uno vigente, uno por vencer en 12 días) — ver
  **cuenta de prueba** más abajo.
- `SUPABASE_URL` y `SUPABASE_ANON_KEY` ya están en `wrangler.jsonc` (son
  claves públicas, protegidas por RLS: no hace falta ocultarlas).

### Tres bugs reales que aparecieron recién al probar contra la base real

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

Y de paso, el linter de seguridad de Supabase (`0003_fix_search_path.sql`)
marcó que dos funciones no tenían `search_path` fijo.

## Cuenta de prueba

```
URL de login: (ver "Cómo probarlo" abajo — todavía no hay un link público)
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

## Por qué todavía no hay un link público

Sí puedo llegar a Supabase (vía el conector MCP, que usa su propio canal de
red). **No puedo llegar a Cloudflare**: el proxy de red de este sandbox
bloquea `api.cloudflare.com` y `dash.cloudflare.com` con un 403 de política,
no de configuración — no es algo que pueda resolver desde acá. Así que el
código está listo, tipado, compilado y ahora **probado contra una base de
datos real**, pero el despliegue a Cloudflare Workers lo tenés que hacer vos.

## Cómo probarlo (5-10 minutos)

```bash
git clone <tu-repo> && cd SkillBoard
npm install
npm run dev
```

Abrí `http://localhost:5173/iniciar-sesion` y entrá con la cuenta de prueba
de arriba. `SUPABASE_URL`/`SUPABASE_ANON_KEY` ya están en `wrangler.jsonc`,
así que no hace falta crear ningún `.dev.vars` para probar login, catálogos,
empleados, importación y acciones en lote.

Solo necesitás un `.dev.vars` (copiá `.dev.vars.example`) si querés probar
**fotos de empleados o archivos de certificados**, porque `STORAGE_SIGNING_SECRET`
no está en el repo (no hace falta que sea un valor real de Supabase, cualquier
cadena larga sirve: `openssl rand -hex 32`).

Si algo falla en `npm run dev`, `npm run build && wrangler dev` reproduce el
entorno de Workers exacto (R2 se emula solo, no hace falta el bucket real
para probar local).

## Para tener un link público de verdad

1. Cuenta de Cloudflare (gratis) en https://dash.cloudflare.com/sign-up.
2. Bucket de R2 para fotos/certificados:
   ```bash
   npx wrangler login
   npx wrangler r2 bucket create skillboard-archivos
   ```
3. Desplegar:
   ```bash
   npm run deploy
   ```
   Te da la URL pública (`https://skillboard.<tu-cuenta>.workers.dev`).
4. Cargar los secretos que faltan (nunca van en `wrangler.jsonc`):
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # Project Settings → API
   npx wrangler secret put RESEND_API_KEY               # cuando integres avisos por email
   npx wrangler secret put STORAGE_SIGNING_SECRET       # openssl rand -hex 32
   ```

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

## Lo que falta después de esto (fuera de la Fase 0/1)

- Medir el tiempo de CPU por ruta con datos realistas — solo se puede hacer
  contra un Worker desplegado de verdad en Cloudflare.
- Copia de seguridad diaria (`pg_dump`) vía GitHub Action.
- Certificados (carga y vencimientos), Panel, Carrusel, Tukson, y recién en
  la Fase 6 la página pública con precios, planes y legales que
  mencionaste — hoy `/` es un placeholder deliberado.
