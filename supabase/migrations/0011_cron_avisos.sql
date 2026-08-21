-- pg_cron dispara el aviso diario. Se prefiere sobre un cron externo porque,
-- además de la tarea, la actividad diaria evita que Supabase pause el
-- proyecto por inactividad (01-arquitectura-y-stack.md §1).
--
-- El token del header es la anon key (pública, protegida por RLS). La Edge
-- Function usa service_role internamente, no este token.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 11:00 UTC = 08:00 en Argentina (UTC-3), la hora que pide el módulo 4.
select cron.schedule(
  'avisar-vencimientos-diario',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://bdufwbssueduudhbwzim.supabase.co/functions/v1/avisar-vencimientos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkdWZ3YnNzdWVkdXVkaGJ3emltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTc0ODMsImV4cCI6MjEwMjgzMzQ4M30.tbm6hVRmzBNzhaIm0ml7RHg4-jGIv6k0-WOgGRG0thg'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Criterio de aceptación del módulo 4: "si el cron no corre dos días
-- seguidos, se envía una alerta". Sin esto, el modo de falla más peligroso
-- del producto es silencioso — los avisos dejan de salir y nadie se entera
-- hasta que a alguien se le vence un carnet.
create or replace function app.verificar_cron_avisos()
returns table (empresa_id uuid, empresa text, ultima_corrida timestamptz, dias_sin_correr int)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id,
    e.nombre,
    max(a.enviado_en),
    coalesce(extract(day from now() - max(a.enviado_en))::int, 999)
  from empresas e
  left join avisos_enviados a on a.empresa_id = e.id
  group by e.id, e.nombre
  having max(a.enviado_en) is null or max(a.enviado_en) < now() - interval '2 days'
$$;

grant execute on function app.verificar_cron_avisos() to service_role;
