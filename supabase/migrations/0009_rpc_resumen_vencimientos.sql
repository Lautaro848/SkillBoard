-- PostgREST solo expone funciones del esquema public, y la Edge Function del
-- cron la llama por rpc(). El wrapper vive en public; la lógica sigue en app.
--
-- Solo service_role puede ejecutarla: devuelve datos de CUALQUIER empresa
-- (recibe el empresa_id por parámetro), así que no debe quedar al alcance de
-- un usuario autenticado, que podría pasar el id de otra empresa.
create or replace function public.resumen_vencimientos(p_empresa_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select app.resumen_vencimientos(p_empresa_id)
$$;

revoke all on function public.resumen_vencimientos(uuid) from public, anon, authenticated;
grant execute on function public.resumen_vencimientos(uuid) to service_role;
