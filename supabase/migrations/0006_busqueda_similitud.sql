-- Bug real encontrado al probar en vivo: 03-modulos-y-alcance.md pide que
-- buscar "peres" encuentre a "Pérez". Eso no es un simple caso de acento/
-- mayúsculas (que ya resolvía ILIKE + app.normalizar) — "peres" no es
-- substring de "perez", difieren en la última letra. Hace falta similitud
-- por trigramas (el operador `%` de pg_trgm, que ya estaba instalado y es
-- la razón de ser del índice GIN de empleados_busqueda), no solo ILIKE.
create or replace function public.buscar_empleados(p_termino text default '')
returns setof empleados
language sql
stable
set search_path = public
as $$
  select *
  from empleados
  where eliminado_en is null
    and (
      p_termino = ''
      or app.normalizar(nombre || ' ' || apellido || ' ' || id_interno) ilike '%' || app.normalizar(p_termino) || '%'
      or app.normalizar(nombre || ' ' || apellido || ' ' || id_interno) % app.normalizar(p_termino)
    )
$$;
