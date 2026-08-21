-- ============================================================
-- Console d'administration : table admins, garde is_admin,
-- RPC de lecture réservées aux administrateurs, cascade de
-- suppression de compte et index d'agrégation.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Table des administrateurs.
--    RLS activée sans aucune policy : la table est invisible via
--    l'API PostgREST ; seules les fonctions SECURITY DEFINER
--    ci-dessous la consultent.
-- ------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- ------------------------------------------------------------
-- 2) Index d'agrégation manquants (le seul index existant est
--    fillups (vehicle_id, filled_at)).
-- ------------------------------------------------------------
create index vehicles_user_idx on public.vehicles (user_id);
create index fillups_created_at_idx on public.fillups (created_at);

-- ------------------------------------------------------------
-- 3) Suppression de compte : la FK vehicles -> auth.users doit
--    suivre (les fillups cascadent déjà via vehicle_id). Le nom
--    de la contrainte d'origine n'étant pas garanti, on la
--    retrouve dynamiquement.
-- ------------------------------------------------------------
do $$
declare
  fk text;
begin
  select conname into fk
  from pg_constraint
  where conrelid = 'public.vehicles'::regclass
    and contype = 'f'
    and confrelid = 'auth.users'::regclass;
  if fk is not null then
    execute format('alter table public.vehicles drop constraint %I', fk);
  end if;
  alter table public.vehicles
    add constraint vehicles_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
end $$;

-- ------------------------------------------------------------
-- 4) Garde d'accès.
--    is_admin() est appelable par tout utilisateur connecté :
--    c'est le test qui décide d'afficher l'onglet Admin au boot.
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.assert_admin()
returns void
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'accès réservé aux administrateurs' using errcode = '42501';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5) Vue d'ensemble : KPIs + séries hebdomadaires en un seul
--    aller-retour.
--    Définition retenue d'un utilisateur « actif » : a créé au
--    moins un plein (fillups.created_at) dans la fenêtre. C'est
--    la mesure d'usage réel ; last_sign_in_at sous-estime (une
--    session PWA persistée ne le rafraîchit pas) et un login
--    sans saisie n'est pas de l'usage. signed_in_30d reste
--    exposé comme indicateur secondaire.
-- ------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'users_total',    (select count(*) from auth.users),
    'vehicles_total', (select count(*) from public.vehicles),
    'fillups_total',  (select count(*) from public.fillups where not is_draft),
    'drafts_total',   (select count(*) from public.fillups where is_draft),
    'active_7d', (
      select count(distinct v.user_id)
      from public.fillups f
      join public.vehicles v on v.id = f.vehicle_id
      where f.created_at >= now() - interval '7 days'),
    'active_30d', (
      select count(distinct v.user_id)
      from public.fillups f
      join public.vehicles v on v.id = f.vehicle_id
      where f.created_at >= now() - interval '30 days'),
    'signed_in_30d', (
      select count(*) from auth.users
      where last_sign_in_at >= now() - interval '30 days'),
    -- generate_series + left join : les semaines sans activité
    -- doivent apparaître à zéro, pas disparaître de la courbe.
    'signups_weekly', (
      select jsonb_agg(jsonb_build_object(
               'week', to_char(w.week, 'YYYY-MM-DD'),
               'n', coalesce(t.n, 0)) order by w.week)
      from generate_series(
             date_trunc('week', now()) - interval '25 weeks',
             date_trunc('week', now()), interval '1 week') as w(week)
      left join (
        select date_trunc('week', created_at) as wk, count(*) as n
        from auth.users group by 1
      ) t on t.wk = w.week),
    'fillups_weekly', (
      select jsonb_agg(jsonb_build_object(
               'week', to_char(w.week, 'YYYY-MM-DD'),
               'n', coalesce(t.n, 0)) order by w.week)
      from generate_series(
             date_trunc('week', now()) - interval '25 weeks',
             date_trunc('week', now()), interval '1 week') as w(week)
      left join (
        select date_trunc('week', created_at) as wk, count(*) as n
        from public.fillups where not is_draft group by 1
      ) t on t.wk = w.week),
    'by_energy', coalesce((
      select jsonb_object_agg(t.energy, t.n)
      from (select energy, count(*) as n
            from public.fillups where not is_draft group by energy) t), '{}'::jsonb),
    'by_fuel', coalesce((
      select jsonb_object_agg(t.fuel, t.n)
      from (select coalesce(fuel, '—') as fuel, count(*) as n
            from public.vehicles group by 1) t), '{}'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------
-- 6) Liste des utilisateurs : left join depuis auth.users pour
--    que les comptes sans véhicule apparaissent, pagination via
--    count(*) over(), tri en liste blanche (jamais de SQL
--    dynamique).
-- ------------------------------------------------------------
create or replace function public.admin_users(
  p_search text default null,
  p_status text default 'all',      -- all | active | dormant (plein < / > 30 j)
  p_sort   text default 'activity', -- activity | created | fillups | email
  p_dir    text default 'desc',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  user_id         uuid,
  email           text,
  user_created_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until    timestamptz,
  is_admin        boolean,
  vehicle_count   bigint,
  fillup_count    bigint,
  last_fillup_at  timestamptz,
  total_count     bigint
)
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin();
  return query
  select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.banned_until,
         exists (select 1 from public.admins a where a.user_id = u.id),
         coalesce(s.vehicle_count, 0), coalesce(s.fillup_count, 0), s.last_fillup_at,
         count(*) over () as total_count
  from auth.users u
  left join lateral (
    select count(distinct v.id) as vehicle_count,
           count(f.id)          as fillup_count,
           max(f.created_at)    as last_fillup_at
    from public.vehicles v
    left join public.fillups f on f.vehicle_id = v.id
    where v.user_id = u.id
  ) s on true
  where (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%')
    and (p_status = 'all'
         or (p_status = 'active'  and s.last_fillup_at >= now() - interval '30 days')
         or (p_status = 'dormant' and (s.last_fillup_at is null
                                       or s.last_fillup_at < now() - interval '30 days')))
  order by
    case when p_sort = 'activity' and p_dir = 'desc' then s.last_fillup_at end desc nulls last,
    case when p_sort = 'activity' and p_dir = 'asc'  then s.last_fillup_at end asc nulls first,
    case when p_sort = 'created'  and p_dir = 'desc' then u.created_at end desc,
    case when p_sort = 'created'  and p_dir = 'asc'  then u.created_at end asc,
    case when p_sort = 'fillups'  and p_dir = 'desc' then coalesce(s.fillup_count, 0) end desc,
    case when p_sort = 'fillups'  and p_dir = 'asc'  then coalesce(s.fillup_count, 0) end asc,
    case when p_sort = 'email'    and p_dir = 'desc' then u.email end desc,
    case when p_sort = 'email'    and p_dir = 'asc'  then u.email end asc,
    u.created_at desc
  limit least(coalesce(p_limit, 50), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ------------------------------------------------------------
-- 7) Détail d'un utilisateur (pour la fiche en bottom sheet).
--    storage.objects.metadata est du jsonb, size y est du texte :
--    le cast ::bigint est obligatoire.
-- ------------------------------------------------------------
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'user', (
      select jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until,
        'is_admin', exists (select 1 from public.admins a where a.user_id = u.id))
      from auth.users u where u.id = p_user_id),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'plate', v.plate, 'fuel', v.fuel,
        'fillup_count',   (select count(*) from public.fillups f where f.vehicle_id = v.id),
        'last_fillup_at', (select max(f.filled_at) from public.fillups f where f.vehicle_id = v.id),
        'total_spent',    (select coalesce(sum(f.total_price), 0) from public.fillups f where f.vehicle_id = v.id)
      ) order by v.created_at)
      from public.vehicles v where v.user_id = p_user_id), '[]'::jsonb),
    'recent_fillups', coalesce((
      select jsonb_agg(t.x)
      from (
        select jsonb_build_object(
          'id', f.id, 'filled_at', f.filled_at, 'energy', f.energy,
          'liters', f.liters, 'total_price', f.total_price,
          'odometer_km', f.odometer_km, 'is_draft', f.is_draft,
          'vehicle_name', v.name) as x
        from public.fillups f
        join public.vehicles v on v.id = f.vehicle_id
        where v.user_id = p_user_id
        order by f.filled_at desc
        limit 10) t), '[]'::jsonb),
    'photo_count', (
      select count(*) from storage.objects o
      where o.bucket_id = 'pump-photos' and o.owner_id = p_user_id::text),
    'photo_bytes', (
      select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
      where o.bucket_id = 'pump-photos' and o.owner_id = p_user_id::text)
  );
