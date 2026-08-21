-- La migración 0004 dio grants a `authenticated` pero no a `service_role`,
-- así que el cron de vencimientos no podía leer ni una tabla. service_role
-- saltea RLS, pero el permiso de acceso a la tabla (GRANT) es una capa
-- distinta y se exige igual.
do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'empresas', 'membresias', 'invitaciones', 'departamentos', 'puestos',
    'aptitudes', 'tipos_certificado', 'empleados', 'empleado_aptitudes',
    'certificados', 'objetivos', 'objetivo_mediciones', 'lotes_asignacion',
    'tareas', 'asignaciones', 'correcciones_tukson', 'reglas_empresa',
    'carruseles', 'importaciones', 'auditoria', 'perfiles',
    'config_avisos', 'avisos_enviados'
  ]
  loop
    execute format('grant select, insert, update, delete on table public.%I to service_role', tabla);
  end loop;
end $$;

grant select on public.v_certificados to service_role;
grant usage on schema app to service_role;
grant execute on function app.resumen_vencimientos(uuid) to service_role;
