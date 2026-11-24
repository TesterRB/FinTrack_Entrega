-- FinTrack · FinScore autoritativo y cierre mensual de recompensas.
-- Reglas idénticas a src/lib/finscore.ts.
-- Constantes de recompensa: 85-99 => cupón 20 %, 100 => cupón 30 % + 30 días Premium.

create or replace function public.finscore_mes(p_usuario uuid, p_mes text) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  zona constant text := 'America/Bogota';
  dias int;
  racha int;
  pts numeric := 0;
  n int;
begin
  -- Registro constante: 2 pts por día con registro propio (no importado), máx. 40.
  select count(distinct (creado_en at time zone zona)::date) into dias
  from movimientos
  where usuario_id = p_usuario and origen <> 'extracto' and to_char(creado_en at time zone zona, 'YYYY-MM') = p_mes;
  pts := pts + least(40, dias * 2);

  -- Racha máxima (islas de días consecutivos): 7 días = 5, 14 días = 10.
  select coalesce(max(largo), 0) into racha from (
    select count(*) as largo from (
      select d, d - (row_number() over (order by d))::int as grupo
      from (select distinct (creado_en at time zone zona)::date as d from movimientos
            where usuario_id = p_usuario and origen <> 'extracto' and to_char(creado_en at time zone zona, 'YYYY-MM') = p_mes) x
    ) y group by grupo
  ) z;
  pts := pts + case when racha >= 14 then 10 when racha >= 7 then 5 else 0 end;

  -- Extracto conciliado del periodo: 15.
  if exists (select 1 from extractos where usuario_id = p_usuario and periodo = p_mes and filas > 0) then pts := pts + 15; end if;

  -- Presupuestos: 3+ en el mes = 5; revisiones en semanas distintas, 2,5 c/u (máx. 4).
  select count(*) into n from presupuestos where usuario_id = p_usuario and mes = p_mes;
  if n >= 3 then pts := pts + 5; end if;
  select count(distinct date_trunc('week', fecha at time zone zona)) into n from actividades
  where usuario_id = p_usuario and tipo in ('revision_presupuesto', 'revision_insights') and to_char(fecha at time zone zona, 'YYYY-MM') = p_mes;
  pts := pts + least(4, n) * 2.5;

  -- Metas: aportes en 2 días distintos = 10; 1 = 5.
  select count(distinct fecha) into n from aportes where usuario_id = p_usuario and to_char(fecha, 'YYYY-MM') = p_mes;
  pts := pts + case when n >= 2 then 10 when n = 1 then 5 else 0 end;

  -- Retos semanales: 2,5 c/u (máx. 4).
  select count(distinct ref) into n from actividades
  where usuario_id = p_usuario and tipo = 'reto_completado' and to_char(fecha at time zone zona, 'YYYY-MM') = p_mes;
  pts := pts + least(4, n) * 2.5;

  return round(pts);
end $$;

-- Cierra un mes para un usuario: guarda el puntaje y emite la recompensa (idempotente).
create or replace function public._cerrar_mes(p_usuario uuid, p_mes text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c cierres;
  r recompensas;
  puntaje int;
  base date;
begin
  select * into c from cierres where usuario_id = p_usuario and mes = p_mes;
  if found then
    select * into r from recompensas where id = c.recompensa_id;
    return jsonb_build_object('cierre', to_jsonb(c), 'recompensa', case when r.id is null then null else to_jsonb(r) end);
  end if;

  puntaje := finscore_mes(p_usuario, p_mes);
  if puntaje >= 85 then
    insert into recompensas (usuario_id, mes, puntaje, tipo, codigo, descuento, dias_premium, vence_en)
    values (
      p_usuario, p_mes, puntaje,
      case when puntaje >= 100 then 'cupon_y_mes' else 'cupon' end,
      'FIN' || replace(substr(p_mes, 3), '-', '') || '-' || upper(substr(md5(random()::text), 1, 5)),
      case when puntaje >= 100 then 30 else 20 end,
      case when puntaje >= 100 then 30 else 0 end,
      current_date + 45
    ) returning * into r;
    if puntaje >= 100 then
      select greatest(coalesce(premium_hasta, current_date), current_date) into base from perfiles where id = p_usuario;
      update perfiles set premium_hasta = base + 30 where id = p_usuario;
    end if;
  end if;
  insert into cierres (usuario_id, mes, puntaje, recompensa_id) values (p_usuario, p_mes, puntaje, r.id) returning * into c;
  return jsonb_build_object('cierre', to_jsonb(c), 'recompensa', case when r.id is null then null else to_jsonb(r) end);
end $$;

revoke execute on function public._cerrar_mes(uuid, text) from public, anon, authenticated;
revoke execute on function public.finscore_mes(uuid, text) from public, anon;

-- RPC que llama la app. Solo permite cerrar meses ya terminados (desde el día 6 del mes siguiente).
create or replace function public.cerrar_mes_usuario(p_mes text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  ultimo_cerrable text := to_char(hoy - interval '1 month' * case when extract(day from hoy) >= 6 then 1 else 2 end, 'YYYY-MM');
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if p_mes > ultimo_cerrable then raise exception 'El mes % aún no se puede cerrar', p_mes; end if;
  return _cerrar_mes(auth.uid(), p_mes);
end $$;

grant execute on function public.cerrar_mes_usuario(text) to authenticated;

-- Cierre masivo (lo ejecuta pg_cron el día 6 de cada mes, aunque el usuario no abra la app).
create or replace function public.cerrar_meses_todos() returns int
language plpgsql security definer set search_path = public as $$
declare
  mes text := to_char((now() at time zone 'America/Bogota')::date - interval '1 month', 'YYYY-MM');
  u record;
  n int := 0;
begin
  for u in select id from perfiles where to_char(creado_en, 'YYYY-MM') <= mes loop
    perform _cerrar_mes(u.id, mes);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.cerrar_meses_todos() from public, anon, authenticated;

-- Programación (requiere la extensión pg_cron, disponible en el plan gratuito de Supabase).
create extension if not exists pg_cron;
select cron.schedule('fintrack-cierre-finscore', '0 11 6 * *', $$select public.cerrar_meses_todos()$$);
