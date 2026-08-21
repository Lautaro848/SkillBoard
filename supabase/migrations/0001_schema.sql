-- SkillBoard — esquema inicial (Fase 0)
-- Traducción directa de 02-modelo-de-datos.md. Cada tabla de negocio lleva
-- empresa_id y RLS activada: ver la sección "Aislamiento" al final.

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists citext;

create schema if not exists app;

-- =========================================================================
-- 1. Identidad y organización
-- =========================================================================

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 100),
  cuit text,
  slug text not null unique,
  logo_url text,
  plan text not null default 'prueba' check (plan in ('prueba', 'basico', 'profesional', 'empresa')),
  empleados_max int,
  prueba_hasta date,
  zona_horaria text not null default 'America/Argentina/Buenos_Aires',
  creada_en timestamptz not null default now()
);

-- Extensión de auth.users. id = auth.users.id (no FK física a auth: Supabase
-- puede reescribir ese esquema en una actualización de plataforma).
create table perfiles (
  id uuid primary key,
  nombre text not null,
  apellido text not null,
  email citext not null,
  telefono text,
  creado_en timestamptz not null default now()
);

create table membresias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  usuario_id uuid not null references perfiles (id) on delete cascade,
  rol text not null check (rol in ('propietario', 'administrador', 'supervisor', 'lector')),
  estado text not null default 'activa' check (estado in ('activa', 'suspendida')),
  creada_en timestamptz not null default now(),
  unique (empresa_id, usuario_id)
);

create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  email citext not null,
  rol text not null check (rol in ('administrador', 'supervisor', 'lector')),
  token_hash text not null,
  invitada_por uuid not null references perfiles (id),
  expira_en timestamptz not null default (now() + interval '72 hours'),
  aceptada_en timestamptz,
  creada_en timestamptz not null default now()
);

-- =========================================================================
-- 2. Catálogos por empresa
-- =========================================================================

create table departamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 50),
  creado_en timestamptz not null default now()
);
create unique index departamentos_nombre_unico on departamentos (empresa_id, lower(trim(nombre)));

create table puestos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 50),
  departamento_id uuid references departamentos (id),
  creado_en timestamptz not null default now()
);
create unique index puestos_nombre_unico on puestos (empresa_id, lower(trim(nombre)));

create table aptitudes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 50),
  categoria text check (categoria in ('tecnica', 'operativa', 'administrativa', 'blanda')),
  creado_en timestamptz not null default now()
);
create unique index aptitudes_nombre_unico on aptitudes (empresa_id, lower(trim(nombre)));

create table tipos_certificado (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 50),
  requiere_vencimiento boolean not null default true,
  dias_alerta int not null default 30,
  obligatorio_para_puestos uuid[] not null default '{}',
  creado_en timestamptz not null default now()
);
create unique index tipos_certificado_nombre_unico on tipos_certificado (empresa_id, lower(trim(nombre)));

-- =========================================================================
-- 3. Empleados
-- =========================================================================

create table empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  id_interno text not null check (id_interno ~ '^[A-Za-z0-9]{3,20}$'),
  nombre text not null check (nombre ~ '^[A-Za-zÀ-ÿñÑ\s\-'']{2,50}$'),
  apellido text not null check (apellido ~ '^[A-Za-zÀ-ÿñÑ\s\-'']{2,50}$'),
  email citext,
  telefono text check (telefono is null or char_length(telefono) between 8 and 20),
  fecha_nacimiento date not null,
  fecha_ingreso date not null,
  puesto_id uuid references puestos (id),
  departamento_id uuid references departamentos (id),
  estado text not null default 'activo' check (estado in ('activo', 'licencia', 'baja')),
  foto_url text,
  observaciones text check (observaciones is null or char_length(observaciones) <= 2000),
  creado_por uuid references perfiles (id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles (id),
  actualizado_en timestamptz not null default now(),
  eliminado_en timestamptz,
  constraint edad_valida check (fecha_nacimiento <= current_date - interval '16 years'
    and fecha_nacimiento >= current_date - interval '80 years'),
  constraint ingreso_valido check (fecha_ingreso <= current_date
    and fecha_ingreso >= fecha_nacimiento + interval '16 years')
);
create unique index empleados_id_interno_unico on empleados (empresa_id, upper(id_interno)) where eliminado_en is null;
create unique index empleados_email_unico on empleados (empresa_id, email) where eliminado_en is null and email is not null;

