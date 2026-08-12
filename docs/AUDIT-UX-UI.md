# Audit UX/UI — Carnet Carburant

*12 août 2026 — audit en conditions réelles : iPhone 13 émulé (Playwright, navigation humaine), compte de test `pka@luka.com`, données réalistes semées via l'interface (3 véhicules, 11 pleins dont 1 partiel et 1 brouillon photo). L'audit porte sur le design « signalétique » (commit `fcb1278`) servi en local — Vercel servait encore l'ancien build au moment des captures.*

---

## Verdict global

Le socle est bon : la **Capture rapide** est exactement le bon geste à la pompe (2 secondes, une main, on encode plus tard), le mode hors-ligne est un vrai différenciateur, l'identité visuelle (encre/or, chiffres odomètre) est cohérente et les contrastes/cibles tactiles sont corrects.

Trois problèmes **structurants** empêchent cependant l'app d'être vraiment intuitive :

1. un **bug analytique** rend les statistiques agrégées fausses (et donc décrédibilise tout l'onglet Stats) ;
2. la **double sélection de véhicule** (pastilles de filtre + menu déroulant du formulaire) crée un modèle mental ambigu et un risque d'enregistrer sur le mauvais véhicule ;
3. le **formulaire de saisie est trop long** pour son cas d'usage dominant (litres + prix, tout le reste a une valeur par défaut).

---

## P0 — À corriger en priorité

### 1. Stats « Tous les véhicules » : conso et coût au km faux
Constaté : « Conso moyenne **0,2 L/100** », « Coût au km **0,3 c€/km** » alors que les vrais chiffres par véhicule sont 5,6 et 6,5 L/100. `summarize()` calcule les deltas d'odomètre à travers des véhicules différents (le passage Clio 87 990 km → Kangoo 143 200 km devient une « distance parcourue »).

**Recommandation** : calculer les agrégats **par véhicule**, puis pondérer par les km parcourus — ou masquer « Conso moyenne » et « Coût au km » en vue « Tous » (seuls « Total dépensé » et « Prix moyen » ont un sens agrégé simple). Un chiffre faux est pire qu'un chiffre absent.

### 2. Deux sélecteurs de véhicule en concurrence sur l'écran Plein
En haut : pastilles de filtre (« Tous » actif). Dans le formulaire : menu « Véhicule » (Clio). L'utilisateur voit « Tous » sélectionné et enregistre… sur Clio. Le filtre est un concept de **consultation** (historique, stats) ; la saisie exige un choix **explicite**.

**Recommandation** : supprimer le menu déroulant du formulaire et le remplacer par des **pastilles tappables dans le formulaire** (sélection directe > menu déroulant, surtout à 2-4 véhicules). Pré-sélectionner : le véhicule filtré s'il y en a un, sinon le dernier utilisé. Les pastilles de filtre en haut ne devraient apparaître que sur Historique et Stats.

### 3. Suppression de véhicule trop dangereuse
Un bouton rouge « Supprimer » permanent par véhicule, un `confirm()` natif, et **tous les pleins partent avec**. Pour une app familiale, c'est la perte de l'historique complet à deux taps.

**Recommandation** : confirmation à friction proportionnelle (retaper le nom du véhicule, ou double étape avec décompte), et à terme un **archivage** plutôt qu'une suppression (le véhicule vendu garde son historique dans les stats).

---

## P1 — Frictions majeures de parcours

### 4. Formulaire « Nouveau plein » : 7 champs pour une saisie qui en demande 3
Le cas dominant est : litres + prix (+ compteur). Date = maintenant, plein complet = oui, notes/photo = rares. Aujourd'hui tout est au même niveau et « Enregistrer » est sous la ligne de flottaison.

**Recommandation** — hiérarchiser par fréquence d'usage :
- En haut, gros et au clavier numérique : **Litres**, **Prix total**, **Compteur** (+ prix/L calculé).
- Repliés sous « Plus de détails » : date/heure, plein partiel, notes, photo jointe.
- « Enregistrer le plein » visible sans défiler.
- Objectif mesurable : un plein standard saisi en **moins de 15 secondes**.

### 5. Champ Compteur sans aide ni garde-fou
Le kilométrage est la donnée la plus sujette à erreur (mémoire, doigt) et une erreur fausse silencieusement toutes les consommations.

**Recommandation** : afficher le **dernier relevé connu** du véhicule (« Dernier plein : 87 990 km ») en aide sous le champ, et valider `odo saisi > dernier odo` avec une erreur inline claire (pas un toast). Bonus : suggérer la distance depuis le dernier plein (« +640 km »).

### 6. Édition et complétion de brouillon : éditeur inline mal adapté
L'éditeur remplace la carte dans la liste : la page saute, le contexte se perd, aucun champ n'a le focus. Pour un brouillon, la tâche réelle est « recopier les chiffres de la photo » — or la photo est en haut et les champs loin dessous.

**Recommandation** : ouvrir une **feuille inférieure (bottom sheet)** dédiée : photo zoomable en haut, champs Litres/Prix immédiatement dessous avec **autofocus sur Litres** et clavier numérique déjà ouvert. « Supprimer » relégué en bas, hors du chemin du pouce.

### 7. Pastilles de véhicules : débordement invisible et noms longs
« Toyota Corolla HB/TS » consomme la moitié de la largeur ; « Kangoo » est coupé hors écran sans aucun indice de défilement. Par ailleurs la Corolla (0 plein) apparaît dans le filtre mais pas dans « Par véhicule » — incohérence silencieuse.

**Recommandation** : tronquer les libellés (~14 caractères + …), ajouter un fondu de débordement à droite, et afficher les véhicules sans plein dans les stats avec la mention « aucun plein ».

### 8. Validation uniquement au submit, par toast
Litres/prix manquants → toast générique en bas, champs non marqués.

**Recommandation** : indiquer les champs requis, erreurs **inline sous le champ fautif**, focus automatique dessus.

---

## P2 — Cohérence, données, finitions

### 9. Double signal pour les brouillons dans l'Historique
Bannière « 1 plein à compléter — touche-le dans la liste » + badge « À compléter » sur la carte, dans le même écran. La bannière donne une consigne au lieu d'agir.

**Recommandation** : faire de la bannière un **raccourci tappable** qui ouvre directement le brouillon, ou la supprimer (le badge + la bordure dorée suffisent).

### 10. Historique : la donnée la plus utile manque
Chaque carte montre prix/L, odomètre et auteur, mais ni la **distance parcourue** ni la **conso de ce plein** (les deux sont calculables). La ligne secondaire mélange trois natures d'information sans hiérarchie.

**Recommandation** : ligne 2 = « 640 km · 6,1 L/100 » quand calculable ; odomètre et auteur en tertiaire. Envisager un sous-total mensuel à côté du libellé de mois (« Juillet 2026 · 164,90 € »).

### 11. Stats : lisibles mais peu actionnables
- « Dépense par mois » en vue « Tous » : empiler les barres **par véhicule** (qui dépense quoi — la question familiale de base).
- Aucun sélecteur de période (3 mois / 12 mois / tout).
- Le bleu des graphes (#2F6DB5) est correct en dataviz mais étranger à la palette encre/or — à harmoniser (encre pétrole pour les séries, or pour la mise en évidence).
- Aucune mise en perspective : « ce plein est 8 % au-dessus de votre prix moyen » est le type d'insight qui fait revenir.

### 12. Authentification
Pas de « mot de passe oublié », pas d'affichage du mot de passe, et **l'inscription est ouverte** (déjà identifié comme à fermer — c'est aussi une question de coût et de confidentialité des données familiales).

### 13. « Sortir » et le garage mal placés dans l'architecture
« Sortir » (action rarissime) occupe l'en-tête en permanence ; « Gérer les véhicules » est caché en bas de l'onglet de saisie. Il manque un lieu naturel pour la configuration.

**Recommandation** : un écran **Réglages** (4ᵉ onglet ou icône profil dans l'en-tête) regroupant : garage, compte/déconnexion, et l'**export CSV** des pleins — absent aujourd'hui alors que c'est le débouché naturel d'un carnet (notes de frais, revente du véhicule, comptabilité).

### 14. Divers
- Le garage ne permet pas de **renommer** un véhicule (seulement supprimer/recréer — ce qui perdrait les pleins).
- Libellé « Plaque (optionnel) » passe sur deux lignes ; noms longs cassent la mise en page des lignes véhicule.
- Le format de date du champ natif suit la locale du navigateur (affiché « 03:22 PM » dans l'émulation) — non maîtrisable, mais à surveiller sur les appareils réels.

---

## Ce qui fonctionne et doit être préservé

- **Capture rapide** en carte héros : le bon réflexe au bon endroit, différenciateur réel de l'app.
- **Hors-ligne d'abord** avec bannières réseau et file d'attente de synchronisation.
- Chiffres en **chasse fixe** façon odomètre : signature visuelle lisible et pertinente.
- Groupement par mois de l'historique, badges d'état (brouillon/partiel/en attente).
- Contrastes AA, cibles tactiles ≥ 44 px, animations sobres respectant `prefers-reduced-motion`.

---

## Plan de mise en œuvre proposé

| Lot | Contenu | Effet attendu |
|---|---|---|
| **1 — Confiance** (P0) | Stats agrégées corrigées ou masquées · un seul sélecteur de véhicule (pastilles dans le formulaire) · suppression de véhicule sécurisée | Plus aucun chiffre faux, plus d'ambiguïté de saisie |
| **2 — Vitesse** (P1) | Formulaire compacté (3 champs + « Plus de détails ») · aide et validation du compteur · bottom sheet brouillon avec autofocus · pastilles bornées | Plein standard saisi en < 15 s, brouillon complété en < 20 s |
| **3 — Valeur** (P2) | Distance + conso par plein dans l'historique · stats empilées par véhicule + périodes · écran Réglages (garage, export CSV, déconnexion) · auth polie + inscriptions fermées | L'app ne se contente plus d'enregistrer : elle informe |

*Note déploiement : au moment de l'audit, Vercel servait toujours le build antérieur au commit `fcb1278` (poussé plus tôt aujourd'hui). Vérifier que le déploiement automatique GitHub → Vercel est bien actif.*
