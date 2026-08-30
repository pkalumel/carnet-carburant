# Product Decision: Garde-fous de recharge — tolérance des pertes et bi-énergie

- Date: 2026-08-30
- Status: accepted
- Related feature: Formulaire adaptatif 3 champs (commit `79b5d08`) · Signal S3

## Context

Première recharge réelle saisie après la livraison du formulaire adaptatif
(VW Caddy eHybrid, 19,7 kWh utiles, borne publique : 21,44 kWh / 14,86 €) :
deux avertissements ont été émis sur une saisie parfaitement légitime.

Faits physiques :

- Une borne mesure l'énergie **délivrée** (côté réseau AC) ; la batterie
  stocke moins après conversion et gestion thermique — pertes typiques de
  8 à 20 %. 21,44 kWh délivrés pour 19,7 kWh utiles = 8,8 % de pertes : une
  charge ~0→100 % normale. Comparer les kWh de la borne à la capacité utile
  est donc structurellement faux au seuil 1×.
- Sur un hybride rechargeable, la distance entre deux relevés est propulsée
  par les **deux** énergies : les kWh/100 (ou L/100) calculés sur la distance
  totale varient avec la part de roulage électrique du trajet, pas avec une
  erreur de saisie. La bande ±40 % produit des alertes récurrentes.

Risque produit : la fatigue d'alerte. Si « C'est normal » devient un réflexe,
les garde-fous ne protègent plus rien.

## Decision

1. `kwh-capacite` ne se déclenche qu'au-delà de **capacité × 1,35**
   (constante `CHARGE_LOSS_FACTOR`, `src/lib/plausibility.ts`) : la marge
   couvre les pertes réalistes (jusqu'à ~20 %) plus le préconditionnement,
   tout en attrapant les fautes de frappe (décimale, facteur 10).
2. `conso-inhabituelle` est **désactivé pour les véhicules bi-énergie**
   (hybrides rechargeables) et conservé pour les mono-énergie.
3. Correctif d'affichage : `min-width: 0` sur les items de `.field-grid`
   (une colonne de grille ne rétrécit pas sous un libellé `nowrap`) et
   libellés % raccourcis (« Batterie avant/après », mention « optionnels »
   déplacée en hint).

## Alternatives

| Alternative | Why not selected |
| --- | --- |
| Demander la capacité **brute** (25,7 kWh) au lieu de l'utile | Fausserait l'estimation domicile par % (le tableau de bord affiche des % de l'utile) pour arranger un seul contrôle |
| Coefficient de pertes configurable par véhicule | Un réglage de plus pour un garde-fou : complexité disproportionnée en v1 |
| Élargir la bande de conso à ±80 % pour les hybrides | Resterait arbitraire : la variance dépend du mix de trajets, pas d'un seuil |
| Supprimer le contrôle de capacité | Perdrait la détection des vraies fautes de frappe (214 au lieu de 21,4) |

## Consequences

- Positive: plus de fausse alerte sur les recharges normales ; les
  avertissements restants redeviennent signifiants.
- Negative: une saisie erronée entre 1× et 1,35× la capacité n'est plus
  signalée (jugé acceptable : l'erreur est petite et corrigeable a posteriori).
- Risks: le vieillissement batterie (jusqu'à −25 % après 8 ans selon la fiche
  constructeur) élargit de fait la marge réelle ; la capacité saisie est à
  entretenir par l'utilisateur.

## Reversal or review trigger

Revoir le facteur 1,35 si une faute de frappe réelle passe sous le seuil, ou
si un retour terrain montre des pertes systématiquement hors bande. Revoir la
désactivation bi-énergie si un jour l'app sait attribuer les km à chaque
énergie (p. ex. via les % de batterie relevés).
