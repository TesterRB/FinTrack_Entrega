-- FinTrack · beta cerrada en Android
-- 1. Registro con Google (nombre desde los metadatos del proveedor).
-- 2. Monitoreo: eventos de uso y errores de la app, comentarios de los probadores y vistas de resumen.
-- 3. Aviso de nuevas versiones del APK (no hay Play Store que actualice sola la app).

-- ============================================================
-- 1. Perfiles creados con Google
-- ============================================================
alter table public.perfiles add column if not exists proveedor text not null default 'email';

create or replace function public.al_crear_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, email, proveedor)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.email, ''),
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  );
  insert into cuentas (usuario_id, id, nombre, tipo) values
    (new.id, 'banco', 'Cuenta de ahorros', 'banco'),
    (new.id, 'tarjeta', 'Tarjeta de crédito', 'tarjeta'),
    (new.id, 'billetera', 'Billetera digital', 'billetera'),
    (new.id, 'efectivo', 'Efectivo', 'efectivo');
  return new;
end $$;

-- ============================================================
-- 2a. Eventos de uso y errores (telemetría propia, sin terceros)
-- ============================================================
create table public.eventos (
  id          bigint generated always as identity primary key,
  usuario_id  uuid default auth.uid() references public.perfiles (id) on delete cascade,
  sesion      text not null check (char_length(sesion) <= 64),
  tipo        text not null check (tipo in ('inicio', 'pantalla', 'accion', 'error')),
  nombre      text not null check (char_length(nombre) <= 160),
  datos       jsonb not null default '{}' check (pg_column_size(datos) <= 8192),
  plataforma  text not null default 'web' check (plataforma in ('android', 'ios', 'web')),
  version_app text not null default '' check (char_length(version_app) <= 32),
  creado_en   timestamptz not null default now()
);
create index eventos_creado_en on public.eventos (creado_en desc);
create index eventos_usuario on public.eventos (usuario_id, creado_en desc);
create index eventos_tipo on public.eventos (tipo, creado_en desc);

alter table public.eventos enable row level security;
-- Cualquiera puede reportar (también errores antes de iniciar sesión), pero solo a su nombre.
create policy "reportar" on public.eventos for insert to anon, authenticated
  with check (usuario_id is not distinct from (select auth.uid()));
create policy "admin lee" on public.eventos for select to authenticated using ((select public.es_admin()));

-- ============================================================
-- 2b. Comentarios de los probadores
-- ============================================================
create table public.comentarios (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  tipo       text not null default 'idea' check (tipo in ('error', 'idea', 'otro')),
  mensaje    text not null check (char_length(mensaje) between 3 and 2000),
  pantalla   text check (char_length(pantalla) <= 160),
  contexto   jsonb not null default '{}' check (pg_column_size(contexto) <= 4096),
  atendido   boolean not null default false,
  creado_en  timestamptz not null default now()
);
create index comentarios_usuario on public.comentarios (usuario_id);

alter table public.comentarios enable row level security;
create policy "enviar propio" on public.comentarios for insert to authenticated
  with check (usuario_id = (select auth.uid()));
create policy "ver propio o admin" on public.comentarios for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_admin()));
create policy "admin atiende" on public.comentarios for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ============================================================
-- 3. Versión publicada del APK
-- ============================================================
create table public.version_app (
  plataforma text primary key check (plataforma in ('android', 'ios', 'web')),
  codigo     int  not null,
  nombre     text not null,
  url        text not null default '',
  notas      text not null default '',
  obligatoria boolean not null default false,
  publicada_en timestamptz not null default now()
);
alter table public.version_app enable row level security;
create policy "leer" on public.version_app for select to anon, authenticated using (true);
insert into public.version_app (plataforma, codigo, nombre) values ('android', 1, '1.0.0-beta.1') on conflict do nothing;

-- ============================================================
-- Vistas de monitoreo (se consultan desde el panel de Supabase: Table Editor o SQL Editor)
-- ============================================================
create view public.monitor_resumen_diario with (security_invoker = true) as
with dias as (
  select (creado_en at time zone 'America/Bogota')::date as dia, usuario_id, sesion, tipo from public.eventos
)
select
  dia,
  count(distinct usuario_id)                       as usuarios_activos,
  count(distinct sesion)                           as sesiones,
  count(*) filter (where tipo = 'pantalla')        as pantallas_vistas,
  count(*) filter (where tipo = 'accion')          as acciones,
  count(*) filter (where tipo = 'error')           as errores,
  (select count(*) from public.perfiles p where (p.creado_en at time zone 'America/Bogota')::date = d.dia) as registros_nuevos