create table empleado_aptitudes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  aptitud_id uuid not null references aptitudes (id),
  nivel int not null check (nivel between 1 and 5),
  validado_por uuid references perfiles (id),
  validado_en timestamptz not null default now(),
  unique (empleado_id, aptitud_id)
);

-- =========================================================================
-- 4. Certificados
-- =========================================================================

create table certificados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  empleado_id uuid not null references empleados (id) on delete cascade,
  tipo_id uuid not null references tipos_certificado (id),
  numero text check (numero is null or char_length(numero) between 1 and 50),
  fecha_emision date not null check (fecha_emision <= current_date),
  fecha_vencimiento date,
  archivo_url text,
  entidad_emisora text,
  eliminado_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint vencimiento_posterior check (fecha_vencimiento is null or fecha_vencimiento > fecha_emision)
);

-- El estado (vigente/por_vencer/vencido) depende de current_date, así que NO
-- puede ser una columna generada (Postgres la rechaza por no-inmutable).
-- Se resuelve siempre en una vista para que nunca quede desactualizado.
create view v_certificados as
select
  c.*,
  case
    when c.fecha_vencimiento is null then 'sin_vencimiento'
    when c.fecha_vencimiento < current_date then 'vencido'
    when c.fecha_vencimiento = current_date then 'vence_hoy'
    when c.fecha_vencimiento <= current_date + (t.dias_alerta || ' days')::interval then 'por_vencer'
    else 'vigente'
  end as estado,
  (c.fecha_vencimiento - current_date) as dias_restantes
from certificados c
join tipos_certificado t on t.id = c.tipo_id
where c.eliminado_en is null;

-- =========================================================================
-- 5. Objetivos y rendimiento
-- =========================================================================

create table objetivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  descripcion text,
  periodicidad text not null check (periodicidad in ('semanal', 'mensual', 'trimestral', 'anual')),
  periodo_inicio date not null,
  periodo_fin date not null,
  unidad text not null check (unidad in ('cantidad', 'porcentaje', 'moneda', 'horas')),
  valor_inicial numeric not null,
  valor_objetivo numeric not null,
  direccion text not null check (direccion in ('aumentar', 'disminuir')),
  peso int not null default 1 check (peso between 1 and 5),
  responsable_id uuid references perfiles (id),
  estado text not null default 'activo' check (estado in ('activo', 'cerrado', 'cancelado')),
  creado_en timestamptz not null default now(),
  constraint periodo_valido check (periodo_fin > periodo_inicio)
);

create table objetivo_mediciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  objetivo_id uuid not null references objetivos (id) on delete cascade,
  fecha date not null default current_date,
  valor numeric not null,
  nota text,
  cargado_por uuid references perfiles (id),
  creado_en timestamptz not null default now()
);

-- =========================================================================
-- 6. Tareas y Tukson (Fase 5 — tablas creadas ahora para no migrar en caliente)
-- =========================================================================

create table lotes_asignacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  fecha date not null default current_date,
  origen text not null check (origen in ('texto', 'documento')),
  archivo_url text,
  estado text not null default 'borrador' check (estado in ('borrador', 'analizado', 'confirmado')),
  resumen text,
  creado_por uuid references perfiles (id),
  creado_en timestamptz not null default now()
);

create table tareas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  lote_id uuid not null references lotes_asignacion (id) on delete cascade,
  titulo text not null,
  descripcion text check (descripcion is null or char_length(descripcion) <= 2000),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'critica')),
  duracion_estimada_min int,
  aptitudes_requeridas uuid[] not null default '{}',
  certificados_requeridos uuid[] not null default '{}',
  departamento_sugerido_id uuid references departamentos (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'asignada', 'completada', 'cancelada')),
  creado_en timestamptz not null default now()
);

create table asignaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  tarea_id uuid not null references tareas (id) on delete cascade,
  empleado_id uuid not null references empleados (id),
  lote_id uuid not null references lotes_asignacion (id) on delete cascade,
  score numeric,
  justificacion text,
  origen text not null check (origen in ('ia', 'manual')),
  estado text not null default 'propuesta' check (estado in ('propuesta', 'confirmada', 'completada', 'cancelada')),
  creada_en timestamptz not null default now()
);

