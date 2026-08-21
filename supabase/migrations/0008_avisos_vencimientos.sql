-- Fase 2, módulo 4: configuración de avisos por empresa y registro de las
-- corridas del cron.

create table config_avisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references empresas (id) on delete cascade,
  -- Vacío = se le manda a los propietarios/administradores de la empresa.
  destinatarios text[] not null default '{}',
  -- Además del umbral propio de cada tipo_certificado.dias_alerta.
  dias_anticipacion int not null default 30 check (dias_anticipacion between 1 and 365),
  frecuencia text not null default 'diaria' check (frecuencia in ('diaria', 'semanal', 'desactivada')),
  actualizado_en timestamptz not null default now()
);

-- Un email por empresa por corrida, nunca uno por certificado: además de ser
-- insoportable para quien lo recibe, agotaría el tope de 100 diarios de
-- Resend (03-modulos-y-alcance.md módulo 4).
create table avisos_enviados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  enviado_en timestamptz not null default now(),
  destinatarios text[] not null default '{}',
  vencidos int not null default 0,
  por_vencer int not null default 0,
  faltantes int not null default 0,
  estado text not null default 'enviado' check (estado in ('enviado', 'sin_novedades', 'error')),
  detalle text
);
create index on avisos_enviados (empresa_id, enviado_en desc);

alter table config_avisos enable row level security;
alter table avisos_enviados enable row level security;

create policy config_avisos_aislamiento on config_avisos
  for all
  using (empresa_id in (select app.empresas_del_usuario()))
  with check (empresa_id in (select app.empresas_del_usuario()));

-- Solo lectura desde la app: las filas las escribe el cron con service_role.
create policy avisos_enviados_lectura on avisos_enviados
  for select using (empresa_id in (select app.empresas_del_usuario()));

grant select, insert, update, delete on table public.config_avisos to authenticated;
grant select on table public.avisos_enviados to authenticated;

-- Devuelve, por empresa, todo lo que requiere atención hoy. Es la fuente
-- única del email y evita reimplementar la lógica de vencimientos en la
-- Edge Function. SECURITY DEFINER porque la llama el cron, sin sesión.
create or replace function app.resumen_vencimientos(p_empresa_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with conf as (
    select coalesce(
      (select dias_anticipacion from config_avisos where empresa_id = p_empresa_id),
      30
    ) as dias
  ),
  activos as (
    select id, nombre, apellido, id_interno, puesto_id
    from empleados
    where empresa_id = p_empresa_id and eliminado_en is null and estado <> 'baja'
  ),
  certs as (
    select
      v.estado,
      v.dias_restantes,
      t.nombre as tipo_nombre,
      e.nombre || ' ' || e.apellido as empleado,
      e.id_interno
    from v_certificados v
    join activos e on e.id = v.empleado_id
    join tipos_certificado t on t.id = v.tipo_id
    where v.empresa_id = p_empresa_id
  ),
  faltantes as (
    select
      e.nombre || ' ' || e.apellido as empleado,
      e.id_interno,
      t.nombre as tipo_nombre
    from tipos_certificado t
    join activos e on e.puesto_id = any(t.obligatorio_para_puestos)
    where t.empresa_id = p_empresa_id
      and array_length(t.obligatorio_para_puestos, 1) > 0
      and not exists (
        select 1 from v_certificados v
        where v.empleado_id = e.id and v.tipo_id = t.id
      )
  )
  select jsonb_build_object(
    'vencidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'empleado', empleado, 'id_interno', id_interno,
        'tipo', tipo_nombre, 'dias', dias_restantes
      ) order by dias_restantes)
      from certs where estado = 'vencido'
    ), '[]'::jsonb),
    'por_vencer', coalesce((
      select jsonb_agg(jsonb_build_object(
        'empleado', empleado, 'id_interno', id_interno,
        'tipo', tipo_nombre, 'dias', dias_restantes
      ) order by dias_restantes)
      from certs, conf
      where estado in ('por_vencer', 'vence_hoy') and dias_restantes <= conf.dias
    ), '[]'::jsonb),
    'faltantes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'empleado', empleado, 'id_interno', id_interno, 'tipo', tipo_nombre
      ) order by empleado)
      from faltantes
    ), '[]'::jsonb)
  )
$$;
