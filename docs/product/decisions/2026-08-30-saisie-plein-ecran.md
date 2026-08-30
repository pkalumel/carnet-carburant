# Product Decision: Saisie en plein écran, clavier au premier tap

- Date: 2026-08-30
- Status: accepted
- Related feature: Formulaire adaptatif 3 champs · Signal S4

## Context

Sur iPhone, toucher « + » ouvrait une feuille depuis le bas avec autofocus
sur le premier champ : le clavier iOS faisait défiler le champ dans le
conteneur défilant de la feuille, masquant le titre et le choix du véhicule.
Verbatim : « on ne sait pas trop où on est » ; la feuille partielle « ne
s'intègre pas bien dans l'ergonomie de l'application ». L'autofocus, pensé
pour la vitesse (< 10 s), coûtait l'orientation.

Choix validés avec l'utilisateur (question à deux volets) : présentation
plein écran (recommandée) et clavier au premier tap (recommandé).

## Decision

1. La saisie (création **et** édition/complétion depuis l'historique) s'ouvre
   dans un **écran plein cadre** réutilisant le composant `.page-modal`
   existant : en-tête fixe (surtitre Carburant/Recharge, titre, bouton ✕
   44 px), corps défilant, bouton Enregistrer collant en bas.
2. **Aucun autofocus de champ** : le clavier n'apparaît qu'au tap. Le focus
   initial va au bouton ✕ (accessibilité clavier, n'ouvre pas le clavier).
3. La feuille depuis le bas reste pour le **petit** formulaire « Ajouter un
   véhicule » — bon usage du motif.

## Alternatives

| Alternative | Why not selected |
| --- | --- |
| Feuille corrigée (pleine hauteur, en-tête épinglé) | Proposée à l'utilisateur, non retenue — le motif feuille lui-même était jugé mal intégré |
| Garder l'autofocus mais ancrer le défilement en haut | Le clavier masquerait quand même la moitié basse ; proposé, non retenu |
| Écran de saisie comme onglet permanent | Perd le modèle modal (retour explicite), plus gros chantier de navigation |

## Consequences

- Positive: contexte toujours visible (titre, véhicule, mode) ; cohérence
  visuelle avec le reste de l'app ; fermeture explicite (✕).
- Negative: un tap de plus avant de taper les litres.
- Risks: si la famille perçoit la saisie comme plus lente, réévaluer un
  autofocus optionnel (réglage) — déclencheur ci-dessous.

## Reversal or review trigger

Retour famille « la saisie est plus lente qu'avant » répété, ou temps de
saisie observé sensiblement dégradé → réexaminer l'autofocus en option.
