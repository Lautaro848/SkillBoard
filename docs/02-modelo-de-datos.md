# SkillBoard — Modelo de datos y aislamiento multiempresa

Versión 1.1 · 19/08/2026 · Estado: propuesta a aprobar

---

## 1. Principio de aislamiento

SkillBoard es multiempresa sobre una única base de datos. Dos empresas comparten tablas pero **nunca** pueden ver los datos de la otra. Esto se garantiza en tres capas, y las tres son obligatorias:

1. **Toda tabla de negocio tiene `empresa_id`.** Sin excepción. Incluso donde parece redundante (una asignación ya llega a la empresa a través de la tarea), se repite. La redundancia es deliberada: permite que la política de seguridad sea una sola línea idéntica en todas las tablas y evita consultas encadenadas dentro de las políticas, que es donde se cuelan los errores.
2. **Row Level Security activada en todas las tablas.** Postgres filtra por empresa antes de que la consulta llegue a la aplicación. Aunque un programador olvide un `where`, la base no devuelve datos ajenos.
3. **La aplicación nunca acepta `empresa_id` del cliente.** Se deriva siempre de la sesión en el servidor. Un `empresa_id` que llega en el cuerpo de una petición se ignora, no se valida: se ignora.

### La función que sostiene todo

```sql
-- Devuelve las empresas a las que pertenece el usuario autenticado.
-- SECURITY DEFINER evita la recursión infinita: si la política de "membresias"
-- consultara "membresias" para decidir si puede leer "membresias", Postgres
-- entra en bucle. Este es el error clásico de RLS multiempresa.
--
-- Va en un esquema propio (app), NO en el esquema auth: auth lo administra
-- Supabase y su contenido puede reescribirse en una actualización de la
-- plataforma, llevándose la función y dejando todas las políticas rotas.
create schema if not exists app;

create or replace function app.empresas_del_usuario()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select empresa_id
  from membresias
  where usuario_id = auth.uid()
    and estado = 'activa'
$$;
```

Política estándar, idéntica en toda tabla de negocio:

```sql
alter table empleados enable row level security;

create policy empleados_aislamiento on empleados
  for all
  using  (empresa_id in (select app.empresas_del_usuario()))
  with check (empresa_id in (select app.empresas_del_usuario()));
```

> **Prueba obligatoria antes de considerar terminada la Fase 0:** un test automatizado crea dos empresas con datos, se autentica como usuario de la empresa A e intenta leer, modificar y borrar filas de la empresa B por todos los caminos posibles. Si alguno devuelve algo distinto de vacío o error, la fase no está terminada.

---

## 2. Diagrama de relaciones

```
empresas
 ├── membresias ──── perfiles ──── auth.users (Supabase)
 ├── invitaciones
 ├── departamentos ──┐
 ├── puestos ────────┤
 ├── aptitudes ──────┤
 ├── tipos_certificado
 │                   │
 ├── empleados ◄─────┘
 │    ├── empleado_aptitudes ──── aptitudes
 │    └── certificados ────────── tipos_certificado
 │
 ├── objetivos
 │    └── objetivo_mediciones
 │
 ├── lotes_asignacion
 │    ├── tareas
 │    └── asignaciones ──── empleados
 │         └── correcciones_tukson
 ├── reglas_empresa
 ├── carruseles
 ├── importaciones
 └── auditoria
```

---

## 3. Tablas

### Identidad y organización

**`empresas`** — el inquilino (tenant).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text | 2–100 caracteres |
| `cuit` | text | opcional, validado con dígito verificador si se carga |
| `slug` | text UNIQUE | usado en URLs, minúsculas, sin espacios |
| `logo_url` | text | opcional, Regla 1: branding |
| `plan` | text | `prueba` · `basico` · `profesional` · `empresa` |
| `empleados_max` | int | tope según el plan; validado en cada alta |
| `prueba_hasta` | date | fin del período de prueba |
| `zona_horaria` | text | por defecto `America/Argentina/Buenos_Aires` |
| `creada_en` | timestamptz | |

**`perfiles`** — extensión de `auth.users`. `id` es la clave foránea a `auth.users.id`. Contiene nombre, apellido, email y teléfono del usuario del sistema (no del empleado).

**`membresias`** — quién pertenece a qué empresa y con qué permisos.

