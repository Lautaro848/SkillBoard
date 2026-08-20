-- RPC de búsqueda tolerante a acentos para el listado de empleados
-- (03-modulos-y-alcance.md módulo 2). PostgREST no permite aplicar
-- app.normalizar() sobre una columna dentro de un filtro .ilike() del
-- cliente, así que la comparación normalizada vive en esta función; el resto
-- de los filtros (puesto, departamento, estado, rango de fechas) se siguen
-- encadenando desde supabase-js sobre el resultado, porque PostgREST permite
-- filtrar por columnas de una función que devuelve `setof empleados`.
--
-- SECURITY INVOKER (el valor por defecto): corre con los permisos de quien
-- llama, así que las políticas RLS de "empleados" se siguen aplicando solas.
--
-- Va en public (no en app) a propósito: PostgREST solo expone funciones
-- llamables por supabase.rpc() del esquema public por defecto.
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
    )
$$;