from dias d
group by dia
order by dia desc;

create view public.monitor_errores with (security_invoker = true) as
select
  nombre                                   as error,
  count(*)                                 as veces,
  count(distinct usuario_id)               as usuarios_afectados,
  max(creado_en)                           as ultima_vez,
  min(creado_en)                           as primera_vez,
  array_agg(distinct version_app)          as versiones,
  (array_agg(datos order by creado_en desc))[1] as ultimo_detalle
from public.eventos
where tipo = 'error'
group by nombre
order by ultima_vez desc;

create view public.monitor_pantallas with (security_invoker = true) as
select
  nombre                     as pantalla,
  count(*)                   as visitas,
  count(distinct usuario_id) as usuarios,
  max(creado_en)             as ultima_visita
from public.eventos
where tipo = 'pantalla' and creado_en > now() - interval '30 days'
group by nombre
order by visitas desc;

create view public.monitor_usuarios with (security_invoker = true) as
select
  p.nombre,
  p.email,
  p.proveedor,
  p.creado_en as registrado,
  e.ultima_actividad,
  e.dias_activos,
  e.version_app,
  e.dispositivo,
  (select count(*) from public.movimientos m where m.usuario_id = p.id)  as movimientos,
  (select count(*) from public.presupuestos b where b.usuario_id = p.id) as presupuestos,
  (select count(*) from public.metas t where t.usuario_id = p.id)        as metas,
  (select count(*) from public.extractos x where x.usuario_id = p.id)    as extractos,
  (select count(*) from public.comentarios c where c.usuario_id = p.id)  as comentarios
from public.perfiles p
left join lateral (
  select
    max(ev.creado_en) as ultima_actividad,
    count(distinct (ev.creado_en at time zone 'America/Bogota')::date) as dias_activos,
    (array_agg(ev.version_app order by ev.creado_en desc))[1] as version_app,
    (array_agg(ev.datos ->> 'dispositivo' order by ev.creado_en desc) filter (where ev.tipo = 'inicio'))[1] as dispositivo
  from public.eventos ev where ev.usuario_id = p.id
) e on true
order by e.ultima_actividad desc nulls last;

-- Las vistas son solo para el panel: no se exponen por la API pública.
revoke all on public.monitor_resumen_diario, public.monitor_errores, public.monitor_pantallas, public.monitor_usuarios from anon, authenticated;

-- ============================================================
-- Índices de llaves foráneas (recomendación del asesor de rendimiento)
-- ============================================================
create index if not exists aportes_meta on public.aportes (meta_id);
create index if not exists aportes_usuario on public.aportes (usuario_id);
create index if not exists cierres_recompensa on public.cierres (recompensa_id);
create index if not exists facturas_usuario on public.facturas (usuario_id);
create index if not exists facturas_promocion on public.facturas (promocion_id);
create index if not exists promociones_aliado on public.promociones (aliado_id);
create index if not exists recompensas_usuario on public.recompensas (usuario_id);
create index if not exists pagos_usuario on public.pagos (usuario_id);
create index if not exists metas_usuario on public.metas (usuario_id);
create index if not exists extractos_usuario on public.extractos (usuario_id);

-- ============================================================
-- Limpieza: el plan gratuito tiene 500 MB; los eventos viejos se borran solos.
-- ============================================================
select cron.schedule('fintrack-limpiar-eventos', '30 4 * * *', $$delete from public.eventos where creado_en < now() - interval '120 days'$$);

-- ============================================================
-- Permisos de funciones (recomendación del asesor de seguridad)
-- ============================================================
-- Los triggers se ejecutan solos: nadie debe poder llamarlos por la API.
revoke execute on function public.al_crear_usuario() from public, anon, authenticated;
revoke execute on function public.validar_factura() from public, anon, authenticated;
-- finscore_mes recibe cualquier usuario: solo la usan funciones del servidor.
revoke execute on function public.finscore_mes(uuid, text) from public, anon, authenticated;
-- cerrar_mes_usuario exige sesión.
revoke execute on function public.cerrar_mes_usuario(text) from public, anon;
grant execute on function public.cerrar_mes_usuario(text) to authenticated;
-- es_admin() se deja ejecutable a propósito: las políticas RLS la evalúan con el rol de quien consulta
-- y solo responde si quien pregunta es admin.
