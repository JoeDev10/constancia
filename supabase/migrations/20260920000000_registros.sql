-- Registro de hábitos por bloques de tiempo
-- Una sola tabla: cada fila es un bloque de minutos reales de una actividad en una fecha.

create table if not exists public.registros (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  actividad   text not null,
  minutos     integer not null default 8 check (minutos > 0 and minutos <= 600),
  created_at  timestamptz not null default now()
);

create index if not exists registros_actividad_fecha_idx
  on public.registros (actividad, fecha desc);

-- Vista agregada: un renglón por día y actividad (la app la usa para rachas y totales,
-- así nunca necesita bajar todos los bloques individuales).
create or replace view public.resumen_diario
  with (security_invoker = true) as
select
  fecha,
  actividad,
  sum(minutos)::int as minutos,
  count(*)::int     as bloques
from public.registros
group by fecha, actividad;

-- App personal sin login: la clave publicable puede leer y escribir.
-- Si más adelante agregás Supabase Auth, reemplazá esta policy por una con auth.uid().
alter table public.registros enable row level security;

drop policy if exists "acceso_total_anon" on public.registros;
create policy "acceso_total_anon"
  on public.registros
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.registros to anon, authenticated;
grant select on public.resumen_diario to anon, authenticated;
