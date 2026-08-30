# Product Metrics

Last updated: 2026-08-30

> Aucune analytics client n'est en place (choix assumé : app familiale, coût
> nul, vie privée). Toutes les mesures ci-dessous sont calculables par requête
> SQL sur Supabase.
>
> **Baseline relevée le 30 août 2026** (données du foyer, compte de test
> exclu) : 3 comptes, 2 véhicules — Mercedes GLB (électrique, aucune saisie)
> et VW Caddy (hybride rechargeable, tarif maison 0,2470 €/kWh, 5 saisies du
> 14 au 29 août dont 4 recharges). 0 brouillon, 0 photo, 0 recharge estimée
> (fonctionnalité livrée le 30 août). **Aucun des deux véhicules n'a de
> capacité batterie renseignée** : le mode « À domicile » par % est
> inutilisable tant que ce n'est pas corrigé.

## Primary outcome

- Outcome: des statistiques de consommation/coût **fiables**, donc alimentées
  par des saisies complètes.
- Metric: part des saisies non-brouillon avec kilométrage renseigné (le
  kilométrage conditionne le calcul de consommation).
- Baseline: **60 % (3/5)** au 30 août 2026 ; 0 brouillon > 7 jours.
- Target: ≥ 80 % des saisies avec kilométrage ; zéro brouillon de plus de
  7 jours.
- Review window: trimestriel, ou après tout changement du formulaire de saisie.

## Critical workflows

| Workflow | Success metric | Failure metric | Baseline (30/08/2026) | Target | Instrumentation |
| --- | --- | --- | --- | --- | --- |
| Saisie plein/recharge | saisie enregistrée avec les 3 champs du parcours | brouillons « À compléter » créés faute de données | 0 brouillon / 5 saisies | brouillons < 20 % des saisies | SQL : `is_draft`, `odometer_km` |
| Complétion des brouillons | délai photo → complétion | brouillons orphelins > 7 jours | 0 brouillon, 0 orphelin | 0 orphelin | SQL : `is_draft`, `created_at` |
| Synchronisation hors ligne | file d'attente vidée au retour du réseau | pleins bloqués en attente | non mesurable côté serveur (état local) | — | observation directe (badge « En attente ») |
| Recharges domicile estimées | recharges avec % avant/après et capacité renseignée | recharges domicile sans estimation possible | **0/2 véhicules avec `battery_kwh`** ; 0 recharge estimée (feature du jour) | 100 % des VE avec `battery_kwh` renseigné | SQL : `liters_estimated`, `vehicles.battery_kwh` |
| Calcul de consommation | périodes de conso calculables par véhicule | trous (pleins complets sans compteur) | Caddy : 3 pleins complets avec compteur (14–29/08) ; GLB : aucune saisie | ≥ 1 point de conso / mois / véhicule actif | SQL : reproduire `consumptionSeries` |

## Quality and trust

- Error rate: non instrumenté (pas de télémétrie d'erreurs) ; `pageerror` = 0
  exigé dans le crawler `scripts/verify-ux.mjs`.
- Correction rate: mesurable en SQL seulement approximativement (pas
  d'historique des modifications) — limite connue.
- Missing critical data: saisies sans kilométrage ; brouillons anciens.
- Measured versus estimated values: part des kWh estimés (`liters_estimated`)
  dans le total des recharges — les estimations sont badgées à l'écran et
  exclues de la courbe de prix.
- Support or reconciliation effort: non applicable (support = Patrick).

## Guardrails

- Performance: bundle initial ≈ 420 kB (stats à la demande) ; photos
  compressées ≤ 1600 px avant envoi.
- Accessibility: WCAG AA, cibles ≥ 44 px, ARIA sur les boutons — vérifiés par
  `scripts/verify-ux.mjs` (doit rester 100 % PASS).
- Privacy and security: RLS propriétaire/invité sur toutes les tables ; bucket
  photos privé (URLs signées 1 h) ; inscriptions publiques à fermer après
  l'installation familiale ; géolocalisation retirable à la saisie.
- Reliability: synchronisation idempotente (id fixes, doublon 23505 toléré) ;
  replis « colonne absente » pour les bases pas encore migrées.
- Cost: 0 € (free tiers) ; surveiller le quota storage photos (1 Go —
  0 photo / 0 Mo au 30 août 2026).

## Measurement limitations

- Aucune analytics client : pas de mesure du temps de saisie réel (« < 10 s »
  reste une hypothèse), ni des échecs silencieux côté téléphone.
- Pas d'historique des modifications en base : le taux de correction est
  inobservable a posteriori.
- L'état de la file hors ligne est purement local : invisible côté serveur.
- Échelle familiale : effectifs trop faibles pour toute lecture statistique —
  interpréter les chiffres comme des faits individuels, pas des tendances.
