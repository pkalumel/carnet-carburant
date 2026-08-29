-- ============================================================
-- Capacité de batterie et recharges domestiques estimées par %.
-- À exécuter dans : Dashboard > SQL Editor > New query
--
-- Une recharge « À domicile » est saisie en % de batterie (avant/après) :
-- les kWh estimés (battery_kwh × Δ% / 100) sont MATÉRIALISÉS dans liters
-- et le coût estimé (kWh × home_kwh_price) dans total_price, pour que la
-- colonne générée price_per_liter, les stats et l'export continuent de
-- fonctionner tels quels. liters_estimated distingue mesuré / estimé.
-- ============================================================

alter table public.vehicles
  add column if not exists battery_kwh numeric(6,2)
    check (battery_kwh is null or battery_kwh > 0);

alter table public.fillups
  add column if not exists battery_before_pct smallint
    check (battery_before_pct is null or battery_before_pct between 0 and 100);

alter table public.fillups
  add column if not exists battery_after_pct smallint
    check (battery_after_pct is null or battery_after_pct between 0 and 100);

alter table public.fillups
  add column if not exists liters_estimated boolean not null default false;
