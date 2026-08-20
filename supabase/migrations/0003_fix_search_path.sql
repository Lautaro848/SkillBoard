-- El linter de seguridad de Supabase marcó que a estas dos funciones les
-- faltó fijar search_path (a diferencia de las demás en 0001_schema.sql).
-- Sin esto, un role con permisos para crear objetos en un esquema temprano
-- del search_path podría hacer que la función resuelva a una función
-- distinta a la que se espera (function search-path hijacking).

create or replace function app.normalizar(txt text)
returns text language sql immutable strict parallel safe
set search_path = public
as $$
  select lower(public.unaccent('public.unaccent', txt))
$$;

create or replace function app.verificar_limite_empleados()
returns trigger language plpgsql
set search_path = public
as $$
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