create table correcciones_tukson (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  asignacion_id uuid not null references asignaciones (id) on delete cascade,
  empleado_anterior_id uuid references empleados (id),
  empleado_nuevo_id uuid references empleados (id),
  motivo text not null,
  regla_generada_id uuid,
  creado_por uuid references perfiles (id),
  creado_en timestamptz not null default now()
);

create table reglas_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  tipo text not null check (tipo in ('exclusion', 'preferencia', 'prioridad', 'restriccion_horaria')),
  enunciado text not null,
  condiciones jsonb not null default '{}',
  peso int not null default 0 check (peso between -10 and 10),
  origen text not null check (origen in ('manual', 'derivada')),
  activa boolean not null default false,
  confirmada_por uuid references perfiles (id),
  creada_en timestamptz not null default now()
);

alter table correcciones_tukson
  add constraint correcciones_tukson_regla_fk foreign key (regla_generada_id) references reglas_empresa (id);

-- =========================================================================
-- 7. Operación
-- =========================================================================

create table carruseles (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nombre text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  filtros jsonb not null default '{}',
  campos_visibles jsonb not null default '{}',
  segundos_por_slide int not null default 10 check (segundos_por_slide between 5 and 60),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table importaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  archivo_nombre text not null,
  filas_total int not null default 0,
  filas_ok int not null default 0,
  filas_error int not null default 0,
  estado text not null default 'procesando' check (estado in ('procesando', 'completada', 'fallida')),
  reporte jsonb,
  creado_por uuid references perfiles (id),
  creado_en timestamptz not null default now()
);

-- Solo inserción: sin política de update/delete, ni para el propietario.
create table auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  usuario_id uuid references perfiles (id),
  entidad text not null,
  entidad_id uuid,
  accion text not null check (accion in ('alta', 'modificacion', 'baja', 'asignacion', 'importacion', 'acceso_carrusel')),
  datos_antes jsonb,
  datos_despues jsonb,
  ip text,
  creado_en timestamptz not null default now()
);

-- =========================================================================
-- 8. Aislamiento multiempresa (RLS)
-- =========================================================================

-- SECURITY DEFINER evita la recursión infinita al consultar membresias desde
-- su propia política. Vive en app, no en auth (Supabase puede reescribir auth).
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

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'empresas', 'membresias', 'invitaciones', 'departamentos', 'puestos',
    'aptitudes', 'tipos_certificado', 'empleados', 'empleado_aptitudes',
    'certificados', 'objetivos', 'objetivo_mediciones', 'lotes_asignacion',
    'tareas', 'asignaciones', 'correcciones_tukson', 'reglas_empresa',
    'carruseles', 'importaciones', 'auditoria'
  ]
  loop
    execute format('alter table %I enable row level security', tabla);
  end loop;
end $$;

-- `empresas` se filtra por su propio id, no por una columna empresa_id.
create policy empresas_aislamiento on empresas
  for all
  using (id in (select app.empresas_del_usuario()))
  with check (id in (select app.empresas_del_usuario()));

-- perfiles: cada usuario ve su propio perfil y el de compañeros de empresa.
create policy perfiles_lectura on perfiles
  for select
  using (
    id = auth.uid()
    or id in (
      select m2.usuario_id from membresias m1
      join membresias m2 on m2.empresa_id = m1.empresa_id
      where m1.usuario_id = auth.uid() and m1.estado = 'activa'
    )
  );
create policy perfiles_propio on perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Política estándar, idéntica para toda tabla con empresa_id.
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'membresias', 'invitaciones', 'departamentos', 'puestos', 'aptitudes',
    'tipos_certificado', 'empleados', 'empleado_aptitudes', 'certificados',
    'objetivos', 'objetivo_mediciones', 'lotes_asignacion', 'tareas',
    'asignaciones', 'correcciones_tukson', 'reglas_empresa', 'carruseles',
    'importaciones'
  ]
  loop
    execute format(
      'create policy %I_aislamiento on %I for all using (empresa_id in (select app.empresas_del_usuario())) with check (empresa_id in (select app.empresas_del_usuario()))',
      tabla, tabla
    );
  end loop;
end $$;

-- auditoria: solo lectura e inserción, nunca update/delete (ni el propietario).
create policy auditoria_lectura on auditoria
  for select using (empresa_id in (select app.empresas_del_usuario()));
