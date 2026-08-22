-- ============================================================
-- Partage de véhicules par invitation : un propriétaire invite
-- une personne par e-mail à encoder les pleins/recharges d'un ou
-- plusieurs de ses véhicules. L'invité voit tout l'historique des
-- véhicules partagés, ajoute des saisies, ne modifie/supprime que
-- les siennes, et ne touche jamais aux véhicules eux-mêmes.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Table des partages.
--    owner_id ET owner_email sont dénormalisés à dessein :
--    - owner_id permet aux policies de cette table de ne référencer
--      AUCUNE autre table (invariant anti-récursion RLS à préserver) ;
--    - owner_email montre à l'invité de qui vient le partage sans
--      exposer auth.users (obsolète si le proprio change d'e-mail :
--      purement cosmétique).
--    guest_id null = invitation en attente d'inscription.
-- ------------------------------------------------------------
create table public.vehicle_shares (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  guest_email text not null,  -- toujours en minuscules (normalisé par invite_guest)
  guest_id    uuid references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (vehicle_id, guest_email)
);

create index vehicle_shares_owner_idx on public.vehicle_shares (owner_id);
create index vehicle_shares_guest_idx on public.vehicle_shares (guest_id);
create index vehicle_shares_pending_idx on public.vehicle_shares (guest_email)
  where guest_id is null;

alter table public.vehicle_shares enable row level security;

-- Pas de policy INSERT ni UPDATE : les écritures ne passent que par
-- les fonctions SECURITY DEFINER ci-dessous (aucun insert forgé
-- possible via l'API, aucun WITH CHECK à sous-requête nécessaire).
create policy "partage : le proprio voit ses invitations" on public.vehicle_shares
  for select to authenticated using (owner_id = auth.uid());
create policy "partage : l'invité voit ses partages" on public.vehicle_shares
  for select to authenticated using (guest_id = auth.uid());
create policy "partage : le proprio révoque" on public.vehicle_shares
  for delete to authenticated using (owner_id = auth.uid());
create policy "partage : l'invité quitte" on public.vehicle_shares
  for delete to authenticated using (guest_id = auth.uid());

-- ------------------------------------------------------------
-- 2) Véhicules : l'invité peut LIRE les véhicules partagés.
--    INSERT/UPDATE/DELETE restent strictement propriétaire : les
--    caractéristiques d'un véhicule ne sont jamais modifiables par
--    un invité, garanti côté serveur.
-- ------------------------------------------------------------
drop policy "proprio : lire ses véhicules" on public.vehicles;
create policy "proprio ou invité : lire les véhicules" on public.vehicles
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.vehicle_shares s
               where s.vehicle_id = vehicles.id and s.guest_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 3) Pleins : lecture pour proprio et invités ; ajout signé
--    (created_by = auth.uid(), satisfait par le default) ;
--    modification/suppression pour le proprio du véhicule ou
--    l'auteur de la saisie. Le WITH CHECK re-testé à l'UPDATE
--    empêche un invité de déplacer sa saisie vers un véhicule
--    non partagé.
-- ------------------------------------------------------------
drop policy "proprio : lire ses pleins"      on public.fillups;
drop policy "proprio : ajouter un plein"     on public.fillups;
drop policy "proprio : modifier ses pleins"  on public.fillups;
drop policy "proprio : supprimer ses pleins" on public.fillups;

create policy "proprio ou invité : lire les pleins" on public.fillups
  for select to authenticated
  using (
    exists (select 1 from public.vehicles v
            where v.id = fillups.vehicle_id and v.user_id = auth.uid())
    or exists (select 1 from public.vehicle_shares s
               where s.vehicle_id = fillups.vehicle_id and s.guest_id = auth.uid())
  );

create policy "proprio ou invité : ajouter un plein" on public.fillups
  for insert to authenticated
  with check (
    exists (select 1 from public.vehicles v
            where v.id = fillups.vehicle_id and v.user_id = auth.uid())
    or (created_by = auth.uid()
        and exists (select 1 from public.vehicle_shares s
                    where s.vehicle_id = fillups.vehicle_id and s.guest_id = auth.uid()))
  );

create policy "proprio ou auteur : modifier un plein" on public.fillups
  for update to authenticated
  using (
    exists (select 1 from public.vehicles v
            where v.id = fillups.vehicle_id and v.user_id = auth.uid())
    or (created_by = auth.uid()
        and exists (select 1 from public.vehicle_shares s
                    where s.vehicle_id = fillups.vehicle_id and s.guest_id = auth.uid()))
  )
  with check (
    exists (select 1 from public.vehicles v
            where v.id = fillups.vehicle_id and v.user_id = auth.uid())
    or (created_by = auth.uid()
        and exists (select 1 from public.vehicle_shares s
                    where s.vehicle_id = fillups.vehicle_id and s.guest_id = auth.uid()))
  );

