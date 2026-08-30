# Product Context

Last updated: 2026-08-30

## Product

Carbuvolt — PWA familiale installable (mobile d'abord) de suivi des pleins de
carburant **et des recharges électriques** : plusieurs véhicules, plusieurs
utilisateurs, photos de pompe, saisie hors ligne, historique partagé et
statistiques (L/100 km, kWh/100 km, coût mensuel, coût au km, prix unitaire).
Résultat visé : enregistrer une opération en moins de 10 secondes à la pompe
(au pire une photo) et en tirer des chiffres fiables pour la famille —
notamment pour éclairer un éventuel changement de véhicule.

## Target users

Personas documentés dans `docs/SPECIFICATIONS.md` §2 :

- **P1 Patrick, conducteur-administrateur** : installe et administre, saisit
  complet avec kilométrage, consomme les statistiques.
- **P2 Marie, conductrice pressée** : uniquement à la station, réseau parfois
  médiocre ; une photo de la pompe doit suffire.
- **P3 Théo, jeune conducteur occasionnel** : emprunte la seconde voiture,
  a besoin d'une interface qui empêche de « mal faire ».

## Core jobs

- Enregistrer un plein ou une recharge en < 10 s (3 champs max par parcours).
- Ne jamais perdre une opération : hors ligne → file d'attente, pas le temps →
  photo « à compléter ».
- Connaître la consommation réelle (entre pleins/charges complets) et les coûts
  (mois, km, unité) par véhicule et pour le foyer.
- Tracer qui a saisi quoi (auteur, lieu, photo) sur les véhicules partagés.

## Business goals

- Usage familial durable à **coût d'exploitation nul** (Supabase free tier,
  Vercel hobby) — pas d'objectif commercial.

## Non-goals

- Pas de produit public multi-tenant ni de gestion de flotte professionnelle.
- Pas d'abonnement ni de monétisation (frustration explicite du persona P1
  envers « les apps qui exigent un abonnement »).
- Pas de comptabilité au centime des recharges domestiques : l'estimation par
  % de batterie assume d'ignorer les pertes de recharge (affiché à l'écran).

## Critical workflows

- Saisie d'un plein/d'une recharge, y compris hors ligne (outbox IndexedDB,
  synchronisation idempotente au retour du réseau) — `src/lib/db.ts`,
  `src/lib/outbox.ts`.
- Capture rapide photo → brouillon « À compléter » → complétion depuis
  l'historique — `QuickCapture.tsx`, `History.tsx`.
- Calcul de consommation entre pleins complets munis d'un kilométrage
  (partiels absorbés dans la période, brouillons exclus) — `src/lib/stats.ts`.
- Recharge domicile estimée par % de batterie (kWh = capacité × Δ%, coût au
  tarif maison, marquage `liters_estimated`) — `src/lib/entryModel.ts`.
- Partage de véhicules par invitation (RLS propriétaire/invité, fonction edge
  `invite-guest`) — migration `20260822120000_partage_invites.sql`.

## Product principles

Principes observés dans le code et les décisions récentes :

- **3 données manuelles max par parcours** ; tout ce qui est calculable est
  calculé, jamais demandé (prix unitaire, kWh estimés) — commit `79b5d08`.
- **Avertir, ne pas bloquer** : les garde-fous de plausibilité n'empêchent
  jamais l'enregistrement (« l'utilisateur en station a raison contre
  l'algorithme ») — seule exception : % après ≤ % avant. `src/lib/plausibility.ts`.
- **Une opération incomplète n'est jamais silencieusement complète** : statuts
  Complet / Complet—estimation / À compléter — `src/lib/completeness.ts`.
- **La création fonctionne toujours**, même sans réseau ; la complétude peut
  être différée (« Enregistrer et compléter plus tard »).
- **Compatibilité descendante** : replis « colonne absente » côté client pour
  les bases pas encore migrées ; clés localStorage `carnet:*` conservées.

## Constraints

- Technical: React 19 + Vite + TS, Supabase (PostgreSQL/Auth/Storage),
  `price_per_liter` est une colonne générée (jamais l'envoyer) ; la
  **modification** d'une saisie exige d'être en ligne (seule la création
  fonctionne hors ligne).
- Operational: free tiers (1 Go de storage photos) ; inscriptions Supabase
  **actuellement ouvertes** — à fermer après création des comptes (README §2).
- Legal or regulatory: aucune exigence identifiée (usage familial privé, UE).
- Connectivity and device: mobile d'abord (iPhone/Android, PWA installée),
  réseau médiocre en station ; l'app se charge sans réseau (service worker).
- Accessibility: WCAG AA (contrastes), cibles tactiles ≥ 44 px, claviers
  numériques, virgule ou point — vérifiés par `scripts/verify-ux.mjs`.

## Data and trust

- Sensitive or regulated data: emails des membres, géolocalisation des saisies
  (lat/lng/lieu, retirable à la saisie), photos de pompe (bucket privé, URLs
  signées 1 h).
- Auditability requirements: auteur (`created_by`, `created_by_email`) sur
  chaque saisie ; seuls le propriétaire du véhicule ou l'auteur modifient.
- Values that may be inferred or estimated: kWh et coût des recharges domicile
  (marqués `liters_estimated`, badge « Estimé », exclus de la courbe de prix) ;
  prix unitaire toujours calculé ; compteur suggéré (dernier relevé + habitude).
- Required correction and recovery paths: édition complète depuis l'historique,
  suppression avec « Annuler » (6 s), brouillons complétables par n'importe
  quel membre, avertissements avec « Corriger » / « C'est normal ».

## Current evidence

- Retour d'un bêta-testeur (30 août 2026) : trop de champs à la saisie ; à la
  maison il n'y a pas de compteur kWh, seulement le % du tableau de bord →
  formulaire adaptatif à 3 champs livré (commit `79b5d08`), vérifié par
  26 contrôles Playwright de bout en bout sur la base migrée.
- Audit UX/UI en conditions réelles émulées du 12 août 2026
  (`docs/AUDIT-UX-UI.md` ; iPhone 13 émulé, données réalistes).
- Crawler de vérification `scripts/verify-ux.mjs` : navigation, cibles
  tactiles, ARIA, contrastes, parcours critiques — 100 % PASS attendu en CI
  manuelle.
- **Aucune analytics produit** : aucun traqueur côté client ; les seules
  mesures possibles aujourd'hui sont des requêtes SQL sur la base.

## Assumptions

- Le foyer utilise l'app en routine réelle (aucune mesure d'usage ne le
  confirme ni ne l'infirme).
- Les personas P2/P3 (Marie, Théo) reflètent des usages réels et pas
  seulement l'intention de conception.
- Le parcours à 3 champs atteint bien l'objectif « < 10 s » — plausible mais
  non mesuré.
- Un tarif domicile constant (€/kWh) approxime suffisamment le coût réel des
  recharges maison pour les décisions visées.

## Open questions

- Faut-il instrumenter l'usage (même minimalement) ou l'échelle familiale
  rend-elle l'observation directe suffisante ?
- Politique de rétention/purge des photos quand le quota storage (1 Go free
  tier) approchera.
