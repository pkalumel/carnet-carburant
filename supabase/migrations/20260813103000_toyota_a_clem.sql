-- Attribution : la Toyota Corolla HB/TS appartient à l'utilisateur « clem »
do $$
declare
  uid uuid;
  n int;
begin
  select count(*) into n from auth.users where email ilike '%clem%';
  if n <> 1 then
    raise exception 'attendu exactement 1 compte dont l''email contient « clem », trouvé %', n;
  end if;
  select id into uid from auth.users where email ilike '%clem%';
  update public.vehicles
  set user_id = uid
  where name = 'Toyota Corolla HB/TS';
end $$;
