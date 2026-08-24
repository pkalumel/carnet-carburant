-- ============================================================
-- Journal des appels aux API externes (HERE, Open Charge Map,
-- Overpass, Nominatim…) : chaque client trace ses appels,
-- la console d'administration agrège.
-- ============================================================

create table public.api_log (
  id        bigint generated always as identity primary key,
  called_at timestamptz not null default now(),
  api       text not null check (char_length(api) <= 40),
  ok        boolean not null,
  status    int,
  ms        int,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index api_log_called_at_idx on public.api_log (called_at);
create index api_log_api_idx on public.api_log (api, called_at);

-- RLS : les clients écrivent leur propre trace, personne ne lit
-- via PostgREST — la lecture passe par la RPC admin ci-dessous.
alter table public.api_log enable row level security;

create policy "api_log_insert_own" on public.api_log
  for insert to authenticated
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- Agrégats pour la console : par API (7 jours + 24 h) et par
-- jour (courbe). La RPC purge au passage les traces > 30 jours.
-- ------------------------------------------------------------
create or replace function public.admin_api_stats()
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin();

  delete from public.api_log where called_at < now() - interval '30 days';

  return jsonb_build_object(
    'apis', coalesce((
      select jsonb_agg(x order by x->>'api')
      from (
        select jsonb_build_object(
          'api', api,
          'calls', count(*),
          'errors', count(*) filter (where not ok),
          'avg_ms', round(avg(ms)) ,
          'calls_24h', count(*) filter (where called_at > now() - interval '24 hours'),
          'errors_24h', count(*) filter (where not ok and called_at > now() - interval '24 hours')
        ) as x
        from public.api_log
        where called_at > now() - interval '7 days'
        group by api
      ) t), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(x order by x->>'day')
      from (
        select jsonb_build_object(
          'day', to_char(date_trunc('day', called_at), 'YYYY-MM-DD'),
          'calls', count(*),
          'errors', count(*) filter (where not ok)
        ) as x
        from public.api_log
        where called_at > now() - interval '7 days'
        group by date_trunc('day', called_at)
      ) t), '[]'::jsonb)
  );
end;
$$;

-- PostgREST expose les fonctions de public à anon par défaut :
-- on retire puis on n'accorde qu'aux connectés (garde interne).
revoke execute on function public.admin_api_stats() from public, anon;
grant  execute on function public.admin_api_stats() to authenticated;