end;
$$;

-- ------------------------------------------------------------
-- 8) Santé technique. orphan_vehicles doit rester à zéro grâce
--    à la cascade du §3 : c'est un canari.
-- ------------------------------------------------------------
create or replace function public.admin_health()
returns jsonb
language plpgsql stable
security definer set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'photo_count', (
      select count(*) from storage.objects o where o.bucket_id = 'pump-photos'),
    'photo_bytes', (
      select coalesce(sum((o.metadata->>'size')::bigint), 0)
      from storage.objects o where o.bucket_id = 'pump-photos'),
    'orphan_photos', (
      select count(*) from storage.objects o
      where o.bucket_id = 'pump-photos'
        and not exists (select 1 from public.fillups f where f.photo_path = o.name)),
    'missing_photos', (
      select count(*) from public.fillups f
      where f.photo_path is not null
        and not exists (select 1 from storage.objects o
                        where o.bucket_id = 'pump-photos' and o.name = f.photo_path)),
    'stale_drafts', (
      select count(*) from public.fillups
      where is_draft and created_at < now() - interval '7 days'),
    'fillups_bytes',  pg_total_relation_size('public.fillups'),
    'vehicles_bytes', pg_total_relation_size('public.vehicles'),
    'orphan_vehicles', (
      select count(*) from public.vehicles v
      where not exists (select 1 from auth.users u where u.id = v.user_id))
  );
end;
$$;

-- ------------------------------------------------------------
-- 9) Privilèges. Postgres accorde EXECUTE à PUBLIC par défaut et
--    PostgREST expose donc les fonctions du schéma public aux
--    anonymes : on révoque tout, puis on n'accorde qu'aux
--    connectés (assert_admin fait le tri réel).
-- ------------------------------------------------------------
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

revoke execute on function public.assert_admin() from public, anon;
grant  execute on function public.assert_admin() to authenticated;

revoke execute on function public.admin_overview() from public, anon;
grant  execute on function public.admin_overview() to authenticated;

revoke execute on function public.admin_users(text, text, text, text, int, int) from public, anon;
grant  execute on function public.admin_users(text, text, text, text, int, int) to authenticated;

revoke execute on function public.admin_user_detail(uuid) from public, anon;
grant  execute on function public.admin_user_detail(uuid) to authenticated;

revoke execute on function public.admin_health() from public, anon;
grant  execute on function public.admin_health() to authenticated;

-- ------------------------------------------------------------
-- Nomination du premier administrateur : à exécuter UNE FOIS à
-- la main dans Dashboard > SQL Editor (pas d'email en dur dans
-- les migrations) :
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'votre-adresse@exemple.com'
--   on conflict do nothing;
-- ------------------------------------------------------------
