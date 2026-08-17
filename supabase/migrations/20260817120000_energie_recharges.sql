-- ============================================================
-- Migration : véhicules hybrides rechargeables et électriques
-- Chaque enregistrement porte son énergie : carburant ou recharge.
-- Pour une recharge, la colonne liters contient les kWh et
-- price_per_liter devient de fait un prix au kWh.
-- ============================================================

alter table public.fillups
  add column if not exists energy text not null default 'fuel'
    check (energy in ('fuel', 'electric'));
