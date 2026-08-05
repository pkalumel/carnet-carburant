-- ============================================================
-- Carnet Carburant — schéma de base de données Supabase
-- À exécuter une seule fois dans : Dashboard > SQL Editor > New query
-- ============================================================

-- Véhicules de la famille
create table public.vehicles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plate      text,
  created_at timestamptz not null default now()
);

-- Pleins de carburant
create table public.fillups (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  filled_at        timestamptz not null default now(),
  odometer_km      integer check (odometer_km > 0),
  liters           numeric(7,2) check (liters > 0),
  total_price      numeric(8,2) check (total_price >= 0),
  price_per_liter  numeric(6,3) generated always as
                     (case when liters > 0 then round(total_price / liters, 3) end) stored,
  is_full          boolean not null default true,   -- plein complet (à ras bord) ou partiel
  is_draft         boolean not null default false,  -- capture rapide à compléter plus tard
  photo_path       text,                            -- chemin dans le bucket pump-photos
  notes            text,
  created_by       uuid default auth.uid(),
  created_by_email text,
  created_at       timestamptz not null default now()
);

create index fillups_vehicle_date on public.fillups (vehicle_id, filled_at desc);

-- ------------------------------------------------------------
-- Sécurité : application familiale — tout utilisateur connecté
-- voit et gère l'ensemble des données. Ne pas laisser les
-- inscriptions publiques ouvertes (voir README).
-- ------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.fillups  enable row level security;

create policy "famille : lire les véhicules"      on public.vehicles for select to authenticated using (true);
create policy "famille : ajouter un véhicule"     on public.vehicles for insert to authenticated with check (true);
create policy "famille : modifier un véhicule"    on public.vehicles for update to authenticated using (true);
create policy "famille : supprimer un véhicule"   on public.vehicles for delete to authenticated using (true);

create policy "famille : lire les pleins"         on public.fillups for select to authenticated using (true);
create policy "famille : ajouter un plein"        on public.fillups for insert to authenticated with check (true);
create policy "famille : modifier un plein"       on public.fillups for update to authenticated using (true);
create policy "famille : supprimer un plein"      on public.fillups for delete to authenticated using (true);

-- ------------------------------------------------------------
-- Stockage des photos de pompe (bucket privé)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pump-photos', 'pump-photos', false)
on conflict (id) do nothing;

create policy "famille : voir les photos"       on storage.objects for select to authenticated using (bucket_id = 'pump-photos');
create policy "famille : envoyer une photo"     on storage.objects for insert to authenticated with check (bucket_id = 'pump-photos');
create policy "famille : supprimer une photo"   on storage.objects for delete to authenticated using (bucket_id = 'pump-photos');
