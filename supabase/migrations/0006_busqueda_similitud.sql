-- Bug real encontrado al probar en vivo: 03-modulos-y-alcance.md pide que
-- buscar "peres" encuentre a "Pérez". Eso no es un caso de acento/mayúsculas
-- (que ILIKE + app.normalizar ya resolvía) — "peres" no es substring de
-- "perez", difieren en la última letra. Hace falta similitud por trigramas.
--
-- Y no alcanza con el operador `%` (similitud de la cadena ENTERA): contra
-- "juan perez op0143" la similitud de "peres" da 0.2, por debajo del umbral
-- por defecto de 0.3, así que no matchea. El operador correcto es `<%`
-- (word_similarity), que mide el parecido del término contra la MEJOR
-- palabra dentro de la cadena: ahí "peres" da 0.67 y sí matchea.
--
-- Orden de operandos: `termino <% texto_indexado` — la expresión indexada va
-- a la derecha para que el índice GIN de empleados_busqueda pueda usarse.
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
      or app.normalizar(p_termino) <% app.normalizar(nombre || ' ' || apellido || ' ' || id_interno)
    )
$$;
