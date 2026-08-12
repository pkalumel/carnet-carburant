-- Normalisation : plaques d'immatriculation en majuscules
-- (la saisie force désormais les majuscules côté client)
update public.vehicles
set plate = upper(plate)
where plate is not null
  and plate <> upper(plate);
