-- Umbral mínimo de puntaje para que Tukson asigne una tarea sola
-- (06-tukson-mejoras.md §1.3).
--
-- Hasta ahora, si el mejor candidato sacaba 20 sobre 100 se le asignaba la
-- tarea igual y se le presentaba al usuario como una recomendación. No lo es:
-- es lo único que había. Mostrarlo como propuesta hace que la persona deje de
-- confiar también en las que sí son buenas.
--
-- Por debajo del umbral la tarea no se asigna sola. El mejor disponible sigue
-- a la vista, con su puntaje, para asignarlo a mano si el responsable conoce
-- el caso.
create table config_tukson (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references empresas (id) on delete cascade,
  -- 45 y 60 son los valores del documento. Se pueden mover por empresa: un
  -- taller con cinco personas necesita ser más permisivo que una planta con
  -- ochenta.
  umbral_general int not null default 45 check (umbral_general between 0 and 100),
  -- Más exigente en las críticas: ahí el costo de equivocarse es mayor.
  umbral_critica int not null default 60 check (umbral_critica between 0 and 100),
  actualizado_en timestamptz not null default now(),
  -- Que el umbral de las críticas no quede por debajo del general sería una
  -- contradicción silenciosa: la tarea más importante pediría menos.
  constraint umbral_critica_no_menor check (umbral_critica >= umbral_general)
);

alter table config_tukson enable row level security;

create policy config_tukson_aislamiento on config_tukson
  for all
  using (empresa_id in (select app.empresas_del_usuario()))
  with check (empresa_id in (select app.empresas_del_usuario()));

grant select, insert, update, delete on table public.config_tukson to authenticated;
