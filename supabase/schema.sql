-- ============================================================
-- Carnet Carburant — schéma de base de données Supabase
-- À exécuter une seule fois dans : Dashboard > SQL Editor > New query
-- (installation existante : voir migration-proprietaire-et-carburant.sql)
-- ============================================================

-- Véhicules : chaque véhicule appartient à un utilisateur
create table public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) default auth.uid(),
  name           text not null,
  plate          text,
  fuel           text,                             -- Essence, Diesel, E85, GPL, Hybride rechargeable, Électrique…
  home_kwh_price numeric(6,4) check (home_kwh_price is null or home_kwh_price > 0),
  battery_kwh    numeric(6,2) check (battery_kwh is null or battery_kwh > 0),
  created_at     timestamptz not null default now()
);

-- Pleins de carburant et recharges électriques.
-- energy = 'electric' : liters contient les kWh et price_per_liter
-- devient de fait un prix au kWh.
-- Recharge domestique estimée par % : les kWh estimés sont matérialisés
-- dans liters et le coût estimé dans total_price (jamais envoyer
-- price_per_liter, colonne générée) ; liters_estimated = true.
create table public.fillups (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references public.vehicles(id) on delete cascade,
  filled_at          timestamptz not null default now(),
  energy             text not null default 'fuel' check (energy in ('fuel', 'electric')),
  odometer_km        integer check (odometer_km > 0),
  liters             numeric(7,2) check (liters > 0),
  total_price        numeric(8,2) check (total_price >= 0),
  price_per_liter    numeric(6,3) generated always as
                       (case when liters > 0 then round(total_price / liters, 3) end) stored,
  is_full            boolean not null default true,   -- plein complet (à ras bord) ou partiel
  is_draft           boolean not null default false,  -- capture rapide à compléter plus tard
  battery_before_pct smallint check (battery_before_pct is null or battery_before_pct between 0 and 100),
  battery_after_pct  smallint check (battery_after_pct is null or battery_after_pct between 0 and 100),
  liters_estimated   boolean not null default false,  -- kWh estimés depuis les % de batterie
  photo_path         text,                            -- chemin dans le bucket pump-photos
  notes              text,
  lat                double precision check (lat is null or (lat between -90 and 90)),
  lng                double precision check (lng is null or (lng between -180 and 180)),
  place              text,
  created_by         uuid default auth.uid(),
  created_by_email   text,
  created_at         timestamptz not null default now()
);

create index fillups_vehicle_date on public.fillups (vehicle_id, filled_at desc);

-- ------------------------------------------------------------
-- Sécurité : chaque utilisateur ne voit et ne gère que ses
-- propres véhicules et les pleins qui s'y rattachent.
-- Ne pas laisser les inscriptions publiques ouvertes (voir README).
-- ------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.fillups  enable row level security;

create policy "proprio : lire ses véhicules" on public.vehicles
  for select to authenticated using (user_id = auth.uid());
create policy "proprio : ajouter un véhicule" on public.vehicles
  for insert to authenticated with check (user_id = auth.uid());
create policy "proprio : modifier ses véhicules" on public.vehicles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "proprio : supprimer ses véhicules" on public.vehicles
  for delete to authenticated using (user_id = auth.uid());

create policy "proprio : lire ses pleins" on public.fillups
  for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));
create policy "proprio : ajouter un plein" on public.fillups
  for insert to authenticated
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));
create policy "proprio : modifier ses pleins" on public.fillups
  for update to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));
create policy "proprio : supprimer ses pleins" on public.fillups
  for delete to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = auth.uid()));

-- ------------------------------------------------------------
-- Stockage des photos de pompe (bucket privé, photos par uploadeur)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pump-photos', 'pump-photos', false)
on conflict (id) do nothing;

create policy "proprio : voir ses photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'pump-photos' and owner_id = auth.uid()::text);
create policy "proprio : envoyer une photo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pump-photos' and owner_id = auth.uid()::text);
create policy "proprio : remplacer une photo" on storage.objects
  for update to authenticated
  using (bucket_id = 'pump-photos' and owner_id = auth.uid()::text)
  with check (bucket_id = 'pump-photos' and owner_id = auth.uid()::text);
create policy "proprio : supprimer ses photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pump-photos' and owner_id = auth.uid()::text);
