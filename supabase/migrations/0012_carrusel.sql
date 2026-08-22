-- Modo carrusel para TV (03-modulos-y-alcance.md, módulo 6).
--
-- La vista de TV es pública: se abre con un token, sin sesión. Por eso el
-- bloqueo de campos sensibles vive ACÁ, en la base, y no en el código de la
-- pantalla. Esta función solo puede devolver los campos permitidos porque son
-- los únicos que selecciona: no hay petición que se pueda manipular para
-- sacar un documento, un teléfono, una fecha de nacimiento o el número de un
-- certificado, porque la consulta que los leería no existe.
--
-- Los certificados vencidos tampoco salen. Exponer en el comedor que a Juan
-- se le venció el carnet lo expone frente a sus compañeros: eso es un
-- problema de recursos humanos, no un tablero.

create or replace function app.datos_carrusel(
  p_token text,
  p_ip text default null,
  p_registrar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_carrusel carruseles%rowtype;
  v_empresa empresas%rowtype;
  v_campos jsonb;
  v_filtros jsonb;
  v_manual boolean;
  v_empleados jsonb;
begin
  -- Un token corto no se busca: la longitud real son 48 caracteres hex.
  -- Evita convertir la función en un oráculo barato para probar cadenas.
  if p_token is null or char_length(p_token) < 32 then
    return null;
  end if;

  -- `activo` acá es lo que hace que apagar un carrusel corte la TV: la
  -- pantalla vuelve a pedir estos datos cada 30 segundos.
  select * into v_carrusel from carruseles where token = p_token and activo;
  if not found then
    return null;
  end if;

  select * into v_empresa from empresas where id = v_carrusel.empresa_id;

  v_campos := coalesce(v_carrusel.campos_visibles, '{}'::jsonb);
  v_filtros := coalesce(v_carrusel.filtros, '{}'::jsonb);
  -- La selección manual gana sobre los filtros por departamento y puesto:
  -- si alguien eligió doce personas a mano, quiso esas doce.
  v_manual := jsonb_array_length(coalesce(v_filtros -> 'empleados', '[]'::jsonb)) > 0;

  select coalesce(jsonb_agg(fila order by orden_apellido, orden_nombre), '[]'::jsonb)
  into v_empleados
  from (
    select
      e.apellido as orden_apellido,
      e.nombre as orden_nombre,
      jsonb_build_object(
        -- Se manda el uuid, no el id interno: alcanza como semilla del color
        -- del avatar y no es un dato del legajo.
        'id', e.id,
        'nombre', e.nombre,
        'apellido', e.apellido,
        'fotoKey', case when coalesce((v_campos ->> 'foto')::boolean, true) then e.foto_url end,
        'puesto', case when coalesce((v_campos ->> 'puesto')::boolean, true) then p.nombre end,
        'departamento', case when coalesce((v_campos ->> 'departamento')::boolean, true) then d.nombre end,
        'fechaIngreso', case when coalesce((v_campos ->> 'antiguedad')::boolean, true) then e.fecha_ingreso end,
        'certificados', case
          when coalesce((v_campos ->> 'certificados')::boolean, false) then (
            -- Solo el tipo, nunca el número, y nada vencido.
            --
            -- Se excluye `vencido` y nada más. Un certificado en estado
            -- `por_vencer` sigue siendo válido hoy: sacarlo de la TV
            -- mostraría como no capacitada a alguien que sí lo está, y el
            -- aviso de renovación es un asunto interno, no de la pantalla
            -- del comedor.
            select coalesce(jsonb_agg(distinct t.nombre), '[]'::jsonb)
            from v_certificados vc
            join tipos_certificado t on t.id = vc.tipo_id
            where vc.empleado_id = e.id
              and vc.estado <> 'vencido'
          )
          else '[]'::jsonb
        end
      ) as fila
    from empleados e
    left join puestos p on p.id = e.puesto_id
    left join departamentos d on d.id = e.departamento_id
    where e.empresa_id = v_carrusel.empresa_id
      and e.eliminado_en is null
      and e.estado <> 'baja'
      and (
        case
          when v_manual then
            e.id::text in (select jsonb_array_elements_text(v_filtros -> 'empleados'))
          else
            (
              jsonb_array_length(coalesce(v_filtros -> 'departamentos', '[]'::jsonb)) = 0
              or e.departamento_id::text in (select jsonb_array_elements_text(v_filtros -> 'departamentos'))
            )
            and (
              jsonb_array_length(coalesce(v_filtros -> 'puestos', '[]'::jsonb)) = 0
              or e.puesto_id::text in (select jsonb_array_elements_text(v_filtros -> 'puestos'))
            )
        end
      )
  ) s;

  -- Cada acceso queda registrado con IP. Se deduplica por hora para que el
  -- refresco cada 30 segundos no llene la auditoría con la misma TV.
  if p_registrar then
    insert into auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, ip)
    select v_carrusel.empresa_id, null, 'carruseles', v_carrusel.id, 'acceso_carrusel', p_ip
    where not exists (
      select 1 from auditoria a
      where a.entidad = 'carruseles'
        and a.entidad_id = v_carrusel.id
        and a.accion = 'acceso_carrusel'
        and coalesce(a.ip, '') = coalesce(p_ip, '')
        and a.creado_en > now() - interval '1 hour'
    );
  end if;

  return jsonb_build_object(
    'carrusel', jsonb_build_object(
      'nombre', v_carrusel.nombre,
      'segundosPorSlide', v_carrusel.segundos_por_slide,
      'empresa', v_empresa.nombre,
      'logoKey', v_empresa.logo_url,
      'campos', jsonb_build_object(
        'foto', coalesce((v_campos ->> 'foto')::boolean, true),
        'puesto', coalesce((v_campos ->> 'puesto')::boolean, true),
        'departamento', coalesce((v_campos ->> 'departamento')::boolean, true),
        'antiguedad', coalesce((v_campos ->> 'antiguedad')::boolean, true),
        'certificados', coalesce((v_campos ->> 'certificados')::boolean, false)
      )
    ),
    'empleados', v_empleados
  );
end;
$$;

-- Nadie llama a la función interna directo: la pública es la que audita.
revoke all on function app.datos_carrusel(text, text, boolean) from public;

create or replace function public.carrusel_datos(
  p_token text,
  p_ip text default null,
  p_registrar boolean default false
)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.datos_carrusel(p_token, p_ip, p_registrar);
$$;

-- Esta sí la llama `anon`: es el único camino de datos de la vista de TV, que
-- no tiene sesión. Devuelve null ante un token inválido, rotado o apagado.
revoke all on function public.carrusel_datos(text, text, boolean) from public;
grant execute on function public.carrusel_datos(text, text, boolean) to anon, authenticated, service_role;