| Columna | Tipo | Notas |
|---|---|---|
| `empresa_id`, `usuario_id` | uuid | UNIQUE juntas |
| `rol` | text | `propietario` · `administrador` · `supervisor` · `lector` |
| `estado` | text | `activa` · `suspendida` |

Permisos por rol:

| Acción | Propietario | Administrador | Supervisor | Lector |
|---|:--:|:--:|:--:|:--:|
| Ver empleados y certificados | ✓ | ✓ | ✓ | ✓ |
| Crear y editar empleados | ✓ | ✓ | ✓ | — |
| Eliminar empleados | ✓ | ✓ | — | — |
| Importar en lote | ✓ | ✓ | — | — |
| Definir objetivos | ✓ | ✓ | — | — |
| Usar Tukson | ✓ | ✓ | ✓ | — |
| Confirmar reglas aprendidas | ✓ | ✓ | — | — |
| Invitar usuarios y cambiar plan | ✓ | — | — | — |

**`invitaciones`** — email, rol, `token_hash` (nunca el token en claro), `expira_en` (72 h), `aceptada_en`.

### Catálogos por empresa

`departamentos`, `puestos`, `aptitudes`, `tipos_certificado`. Todos con `empresa_id`, `nombre` (2–50 caracteres) y un índice único **insensible a mayúsculas** para cumplir la Regla 3:

```sql
create unique index puestos_nombre_unico
  on puestos (empresa_id, lower(trim(nombre)));
```

`tipos_certificado` además lleva `requiere_vencimiento` (booleano), `dias_alerta` (por defecto 30) y `obligatorio_para_puestos` (arreglo de uuid) — este último es lo que permite a Tukson descartar candidatos sin el carnet exigido y al dashboard avisar "3 empleados del puesto Operario de grúa no tienen el carnet obligatorio".

`aptitudes` lleva `categoria` (`tecnica` · `operativa` · `administrativa` · `blanda`).

### Empleados

**`empleados`**

| Columna | Tipo | Validación (Regla 3) |
|---|---|---|
| `id` | uuid PK | |
| `empresa_id` | uuid | |
| `id_interno` | text | alfanumérico 3–20, normalizado a mayúsculas, **único por empresa** |
| `nombre`, `apellido` | text | `^[A-Za-zÀ-ÿñÑ\s\-']{2,50}$`, capitalización automática |
| `email` | citext | RFC 5322 con librería, minúsculas, único por empresa, **opcional** |
| `telefono` | text | 8–20 caracteres, solo dígitos, espacios, guiones, paréntesis y `+` |
| `fecha_nacimiento` | date | entre 16 y 80 años a la fecha actual |
| `fecha_ingreso` | date | no futura, posterior al nacimiento + 16 años |
| `puesto_id`, `departamento_id` | uuid | referencia al catálogo |
| `estado` | text | `activo` · `licencia` · `baja` |
| `foto_url` | text | WebP 400×400 generado al subir |
| `observaciones` | text | máximo 2000 caracteres |
| `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en` | | Regla 4: trazabilidad |
| `eliminado_en` | timestamptz | **borrado lógico** |

> **Decisión: los empleados no se borran físicamente.** Un empleado eliminado se marca con `eliminado_en` y desaparece de listados y del carrusel, pero sus certificados y su historial de asignaciones sobreviven para auditoría. La Regla 2 pide confirmación explícita al eliminar; el borrado lógico además hace que ese error sea reversible por soporte. Las políticas RLS y todas las vistas filtran `eliminado_en is null`.

**`empleado_aptitudes`** — `empleado_id`, `aptitud_id`, `nivel` (1 a 5, con etiquetas: 1 En formación, 2 Básico, 3 Competente, 4 Avanzado, 5 Referente), `validado_por`, `validado_en`.

El nivel es el insumo principal de Tukson. Una aptitud sin nivel no sirve para asignar tareas, así que el nivel es obligatorio al asociar la aptitud.

### Certificados

**`certificados`**

| Columna | Tipo | Validación |
|---|---|---|
| `empleado_id`, `tipo_id`, `empresa_id` | uuid | |
| `numero` | text | opcional, 1–50 |
| `fecha_emision` | date | **no puede ser futura** |
| `fecha_vencimiento` | date | **posterior a la emisión**; nula si el tipo no vence |
| `archivo_url` | text | PDF/JPG/PNG, máximo 10 MB, tipo MIME verificado |
| `entidad_emisora` | text | opcional |

Restricciones a nivel de base, no solo de formulario:

