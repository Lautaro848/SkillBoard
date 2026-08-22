-- Tukson (04-tukson.md). Lo que el esquema original no previó.

-- 1. Capacidad diaria del empleado.
--
-- El componente de disponibilidad del puntaje (0–15) es lo que evita que el
-- mejor empleado se lleve las quince tareas del día. Sin este dato habría que
-- suponer ocho horas para todo el mundo, y media jornada es común.
alter table empleados
  add column if not exists capacidad_diaria_min int not null default 480
    check (capacidad_diaria_min between 60 and 720);

comment on column empleados.capacidad_diaria_min is
  'Minutos de jornada. Alimenta el reparto de carga de Tukson.';

-- 2. El departamento de una tarea puede ser sugerencia o requisito.
--
-- La diferencia decide si el filtro duro descarta al que no pertenece o si
-- solo le resta puntos. Como requisito es una exclusión, y una exclusión mal
-- puesta deja tareas sin candidatos, así que por defecto es sugerencia.
alter table tareas
  add column if not exists departamento_es_requisito boolean not null default false;

-- 3. El desglose del puntaje se guarda entero, no solo el total.
--
-- Cuando alguien pregunta "¿por qué él?", la respuesta tiene que ser el
-- desglose numérico con el que se decidió en ese momento. Recalcularlo después
-- daría otro número: las aptitudes, la carga y las reglas cambian.
alter table asignaciones
  add column if not exists desglose jsonb;

-- 4. Registro de uso del modelo de lenguaje.
--
-- Sin esto no se puede fijar el precio del producto con fundamento
-- (04-tukson.md §4). Se registra cada llamada, incluidas las que fallan:
-- una llamada que falló igual costó latencia y a veces tokens.
create table if not exists uso_ia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  lote_id uuid references lotes_asignacion (id) on delete set null,
  paso text not null check (paso in ('estructuracion', 'asignacion', 'regla')),
  proveedor text not null,
  modelo text not null,
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  costo_usd numeric(10, 6) not null default 0,
  latencia_ms int not null default 0,
  exito boolean not null default true,
  detalle text,
  creado_en timestamptz not null default now()
);

alter table uso_ia enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'uso_ia' and policyname = 'uso_ia_aislamiento') then
    create policy uso_ia_aislamiento on uso_ia
      for all
      using (empresa_id in (select app.empresas_del_usuario()))
      with check (empresa_id in (select app.empresas_del_usuario()));
  end if;
end $$;

-- Los GRANT son una capa aparte de RLS: sin esto la política es perfecta y
-- la tabla igual devuelve "permission denied". Ya nos pasó tres veces.
grant select, insert on public.uso_ia to authenticated;
grant select, insert, update, delete on public.uso_ia to service_role;

create index if not exists uso_ia_empresa_fecha on uso_ia (empresa_id, creado_en desc);

-- 5. Índices para las consultas que Tukson hace en cada lote.
create index if not exists asignaciones_empleado on asignaciones (empleado_id, estado);
create index if not exists tareas_lote on tareas (lote_id);
create index if not exists reglas_empresa_activas on reglas_empresa (empresa_id) where activa;