create policy "proprio ou auteur : supprimer un plein" on public.fillups
  for delete to authenticated
  using (
    exists (select 1 from public.vehicles v
            where v.id = fillups.vehicle_id and v.user_id = auth.uid())
    or (created_by = auth.uid()
        and exists (select 1 from public.vehicle_shares s
                    where s.vehicle_id = fillups.vehicle_id and s.guest_id = auth.uid()))
  );

-- ------------------------------------------------------------
-- 4) Photos : chacun voit les photos des pleins qu'il peut lire
--    (la RLS de fillups/vehicles s'applique aussi dans la
--    sous-requête : conditions identiques, terminaison garantie).
--    Le proprio peut remplacer la photo d'une saisie d'invité
--    (compléter un brouillon). INSERT/DELETE inchangées : si le
--    proprio supprime un plein d'invité photographié, la photo
--    devient orpheline — tracée par admin_health.orphan_photos.
-- ------------------------------------------------------------
create index fillups_photo_path_idx on public.fillups (photo_path)
  where photo_path is not null;

drop policy "proprio : voir ses photos" on storage.objects;
create policy "proprio ou invité : voir les photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pump-photos'
    and (
      owner_id = auth.uid()::text
      or exists (
        select 1 from public.fillups f
        join public.vehicles v on v.id = f.vehicle_id
        where f.photo_path = storage.objects.name
          and (v.user_id = auth.uid()
               or exists (select 1 from public.vehicle_shares s
                          where s.vehicle_id = v.id and s.guest_id = auth.uid()))
      )
    )
  );

drop policy "proprio : remplacer une photo" on storage.objects;
create policy "uploadeur ou proprio : remplacer une photo" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pump-photos'
    and (
      owner_id = auth.uid()::text
      or exists (select 1 from public.fillups f
                 join public.vehicles v on v.id = f.vehicle_id
                 where f.photo_path = storage.objects.name and v.user_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'pump-photos'
    and (
      owner_id = auth.uid()::text
      or exists (select 1 from public.fillups f
                 join public.vehicles v on v.id = f.vehicle_id
                 where f.photo_path = storage.objects.name and v.user_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 5) invite_guest : crée (ou complète) les partages pour une
--    adresse. Idempotente : ré-inviter ajoute les véhicules
--    manquants et rattache guest_id si le compte est apparu.
--    L'e-mail d'invitation lui-même est envoyé par l'Edge
--    Function invite-guest quand user_exists = false.
-- ------------------------------------------------------------
create or replace function public.invite_guest(p_email text, p_vehicle_ids uuid[])
returns jsonb
language plpgsql volatile
security definer set search_path = public, pg_temp
as $$
declare
  v_email    text := lower(trim(p_email));
  v_me       uuid := auth.uid();
  v_my_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_guest    uuid;
  v_owned    int;
begin
  if v_me is null then
    raise exception 'non authentifié' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'adresse e-mail invalide';
  end if;
  if v_email = v_my_email then
    raise exception 'impossible de partager avec soi-même';
  end if;
  if p_vehicle_ids is null or coalesce(array_length(p_vehicle_ids, 1), 0) = 0 then
    raise exception 'aucun véhicule sélectionné';
  end if;

  select count(*) into v_owned from public.vehicles
   where id = any(p_vehicle_ids) and user_id = v_me;
  if v_owned <> array_length(p_vehicle_ids, 1) then
    raise exception 'véhicule inconnu ou non possédé' using errcode = '42501';
  end if;

  select id into v_guest from auth.users where lower(email) = v_email limit 1;

  insert into public.vehicle_shares (vehicle_id, owner_id, owner_email, guest_email, guest_id)
  select vid, v_me, v_my_email, v_email, v_guest
  from unnest(p_vehicle_ids) as vid
  on conflict (vehicle_id, guest_email)
    do update set guest_id = coalesce(excluded.guest_id, vehicle_shares.guest_id);

  return jsonb_build_object(
    'user_exists', v_guest is not null,
    'invited', array_length(p_vehicle_ids, 1)
  );
end;
$$;

-- ------------------------------------------------------------
-- 6) claim_shares : rattache à l'utilisateur connecté les
--    invitations en attente qui portent son adresse. Appelée au
--    démarrage de l'app (couvre aussi l'inscription normale sans
--    passer par le lien d'invitation).
-- ------------------------------------------------------------
create or replace function public.claim_shares()
returns integer
language sql volatile
security definer set search_path = public, pg_temp
as $$
  with updated as (
    update public.vehicle_shares
       set guest_id = auth.uid()
     where auth.uid() is not null
       and guest_id is null
       and guest_email = lower(coalesce(auth.jwt()->>'email', ''))
    returning 1
  )
  select count(*)::int from updated;
$$;

-- ------------------------------------------------------------
-- 7) Privilèges : Postgres accorde EXECUTE à PUBLIC par défaut et
--    PostgREST exposerait donc ces fonctions aux anonymes.
-- ------------------------------------------------------------
revoke execute on function public.invite_guest(text, uuid[]) from public, anon;
grant  execute on function public.invite_guest(text, uuid[]) to authenticated;

revoke execute on function public.claim_shares() from public, anon;
grant  execute on function public.claim_shares() to authenticated;
