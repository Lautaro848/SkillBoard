-- public.buscar_empleados es SECURITY INVOKER a propósito (para que las
-- políticas RLS se apliquen con los permisos de quien llama, no del dueño
-- de la función). Eso significa que el rol que llama necesita, además del
-- EXECUTE ya otorgado sobre la función pública, permiso para tocar todo lo
-- que esa función usa por dentro: el esquema app y app.normalizar().
grant usage on schema app to authenticated;
grant execute on function app.normalizar(text) to authenticated;
