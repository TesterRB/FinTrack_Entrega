-- FinTrack · esquema inicial
-- Misma base de datos para la web y la app Android (Capacitor).
-- Columnas en snake_case: la app las convierte a camelCase automáticamente.

-- ============================================================
-- Perfiles
-- ============================================================
create table public.perfiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nombre        text not null default '',
  email         text not null default '',
  plan          text not null default 'starter' check (plan in ('starter', 'plus', 'pro')),
  plan_hasta    date,
  rol           text not null default 'usuario' check (rol in ('usuario', 'admin')),
  prueba_hasta  date not null default (current_date + 30),
  premium_hasta date,
  dia_de_pago   int  not null default 15 check (dia_de_pago between 1 and 31),
  creado_en     timestamptz not null default now()
);

-- ¿Quien consulta es administrador? Es security definer para leer perfiles sin pasar por RLS
-- (las propias políticas de perfiles la llaman: sin esto habría recursión).
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from perfiles where id = auth.uid()), false)
$$;

-- Al registrarse: perfil con 30 días de prueba Premium y medios de pago por defecto.
create or replace function public.al_crear_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)), new.email);
  insert into cuentas (usuario_id, id, nombre, tipo) values
    (new.id, 'banco', 'Cuenta de ahorros', 'banco'),
    (new.id, 'tarjeta', 'Tarjeta de crédito', 'tarjeta'),
    (new.id, 'billetera', 'Billetera digital', 'billetera'),
    (new.id, 'efectivo', 'Efectivo', 'efectivo');
  return new;
end $$;

-- ============================================================
-- Datos financieros del usuario
-- ============================================================
-- Los id son text y los genera la app (uuid): así el cambio se ve en pantalla antes de llegar al servidor.
-- usuario_id toma por defecto auth.uid(), y las políticas RLS impiden escribir a nombre de otro.
create table public.cuentas (
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  id         text not null,
  nombre     text not null,
  tipo       text not null check (tipo in ('banco', 'tarjeta', 'billetera', 'efectivo')),
  primary key (usuario_id, id)
);

create trigger crear_perfil after insert on auth.users
  for each row execute function public.al_crear_usuario();

create table public.movimientos (
  id           text primary key,
  usuario_id   uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  fecha        date not null,
  descripcion  text not null,
  monto        numeric(14, 2) not null,
  categoria    text not null,
  confianza    real,
  cuenta_id    text,
  origen       text not null default 'manual' check (origen in ('manual', 'extracto', 'factura')),
  conciliado   boolean not null default false,
  extracto_id  text,
  nota         text,
  creado_en    timestamptz not null default now()
);
create index movimientos_usuario_fecha on public.movimientos (usuario_id, fecha desc);

create table public.presupuestos (
  id         text primary key,
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  categoria  text not null,
  limite     numeric(14, 2) not null check (limite > 0),
  mes        text not null check (mes ~ '^\d{4}-\d{2}$'),
  unique (usuario_id, categoria, mes)
);

create table public.metas (
  id           text primary key,
  usuario_id   uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre       text not null,
  objetivo     numeric(14, 2) not null,
  ahorrado     numeric(14, 2) not null default 0,
  fecha_limite date,
  icono        text not null default '🎯'
);

create table public.aportes (
  id         text primary key,
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  meta_id    text not null references public.metas (id) on delete cascade,
  monto      numeric(14, 2) not null check (monto > 0),
  fecha      date not null default current_date
);

create table public.extractos (
  id          text primary key,
  usuario_id  uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  banco       text not null,
  periodo     text not null,
  archivo     text not null,
  filas       int not null,
  conciliados int not null default 0,
  agregados   int not null default 0,
  creado_en   timestamptz not null default now()
);

create table public.actividades (
  id         text primary key,
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  tipo       text not null check (tipo in ('revision_insights', 'revision_presupuesto', 'reto_completado', 'inicio_sesion')),
  ref        text,
  fecha      timestamptz not null default now()
);
create index actividades_usuario_fecha on public.actividades (usuario_id, fecha);

-- ============================================================
-- Gamificación (solo escribe el servidor)
-- ============================================================
create table public.recompensas (
  id           text primary key default gen_random_uuid()::text,
  usuario_id   uuid not null references public.perfiles (id) on delete cascade,
  mes          text not null,
  puntaje      int not null,
  tipo         text not null check (tipo in ('cupon', 'cupon_y_mes')),
  codigo       text not null unique,
  descuento    int not null,
  dias_premium int not null default 0,
  usado        boolean not null default false,
  vence_en     date not null
);

create table public.cierres (
  id            text primary key default gen_random_uuid()::text,
  usuario_id    uuid not null references public.perfiles (id) on delete cascade,
  mes           text not null,
  puntaje       int not null,
  recompensa_id text references public.recompensas (id),
  creado_en     timestamptz not null default now(),
  unique (usuario_id, mes)
);

create table public.pagos (
  id             text primary key default gen_random_uuid()::text,
  usuario_id     uuid not null references public.perfiles (id) on delete cascade,
  referencia     text not null unique,
  plan           text not null check (plan in ('plus', 'pro')),
  monto_centavos bigint not null,
  cupon          text,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  wompi_id       text,
  creado_en      timestamptz not null default now()
);

-- ============================================================
-- Comercios aliados, promociones y facturas
-- ============================================================
create table public.aliados (
  id        text primary key,
  nombre    text not null,
  nit       text not null,
  categoria text not null,
  ciudad    text not null default '',
  logo      text not null default ''
);

