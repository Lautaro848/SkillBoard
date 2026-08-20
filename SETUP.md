# Puesta en marcha (Fase 0 + Fase 1)

Este documento es la continuación práctica de `docs/00-resumen-y-plan.md`. Explica
qué quedó armado en esta etapa y qué pasos —todos fuera de este entorno,
porque necesitan credenciales tuyas— faltan para tener un link real.

## Qué está hecho

- Proyecto React Router v7 + Vite + `@cloudflare/vite-plugin`, TypeScript
  estricto. Compila y corre (`npm run build`, `wrangler dev`) verificado
  localmente.
- Tailwind v4 con los tokens de color base (`app/app.css`).
- `supabase/migrations/0001_schema.sql`: el esquema completo de
  `docs/02-modelo-de-datos.md` — todas las tablas, Row Level Security en cada una,
  la función `app.empresas_del_usuario()`, la vista `v_certificados`, el
  trigger de alta de empresa en una sola transacción, auditoría por
  disparadores, índices y el tope de empleados por plan.
- `supabase/tests/aislamiento.test.ts`: la prueba obligatoria de la Fase 0
  (dos empresas, intentos de lectura/escritura/borrado cruzados).
- Registro (`/registro`), login (`/iniciar-sesion`), logout y un panel
  mínimo con estado vacío honesto — todo con validación Zod y contraseñas
  contrastadas contra las 10.000 más comunes, sin llamadas externas.
- Catálogos (`/configuracion/catalogos`): departamentos, puestos, aptitudes
  y tipos de certificado, con protección al eliminar.
- `app/lib/storage.server.ts`: subida y lectura de archivos en R2 por clave
  de objeto, servidos por una ruta propia (`/storage/*`) firmada con HMAC y
  vencimiento corto — nunca una URL pública fija.
- **Fase 1 — Empleados**: alta y edición (`/empleados/nuevo`,
  `/empleados/:id/editar`) con las tres pestañas, validación completa,
  foto con recorte cuadrado + WebP 400×400 subida a R2; listado
  (`/empleados`) con búsqueda tolerante a acentos (`buscar_empleados` en
  `0002_busqueda_empleados.sql`), filtros persistentes en la URL y
  paginación; perfil (`/empleados/:id`) con pestañas Datos, Aptitudes,
  Certificados, Historial y Actividad (esta última lee la tabla
  `auditoria` real); borrado lógico con confirmación por nombre completo.
  **Quedó afuera de esta pasada** (no implementado todavía): importación
  masiva de Excel/CSV y las acciones en lote del listado — son la parte
  más grande de la Fase 1 según `docs/03-modulos-y-alcance.md` y no
  entraron en esta sesión.

## Por qué no hay un link todavía

No tengo acceso a tu cuenta de Cloudflare ni de Supabase desde este entorno
(el proxy de red de este sandbox bloquea `api.cloudflare.com` y no hay una
integración de Supabase conectada a esta sesión). Elegiste avanzar con la
migración formal sabiendo esto: hoy queda el código listo y probado
localmente, no un despliegue.

## Lo que tenés que hacer vos (15-20 minutos)

1. **Crear el proyecto de Supabase** en https://supabase.com/dashboard
   (elegí la región más cercana a tus usuarios, ej. São Paulo). Guardá la
   contraseña de la base.
2. **Aplicar el esquema.** Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref <tu-project-ref>
   supabase db push
   ```
   Esto corre `supabase/migrations/0001_schema.sql` tal cual está en el repo.
3. **Copiar las credenciales** desde *Project Settings → API* a `.dev.vars`
   (copiá `.dev.vars.example`) para desarrollo local.
4. **Probar localmente:**
   ```bash
   npm install
   npm run dev
   ```
   Abrí `http://localhost:5173/registro` y creá una cuenta real. Si algo
   falla, `npm run build && wrangler dev` reproduce el entorno de Workers
   exacto.
5. **Crear la cuenta de Cloudflare** (si no tenés) en
   https://dash.cloudflare.com/sign-up — el plan gratuito alcanza según el
   análisis de `docs/01-arquitectura-y-stack.md`.
6. **Crear el bucket de R2** para fotos y adjuntos de certificados:
   ```bash
   npx wrangler login
   npx wrangler r2 bucket create skillboard-archivos
   ```
   (En desarrollo local no hace falta: `wrangler dev` emula R2 automáticamente.)
7. **Desplegar:**
   ```bash
   npm run deploy
   ```
   Wrangler te da la URL pública (`https://skillboard.<tu-cuenta>.workers.dev`)
   al terminar.
8. **Cargar los secretos en producción** (nunca van en `wrangler.jsonc`):
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put STORAGE_SIGNING_SECRET   # openssl rand -hex 32
   ```
   Y completá `SUPABASE_URL` / `SUPABASE_ANON_KEY` en `wrangler.jsonc`
   (`vars`, son públicas del lado del cliente, no hace falta ocultarlas).

## Verificar el aislamiento entre empresas

```bash
supabase start   # Postgres local con la migración aplicada
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=$(supabase status -o json | jq -r .ANON_KEY) \
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r .SERVICE_ROLE_KEY) \
npx vitest run supabase/tests/aislamiento.test.ts
```

## Algo para verificar apenas haya una base real

El perfil del empleado (`app/routes/app/empleados/perfil.tsx`) pide certificados
con `.select("*, tipos_certificado(nombre)")` sobre la **vista** `v_certificados`,
no sobre la tabla. PostgREST normalmente resuelve el embedding a través de
vistas simples, pero no lo pude probar contra un Postgres real en este
entorno (sin red hacia Supabase/Cloudflare). Si al probar `/empleados/:id`
la pestaña de certificados tira un error de relación no encontrada, la
solución es traer `tipo_id` y hacer una segunda consulta a `tipos_certificado`
en el loader en vez de embeber.

## Lo que falta después de esto (fuera de la Fase 0)

- Medir el tiempo de CPU por ruta con datos realistas (tarea explícita de la
  Fase 0 que solo se puede hacer contra un Worker desplegado de verdad).
- Copia de seguridad diaria (`pg_dump`) vía GitHub Action.
- Fase 1 en adelante: empleados, certificados, panel, carrusel, Tukson,
  y recién en la Fase 6 la página pública con precios, planes y legales
  que mencionaste — hoy `/` es un placeholder deliberado.
