# Product Signals

Record observations before turning them into features. Keep evidence, interpretation, and proposed solution separate.

| ID | Date | Source | User/context | Observation or request | Affected job | Frequency/reach | Consequence | Confidence | Related feature |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 2026-08-30 | Retour bêta-testeur (relayé par Patrick) | Conducteur VE/hybride, recharges à domicile | Trop de champs à la saisie ; à la maison il n'y a pas de compteur kWh, seulement le % de batterie du tableau de bord (relevé avant/après) ; les bornes publiques donnent kWh + prix | Enregistrer une recharge en < 10 s sans perdre la complétude | Chaque recharge domicile (quotidien pour un VE) | Saisies abandonnées ou fausses (kWh inventés), stats faussées | Haute (précision d'usage concrète, deux parcours distincts décrits) | Formulaire adaptatif 3 champs — livré, commit `79b5d08` |
| S2 | 2026-08-12 | Audit UX/UI (`docs/AUDIT-UX-UI.md`) | Parcours complet émulé (iPhone 13, données réalistes) | Constats d'ergonomie et d'accessibilité ayant mené au design « signalétique » et au crawler de vérification | Tous | — | — | Haute (audit outillé) | `scripts/verify-ux.mjs` |
| S3 | 2026-08-30 | Patrick, usage réel (capture d'écran) | Recharge du VW Caddy eHybrid (19,7 kWh utiles) sur borne : 21,44 kWh / 14,86 € | Deux fausses alertes sur une saisie légitime : « kWh > capacité » (la borne facture l'énergie délivrée, pertes ≈ 9 % incluses) et « conso inhabituelle » (9,7 vs 4,4 kWh/100 — km partagés essence/électrique sur un hybride) ; libellés « Batterie avant/après (optionnel) » débordant de la feuille | Confiance dans les garde-fous ; saisie sans friction | Chaque recharge borne d'un hybride | Fatigue d'alerte : « C'est normal » cliqué par réflexe, les vraies erreurs passeront | Haute (données réelles chiffrées) | Tolérance pertes + conso ignorée en bi-énergie + fix grille (décision `2026-08-30-tolerance-pertes-recharge`) |

## Review notes

### 2026-08-30

- New patterns: la complétude doit venir de l'adaptation du formulaire au
  contexte (domicile vs borne, carburant vs électrique), pas de champs
  supplémentaires.
- Contradictory evidence: aucune.
- Decisions: formulaire adaptatif à 3 champs par parcours ; kWh/coût des
  recharges domicile estimés depuis les % et **matérialisés** en base avec
  marquage `liters_estimated` ; statuts Complet / Complet—estimation /
  À compléter ; « Enregistrer et compléter plus tard ». Implémenté et vérifié
  (26 contrôles Playwright), commit `79b5d08`.
- Assumptions to test next: le parcours 3 champs atteint réellement « < 10 s » ;
  les membres renseignent la capacité batterie des VE (sinon le mode domicile
  reste inutilisable) ; le tarif domicile constant suffit.