create table public.promociones (
  id           text primary key,
  aliado_id    text not null references public.aliados (id) on delete cascade,
  titulo       text not null,
  descripcion  text not null default '',
  beneficio    text not null,
  monto_minimo numeric(14, 2) not null default 0,
  desde        date not null,
  hasta        date not null,
  reglas       jsonb not null default '[]',
  activa       boolean not null default true,
  puntos       int not null default 0
);

create table public.facturas (
  id             text primary key,
  usuario_id     uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  usuario_nombre text not null default '',
  promocion_id   text references public.promociones (id) on delete set null,
  imagen         text not null,
  ocr            jsonb not null,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo         text,
  alertas        jsonb not null default '[]',
  creado_en      timestamptz not null default now()
);

-- El cliente propone un estado, pero el servidor re-valida las reglas con los datos OCR.
-- Una factura solo queda "aprobada" si NIT, fecha, monto y unicidad cuadran; si no, pasa a revisión.
create or replace function public.validar_factura() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p promociones;
  a aliados;
  nit_ocr text := regexp_replace(coalesce(new.ocr ->> 'nit', ''), '\D', '', 'g');
  total numeric := nullif(new.ocr ->> 'total', '')::numeric;
  fecha date := nullif(new.ocr ->> 'fecha', '')::date;
begin
  new.usuario_id := auth.uid();
  new.usuario_nombre := coalesce((select nombre from perfiles where id = auth.uid()), '');
  if new.promocion_id is null then
    new.estado := 'pendiente';
    return new;
  end if;
  select * into p from promociones where id = new.promocion_id;
  select * into a from aliados where id = p.aliado_id;
  if exists (select 1 from facturas where usuario_id = new.usuario_id and promocion_id = new.promocion_id and estado <> 'rechazada') then
    new.estado := 'rechazada';
    new.motivo := 'Ya registraste una factura para esta promoción.';
  elsif fecha is not null and (fecha < p.desde or fecha > p.hasta) then
    new.estado := 'rechazada';
    new.motivo := 'La fecha de la factura está fuera de la vigencia de la promoción.';
  elsif new.estado = 'aprobada' and not (
        left(nit_ocr, 9) = left(regexp_replace(a.nit, '\D', '', 'g'), 9)
        and total >= p.monto_minimo
        and fecha between p.desde and p.hasta
        and coalesce((new.ocr ->> 'confianza')::numeric, 0) >= 60) then
    new.estado := 'pendiente';
  elsif new.estado = 'rechazada' then
    new.estado := 'pendiente'; -- el cliente no puede auto-rechazarse por error: lo decide un admin
  end if;
  return new;
end $$;

create trigger validar_factura before insert on public.facturas
  for each row execute function public.validar_factura();

-- ============================================================
-- Seguridad por filas (RLS)
-- ============================================================
alter table public.perfiles     enable row level security;
alter table public.cuentas      enable row level security;
alter table public.movimientos  enable row level security;
alter table public.presupuestos enable row level security;
alter table public.metas        enable row level security;
alter table public.aportes      enable row level security;
alter table public.extractos    enable row level security;
alter table public.actividades  enable row level security;
alter table public.recompensas  enable row level security;
alter table public.cierres      enable row level security;
alter table public.pagos        enable row level security;
alter table public.aliados      enable row level security;
alter table public.promociones  enable row level security;
alter table public.facturas     enable row level security;

create policy "perfil propio" on public.perfiles for select using (id = auth.uid() or public.es_admin());
create policy "editar perfil propio" on public.perfiles for update using (id = auth.uid());
-- Solo nombre y día de pago son editables por el usuario: plan, rol y fechas los cambia el servidor.
revoke update on public.perfiles from authenticated, anon;
grant update (nombre, dia_de_pago) on public.perfiles to authenticated;

-- Tablas del usuario: CRUD solo sobre sus filas.
do $$
declare t text;
begin
  foreach t in array array['cuentas', 'movimientos', 'presupuestos', 'metas', 'aportes', 'extractos', 'actividades'] loop
    execute format('create policy "propios" on public.%I for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid())', t);
  end loop;
end $$;

-- Gamificación y pagos: lectura propia; escritura solo desde funciones del servidor.
create policy "leer propias" on public.recompensas for select using (usuario_id = auth.uid());
create policy "leer propios" on public.cierres for select using (usuario_id = auth.uid());
create policy "leer propios" on public.pagos for select using (usuario_id = auth.uid());

-- Aliados y promociones: todos leen, solo admin escribe.
create policy "leer" on public.aliados for select to authenticated using (true);
create policy "admin escribe" on public.aliados for all using (public.es_admin()) with check (public.es_admin());
create policy "leer" on public.promociones for select to authenticated using (true);
create policy "admin escribe" on public.promociones for all using (public.es_admin()) with check (public.es_admin());

-- Facturas: el usuario crea y ve las suyas; el admin ve y revisa todas.
create policy "ver" on public.facturas for select using (usuario_id = auth.uid() or public.es_admin());
create policy "crear propia" on public.facturas for insert with check (usuario_id = auth.uid());
create policy "admin revisa" on public.facturas for update using (public.es_admin()) with check (public.es_admin());

-- ============================================================
-- Storage: fotos de facturas (privado, carpeta por usuario)
-- ============================================================
insert into storage.buckets (id, name, public) values ('facturas', 'facturas', false) on conflict do nothing;

create policy "subir factura propia" on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "actualizar factura propia" on storage.objects for update to authenticated
  using (bucket_id = 'facturas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ver factura propia o admin" on storage.objects for select to authenticated
  using (bucket_id = 'facturas' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