```sql
alter table certificados
  add constraint emision_no_futura check (fecha_emision <= current_date),
  add constraint vencimiento_posterior
      check (fecha_vencimiento is null or fecha_vencimiento > fecha_emision);
```

> **Detalle técnico que importa:** el estado del certificado (`vigente` / `por_vencer` / `vencido`) **no puede ser una columna generada**, porque depende de `current_date`, que Postgres considera no inmutable y rechaza en `generated always as`. Se resuelve con una vista:

```sql
create view v_certificados as
select c.*,
  case
    when c.fecha_vencimiento is null then 'sin_vencimiento'
    when c.fecha_vencimiento <  current_date then 'vencido'
    when c.fecha_vencimiento <= current_date + (t.dias_alerta || ' days')::interval
      then 'por_vencer'
    else 'vigente'
  end as estado,
  (c.fecha_vencimiento - current_date) as dias_restantes
from certificados c
join tipos_certificado t on t.id = c.tipo_id
where c.eliminado_en is null;
```

Guardar el estado en una columna y actualizarlo con un cron sería más rápido de consultar, pero introduce el peor error posible en este producto: **un certificado vencido que el sistema sigue mostrando como vigente porque el cron falló.** La vista siempre dice la verdad.

### Objetivos y rendimiento

**`objetivos`** — `nombre`, `descripcion`, `periodicidad` (`semanal` · `mensual` · `trimestral` · `anual`), `periodo_inicio`, `periodo_fin`, `unidad` (`cantidad` · `porcentaje` · `moneda` · `horas`), `valor_inicial`, `valor_objetivo`, `direccion` (`aumentar` · `disminuir`), `peso` (1–5, para el promedio ponderado), `responsable_id`, `estado`.

**`objetivo_mediciones`** — `objetivo_id`, `fecha`, `valor`, `nota`, `cargado_por`. Cada carga es una fila nueva; nunca se sobrescribe. De acá sale el gráfico de evolución y la flecha de subida o bajada.

### Tareas y Tukson

**`lotes_asignacion`** — una corrida de Tukson: `fecha`, `origen` (`texto` · `documento`), `archivo_url`, `estado` (`borrador` · `analizado` · `confirmado`), `creado_por`, `resumen`.

**`tareas`** — `lote_id`, `titulo`, `descripcion` (≤2000), `prioridad` (`baja` · `media` · `alta` · `critica`), `duracion_estimada_min`, `aptitudes_requeridas` (uuid[]), `certificados_requeridos` (uuid[]), `departamento_sugerido_id`, `estado`.

**`asignaciones`** — `tarea_id`, `empleado_id`, `lote_id`, `score` (numeric), `justificacion` (texto que ve el usuario), `origen` (`ia` · `manual`), `estado` (`propuesta` · `confirmada` · `completada` · `cancelada`).

**`correcciones_tukson`** — `asignacion_id`, `empleado_anterior_id`, `empleado_nuevo_id`, `motivo` (texto libre del usuario, obligatorio), `regla_generada_id`, `creado_por`.

**`reglas_empresa`** — la memoria de Tukson. `tipo` (`exclusion` · `preferencia` · `prioridad` · `restriccion_horaria`), `enunciado` (texto legible: "Juan Pérez no realiza tareas en altura"), `condiciones` (jsonb estructurado que sí se puede evaluar en código), `peso` (−10 a +10), `origen` (`manual` · `derivada`), `activa`, `confirmada_por`, `creada_en`.

> **La regla se guarda como `activa = false` hasta que un administrador la confirma.** Tukson propone la regla en lenguaje claro; una persona decide si es cierta. Sin esto, un motivo escrito de apuro ("hoy no") se convierte en una regla permanente y el sistema empeora solo.

### Operación

**`carruseles`** — `nombre`, `token` (aleatorio, rotable), `filtros` (jsonb), `campos_visibles` (jsonb), `segundos_por_slide` (5–60), `activo`.

**`importaciones`** — `archivo_nombre`, `filas_total`, `filas_ok`, `filas_error`, `estado`, `reporte` (jsonb con el detalle fila por fila), `creado_por`.

**`auditoria`** — `empresa_id`, `usuario_id`, `entidad`, `entidad_id`, `accion` (`alta` · `modificacion` · `baja` · `asignacion` · `importacion` · `acceso_carrusel`), `datos_antes` (jsonb), `datos_despues` (jsonb), `ip`, `creado_en`.

