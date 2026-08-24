-- ============================================================
-- Tarif électricité à domicile, par véhicule (€/kWh).
-- Sert la saisie : pour une recharge « Maison », le prix au kWh
-- est appliqué automatiquement — il ne reste que les kWh à saisir.
-- ============================================================
alter table public.vehicles add column home_kwh_price numeric(6,4)
  check (home_kwh_price is null or home_kwh_price > 0);
