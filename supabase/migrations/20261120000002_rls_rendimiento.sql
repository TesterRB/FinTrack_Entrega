-- Políticas RLS con (select auth.uid()): Postgres la evalúa una vez por consulta y no una por fila
-- (recomendación del asesor de rendimiento de Supabase). Mismo comportamiento que antes.

drop policy "perfil propio" on public.perfiles;
drop policy "editar perfil propio" on public.perfiles;
create policy "perfil propio" on public.perfiles for select using (id = (select auth.uid()) or (select public.es_admin()));
create policy "editar perfil propio" on public.perfiles for update using (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['cuentas', 'movimientos', 'presupuestos', 'metas', 'aportes', 'extractos', 'actividades'] loop
    execute format('drop policy "propios" on public.%I', t);
    execute format('create policy "propios" on public.%I for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy "leer propias" on public.recompensas;
drop policy "leer propios" on public.cierres;
drop policy "leer propios" on public.pagos;
create policy "leer propias" on public.recompensas for select using (usuario_id = (select auth.uid()));
create policy "leer propios" on public.cierres for select using (usuario_id = (select auth.uid()));
create policy "leer propios" on public.pagos for select using (usuario_id = (select auth.uid()));

-- Aliados y promociones: una sola política de lectura; las de escritura, separadas por acción.
do $$
declare t text;
begin
  foreach t in array array['aliados', 'promociones'] loop
    execute format('drop policy "admin escribe" on public.%I', t);
    execute format('create policy "admin crea" on public.%I for insert to authenticated with check ((select public.es_admin()))', t);
    execute format('create policy "admin edita" on public.%I for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))', t);
    execute format('create policy "admin borra" on public.%I for delete to authenticated using ((select public.es_admin()))', t);
  end loop;
end $$;

drop policy "ver" on public.facturas;
drop policy "crear propia" on public.facturas;
drop policy "admin revisa" on public.facturas;
create policy "ver" on public.facturas for select using (usuario_id = (select auth.uid()) or (select public.es_admin()));
create policy "crear propia" on public.facturas for insert with check (usuario_id = (select auth.uid()));
create policy "admin revisa" on public.facturas for update using ((select public.es_admin())) with check ((select public.es_admin()));
