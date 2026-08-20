-- Bug real encontrado al probar contra un proyecto vivo: RLS controla QUÉ
-- filas se ven, pero Postgres exige por separado el permiso de acceso a la
-- tabla/vista en sí (GRANT) antes de eso. Sin este paso, PostgREST devuelve
-- 401/42501 "permission denied" aunque las políticas RLS estén bien.
-- https://supabase.com/docs/guides/api/securing-your-api

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'empresas', 'membresias', 'invitaciones', 'departamentos', 'puestos',
    'aptitudes', 'tipos_certificado', 'empleados', 'empleado_aptitudes',
    'certificados', 'objetivos', 'objetivo_mediciones', 'lotes_asignacion',
    'tareas', 'asignaciones', 'correcciones_tukson', 'reglas_empresa',
    'carruseles', 'importaciones', 'auditoria', 'perfiles'
  ]
  loop
    execute format('grant select, insert, update, delete on table public.%I to authenticated', tabla);
  end loop;
end $$;

grant select on public.v_certificados to authenticated;
grant execute on function public.buscar_empleados(text) to authenticated;
