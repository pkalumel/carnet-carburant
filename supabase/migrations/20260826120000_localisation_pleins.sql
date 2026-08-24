-- ============================================================
-- Localisation d'un plein / d'une recharge : position capturée au
-- moment de la saisie (optionnelle, jamais bloquante) + libellé
-- lisible obtenu par géocodage inverse côté client.
-- ============================================================
alter table public.fillups
  add column lat double precision check (lat is null or (lat >= -90 and lat <= 90)),
  add column lng double precision check (lng is null or (lng >= -180 and lng <= 180)),
  add column place text;