Se escribe con disparadores (triggers), no desde la aplicación. Un `insert` hecho desde la consola de Supabase también queda registrado. La tabla es de solo inserción: no hay política de `update` ni `delete`, ni siquiera para el propietario.

---

## 4. Índices necesarios

```sql
-- Todo filtro empieza por empresa
create index on empleados (empresa_id) where eliminado_en is null;
create index on empleados (empresa_id, puesto_id, departamento_id, estado);
create index on empleados (empresa_id, fecha_ingreso);          -- filtro por antigüedad

-- Búsqueda por nombre en español, tolerante a acentos.
-- unaccent() NO es inmutable (depende de un diccionario que puede cambiar),
-- así que Postgres la rechaza dentro de un índice. Hay que envolverla.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create or replace function app.normalizar(txt text)
returns text language sql immutable strict parallel safe as $$
  select lower(public.unaccent('public.unaccent', txt))
$$;

create index empleados_busqueda on empleados
  using gin (app.normalizar(nombre || ' ' || apellido || ' ' || id_interno)
             gin_trgm_ops);

-- La consulta más caliente del producto: vencimientos próximos
create index on certificados (empresa_id, fecha_vencimiento)
  where eliminado_en is null and fecha_vencimiento is not null;

create index on asignaciones (empresa_id, lote_id);
create index on auditoria (empresa_id, creado_en desc);
```

El índice de búsqueda con `app.normalizar` + trigramas es lo que permite que escribir "peres" encuentre a "Pérez" y que los resultados se actualicen mientras el usuario tipea, como pide la Regla 2.

---

## 5. Planes y límite de empleados

| Plan | Empleados | Usuarios | Carruseles | Tukson |
|---|---|---|---|---|
| Prueba (30 días) | 25 | 2 | 1 | 10 lotes |
| Básico | 50 | 3 | 1 | 30 lotes/mes |
| Profesional | 200 | 10 | 3 | Sin límite |
| Empresa | Sin límite | Sin límite | Sin límite | Sin límite |

El tope se valida **en el servidor y en la base**, no en el formulario:

```sql
create or replace function verificar_limite_empleados()
returns trigger language plpgsql as $$
declare
  actuales int; maximo int;
begin
  select count(*) into actuales from empleados
    where empresa_id = new.empresa_id and eliminado_en is null;
  select empleados_max into maximo from empresas where id = new.empresa_id;
  if maximo is not null and actuales >= maximo then
    raise exception 'LIMITE_EMPLEADOS_ALCANZADO';
  end if;
  return new;
end $$;
```

La aplicación traduce `LIMITE_EMPLEADOS_ALCANZADO` a un mensaje que enseña, como pide la Regla 2: *"Tu plan Básico permite hasta 50 empleados y ya tenés 50 cargados. Podés dar de baja a un empleado inactivo o ampliar el plan para seguir sumando."* — nunca el error crudo de Postgres.

---

## 6. Convenciones no negociables

- Toda consulta a través de `supabase-js` con la clave anónima **y el JWT del usuario en la cabecera `Authorization`**, para que Postgres resuelva `auth.uid()` y las políticas RLS se apliquen solas. **Prohibida la conexión TCP directa a Postgres** (Hyperdrive, Drizzle, postgres.js) para el acceso general: entra como rol de base de datos, `auth.uid()` queda vacío y RLS no se aplica. Se reserva únicamente para informes pesados en código de servidor con el `empresa_id` fijado y revisado.
- **La clave de servicio (`service_role`) se usa únicamente en el cron de vencimientos y en el importador**, en código de servidor, jamás en una ruta accesible desde el navegador.
- `foto_url` y `archivo_url` guardan la **clave del objeto en R2**, no una URL completa. Las URLs se firman al momento de servirlas, con vencimiento corto. Así un enlace filtrado deja de funcionar y el proveedor de almacenamiento se puede cambiar sin migrar datos.
- Todas las fechas se guardan en `date` o `timestamptz` en UTC y se formatean a `dd/mm/aaaa` recién en la capa de presentación, con la zona horaria de la empresa.
- Todo texto se recorta (`trim`) antes de validar y guardar, en el esquema Zod compartido, así que sucede en las dos capas por construcción.
- Ninguna tabla usa identificadores secuenciales expuestos. Todo es uuid: un `/empleados/1` invita a probar `/empleados/2`.
