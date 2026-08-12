-- ============================================================
-- Migration : type de carburant + isolation par utilisateur
-- À exécuter une seule fois dans : Dashboard > SQL Editor > New query
-- (le schéma de référence pour une installation neuve est schema.sql)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Type de carburant sur la fiche véhicule
-- ------------------------------------------------------------
alter table public.vehicles add column if not exists fuel text;

-- ------------------------------------------------------------
-- 2. Propriétaire du véhicule
-- ------------------------------------------------------------
alter table public.vehicles
  add column if not exists user_id uuid references auth.users(id) default auth.uid();

-- Reprise de l'existant : chaque véhicule revient à l'auteur de son
-- premier plein (fillups.created_by est rempli depuis l'origine).
update public.vehicles v
set user_id = sub.created_by
from (
  select distinct on (vehicle_id) vehicle_id, created_by
  from public.fillups
  where created_by is not null
  order by vehicle_id, created_at asc
) sub
where v.id = sub.vehicle_id
  and v.user_id is null;

-- Véhicules sans aucun plein : attribués au plus ancien compte
-- (le compte « administrateur » de la famille).
update public.vehicles
set user_id = (select id from auth.users order by created_at asc limit 1)
where user_id is null;

alter table public.vehicles alter column user_id set not null;

-- ------------------------------------------------------------
-- 3. Politiques : chacun ne voit que SES véhicules et SES pleins
-- ------------------------------------------------------------
drop policy if exists "famille : lire les véhicules"    on public.vehicles;
drop policy if exists "famille : ajouter un véhicule"   on public.vehicles;
drop policy if exists "famille : modifier un véhicule"  on public.vehicles;
drop policy if exists "famille : supprimer un véhicule" on public.vehicles;
drop policy if exists "famille : lire les pleins"       on public.fillups;
drop policy if exists "famille : ajouter un plein"      on public.fillups;
drop policy if exists "famille : modifier un plein"     on public.fillups;
drop policy if exists "famille : supprimer un plein"    on public.fillups;

create policy "proprio : lire ses véhicules" on public.vehicles
  for select to authenticated using (user_id = auth.uid());
create policy "proprio : ajouter un véhicule" on public.vehicles
  for insert to authenticated with check (user_id = auth.uid());
create policy "proprio : modifier ses véhicules" on public.vehicles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "proprio : supprimer ses véhicules" on public.vehicles
  for delete to authenticated using (user_id = auth.uid());

-- Les pleins suivent la propriété du véhicule
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
-- 4. Photos : chacun ne voit que les siennes (owner_id = uploadeur)
-- ------------------------------------------------------------
drop policy if exists "famille : voir les photos"     on storage.objects;
drop policy if exists "famille : envoyer une photo"   on storage.objects;
drop policy if exists "famille : supprimer une photo" on storage.objects;

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
