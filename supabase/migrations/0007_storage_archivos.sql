-- Reemplaza a Cloudflare R2 por Supabase Storage: es la única pieza del
-- stack que ataba el proyecto a Cloudflare. Supabase Storage funciona igual
-- desde Vercel, Hostinger o Workers, así que el hosting deja de ser una
-- decisión irreversible.
--
-- Bucket privado: nada es accesible sin una URL firmada de vida corta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'archivos',
  'archivos',
  false,
  10485760, -- 10 MB: el tope de los adjuntos de certificado (02-modelo-de-datos.md)
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Las claves de objeto son `<empresa_id>/empleados/<id>/foto-...webp`, así que
-- el primer segmento del path identifica la empresa dueña del archivo. Eso
-- permite aplicar el MISMO aislamiento multiempresa del resto del esquema
-- (02-modelo-de-datos.md §1) también sobre los archivos: un usuario de la
-- empresa A no puede leer ni escribir objetos bajo el prefijo de la empresa B,
-- aunque adivine la ruta exacta.
create policy archivos_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'archivos'
    and (storage.foldername(name))[1]::uuid in (select app.empresas_del_usuario())
  );

create policy archivos_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'archivos'
    and (storage.foldername(name))[1]::uuid in (select app.empresas_del_usuario())
  );

create policy archivos_actualizacion on storage.objects
  for update to authenticated
  using (
    bucket_id = 'archivos'
    and (storage.foldername(name))[1]::uuid in (select app.empresas_del_usuario())
  );

create policy archivos_borrado on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'archivos'
    and (storage.foldername(name))[1]::uuid in (select app.empresas_del_usuario())
  );