create policy auditoria_insercion on auditoria
  for insert with check (empresa_id in (select app.empresas_del_usuario()));

-- =========================================================================
-- 9. Alta de empresa en una sola transacción (registro, módulo 1)
-- =========================================================================

-- Se dispara al crear la fila en auth.users. Los datos del formulario de
-- /registro viajan en raw_user_meta_data (options.data del signUp). Como los
-- triggers corren en la misma transacción que el INSERT en auth.users, un
-- error acá revierte también la creación del usuario: no queda una empresa
-- huérfana ni un usuario sin empresa.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva_empresa_id uuid;
  nombre_empresa text := new.raw_user_meta_data ->> 'empresa';
  base_slug text;
  slug_final text;
  sufijo int := 0;
begin
  insert into perfiles (id, nombre, apellido, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    new.email
  );

  base_slug := lower(regexp_replace(coalesce(nombre_empresa, 'empresa'), '[^a-z0-9]+', '-', 'gi'));
  slug_final := base_slug;
  while exists (select 1 from empresas where slug = slug_final) loop
    sufijo := sufijo + 1;
    slug_final := base_slug || '-' || sufijo;
  end loop;

  insert into empresas (nombre, slug, plan, empleados_max, prueba_hasta)
  values (coalesce(nombre_empresa, 'Mi empresa'), slug_final, 'prueba', 25, current_date + interval '30 days')
  returning id into nueva_empresa_id;

  insert into membresias (empresa_id, usuario_id, rol, estado)
  values (nueva_empresa_id, new.id, 'propietario', 'activa');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- =========================================================================
-- 10. Búsqueda tolerante a acentos (Regla 2)
-- =========================================================================

-- unaccent() no es inmutable (depende de un diccionario reemplazable), así
-- que no se puede usar directo dentro de un índice: hay que envolverla.
create or replace function app.normalizar(txt text)
returns text language sql immutable strict parallel safe as $$
  select lower(public.unaccent('public.unaccent', txt))
$$;

create index empleados_busqueda on empleados
  using gin (app.normalizar(nombre || ' ' || apellido || ' ' || id_interno) gin_trgm_ops);

-- =========================================================================
-- 11. Índices
-- =========================================================================

create index on empleados (empresa_id) where eliminado_en is null;
create index on empleados (empresa_id, puesto_id, departamento_id, estado);
create index on empleados (empresa_id, fecha_ingreso);
create index on certificados (empresa_id, fecha_vencimiento) where eliminado_en is null and fecha_vencimiento is not null;
create index on asignaciones (empresa_id, lote_id);
create index on auditoria (empresa_id, creado_en desc);
create index on membresias (usuario_id) where estado = 'activa';

-- =========================================================================
-- 12. Tope de empleados por plan
-- =========================================================================

create or replace function app.verificar_limite_empleados()
returns trigger language plpgsql as $$
declare
  actuales int;
  maximo int;
begin
  select count(*) into actuales from empleados
    where empresa_id = new.empresa_id and eliminado_en is null;
  select empleados_max into maximo from empresas where id = new.empresa_id;
  if maximo is not null and actuales >= maximo then
    raise exception 'LIMITE_EMPLEADOS_ALCANZADO';
  end if;
  return new;
end $$;

create trigger empleados_limite_plan
  before insert on empleados
  for each row execute function app.verificar_limite_empleados();

-- =========================================================================
-- 13. Auditoría por disparadores (nunca desde la aplicación)
-- =========================================================================

create or replace function app.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  accion_final text;
begin
  accion_final := case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'modificacion' else 'baja' end;
  insert into auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, datos_antes, datos_despues)
  values (
    coalesce(new.empresa_id, old.empresa_id),
    auth.uid(),
    tg_table_name,
    coalesce(new.id, old.id),
    accion_final,
    case when tg_op <> 'INSERT' then to_jsonb(old) else null end,
    case when tg_op <> 'DELETE' then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end $$;

do $$
declare
  tabla text;
begin
  foreach tabla in array array['empleados', 'certificados', 'objetivos']
  loop
    execute format(
      'create trigger %I_auditoria after insert or update or delete on %I for each row execute function app.registrar_auditoria()',
      tabla, tabla
    );
  end loop;
end $$;
