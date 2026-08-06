# Carnet Carburant — Spécifications fonctionnelles

> PWA familiale de suivi des pleins de carburant — plusieurs véhicules, plusieurs
> utilisateurs, photos de pompe, saisie hors ligne, historique partagé et statistiques.
>
> Production : <https://carnet-carburant.vercel.app> · Code : `github.com/pkalumel/carnet-carburant`

---

## 1. Vue d'ensemble

| Élément | Choix |
|---|---|
| Type | PWA installable (mobile d'abord) |
| Front | React + Vite + TypeScript |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Partage | Tous les comptes authentifiés voient les mêmes données (famille) |
| Hors ligne | Création de pleins (photo comprise) en file d'attente locale, synchronisation automatique |
| Unités | €, litres, kilomètres — consommation en L/100 km |

**Proposition de valeur** : enregistrer un plein en moins de 10 secondes à la pompe
(au pire : une photo), et en tirer des statistiques fiables de consommation et de coût
pour toute la famille.

---

## 2. Personas

### P1 — Patrick, le conducteur-administrateur
- **Profil** : parent, à l'aise avec la technologie, a mis en place l'application.
- **Contexte** : fait la majorité des pleins de la voiture principale ; veut des
  chiffres fiables (L/100 km, coût mensuel) pour décider notamment d'un éventuel
  changement de véhicule.
- **Objectifs** : saisie complète avec kilométrage à chaque plein ; consulter les stats.
- **Frustrations** : les carnets papier perdus, les tableurs jamais à jour, les apps
  qui exigent un compte par abonnement.

### P2 — Marie, la conductrice pressée
- **Profil** : conjointe, utilise l'app uniquement à la station-service.
- **Contexte** : fait le plein en allant au travail, souvent pressée, réseau parfois
  médiocre à la station.
- **Objectifs** : que ça prenne moins de 10 secondes — une photo de la pompe suffit,
  quelqu'un (ou elle, plus tard) complétera les chiffres.
- **Frustrations** : les formulaires longs ; devoir se souvenir de transmettre le ticket.

### P3 — Théo, le jeune conducteur occasionnel
- **Profil** : enfant devenu conducteur, emprunte la seconde voiture.
- **Contexte** : fait rarement le plein, ne connaît pas les habitudes de saisie.
- **Objectifs** : une interface évidente qui le guide (champs requis, véhicule
  présélectionné) ; prouver qu'il a bien remis de l'essence.
- **Frustrations** : les apps où l'on peut « mal faire » sans s'en rendre compte.

---

## 3. Cas d'utilisation

### Diagramme d'ensemble

```mermaid
graph LR
    P1(["🧑 Patrick<br/>(admin famille)"])
    P2(["👩 Marie<br/>(pressée)"])
    P3(["🧑‍🎓 Théo<br/>(occasionnel)"])

    subgraph App["Carnet Carburant"]
      UC1["UC1 — Saisir un plein complet"]
      UC2["UC2 — Capture rapide (photo seule)"]
      UC3["UC3 — Compléter un brouillon"]
      UC4["UC4 — Consulter / modifier l'historique"]
      UC5["UC5 — Consulter les statistiques"]
      UC6["UC6 — Gérer les véhicules"]
      UC7["UC7 — S'authentifier"]
      UC8["UC8 — Synchroniser les pleins hors ligne"]
    end

    SB[("Supabase<br/>DB · Auth · Storage")]

    P1 --> UC1 & UC3 & UC4 & UC5 & UC6
    P2 --> UC2
    P3 --> UC1
    P1 & P2 & P3 --> UC7
    UC8 -.déclenché par le retour du réseau.-> App
    App --> SB
```

### UC1 — Saisir un plein complet
| | |
|---|---|
| **Acteur** | Tout membre authentifié |
| **Préconditions** | Connecté ; au moins un véhicule existe |
| **Scénario nominal** | 1. Ouvrir l'onglet « Plein » · 2. Choisir le véhicule (présélectionné) · 3. Saisir litres et prix total — le €/L se calcule en direct · 4. Saisir le kilométrage (recommandé) · 5. Cocher/décocher « plein complet » · 6. Joindre éventuellement la photo de la pompe · 7. Enregistrer |
| **Alternatives** | 3a. Litres ou prix manquants → blocage avec message · 7a. Réseau absent/échec → le plein part en file d'attente locale (voir UC8), l'utilisateur est informé |
| **Postconditions** | Le plein est visible par toute la famille dans l'historique et compté dans les stats |

### UC2 — Capture rapide
| | |
|---|---|
| **Acteur** | Tout membre (typiquement Marie) |
| **Préconditions** | Connecté ; véhicule sélectionné |
| **Scénario nominal** | 1. Toucher le bouton « Capture rapide » · 2. L'appareil photo s'ouvre, photographier l'écran de la pompe · 3. L'app compresse la photo et enregistre un plein **brouillon** (date = maintenant, chiffres vides) · 4. Bascule automatique vers l'historique où le brouillon porte le badge « À compléter » |
| **Alternatives** | 3a. Hors ligne → brouillon + photo en file d'attente locale (UC8) |
| **Postconditions** | Un brouillon horodaté avec photo existe ; les stats l'ignorent tant qu'il n'est pas complété |

### UC3 — Compléter un brouillon
| | |
|---|---|
| **Acteur** | Tout membre (pas forcément l'auteur de la photo) |
| **Préconditions** | Un brouillon existe ; être en ligne |
| **Scénario nominal** | 1. Ouvrir l'historique — un bandeau compte les brouillons · 2. Toucher le brouillon · 3. La photo de la pompe s'affiche au-dessus du formulaire · 4. Recopier litres, prix, kilométrage depuis la photo · 5. Enregistrer → le plein devient définitif |
| **Alternatives** | 5a. Litres/prix manquants → blocage avec message |

### UC4 — Consulter / modifier l'historique
Liste antichronologique filtrable par véhicule (sélecteur global). Chaque ligne montre
date, véhicule, litres, prix, €/L, kilométrage, auteur, badges (« À compléter »,
« Partiel », « En attente »), vignette photo. Toucher une ligne ouvre l'éditeur :
modification de tous les champs, remplacement de photo, suppression (avec confirmation).
Les pleins « en attente » (hors ligne, non synchronisés) ne sont pas modifiables.

### UC5 — Consulter les statistiques
- **Par véhicule** : consommation moyenne pondérée et par période (L/100 km), coût au
  km, total dépensé, prix moyen du litre, courbe de consommation, dépense par mois,
  évolution du €/L.
- **Tous véhicules** : dépense mensuelle globale + résumé par véhicule.
- **Règle métier centrale** : la consommation se calcule **entre deux pleins complets
  munis d'un kilométrage** ; les litres des pleins partiels intermédiaires sont
  additionnés dans la période. Les brouillons sont exclus.

### UC6 — Gérer les véhicules
Ajouter (nom + plaque optionnelle) et supprimer (avec confirmation ; supprime aussi
ses pleins). Accessible depuis l'onglet « Plein ».

### UC7 — S'authentifier
Email + mot de passe (Supabase Auth). Création de compte ouverte pendant la phase
d'installation familiale, puis **fermée par l'administrateur** — la sécurité des
données repose sur ce verrouillage (voir §6).

### UC8 — Synchronisation hors ligne
Déclencheur : retour du réseau (`online`) ou ouverture de l'app. Chaque plein en file
d'attente est envoyé (photo d'abord, puis ligne en base, identifiant idempotent) ;
en cas de succès il quitte la file. L'utilisateur voit « N pleins synchronisés ✓ ».

---

## 4. Diagramme de flux — enregistrer un plein à la pompe

```mermaid
flowchart TD
    A(["Arrivée à la pompe,<br/>app ouverte"]) --> B{"Du temps pour<br/>tout saisir ?"}

    B -- "Non (Marie)" --> C["Toucher CAPTURE RAPIDE"]
    C --> D["Photo de l'écran de la pompe"]
    D --> E["Compression de la photo<br/>(max 1600 px, JPEG)"]
    E --> F["Création d'un plein BROUILLON<br/>(date = maintenant, chiffres vides)"]

    B -- "Oui (Patrick)" --> G["Remplir le formulaire :<br/>litres · prix · km · complet/partiel"]
    G --> H{"Litres et prix<br/>valides ?"}
    H -- Non --> G2["Message d'erreur ciblé"] --> G
    H -- Oui --> I["Photo jointe ? → compression"]

    F --> J{"Réseau<br/>disponible ?"}
    I --> J
    J -- Oui --> K["Envoi photo → Storage<br/>Insertion → PostgreSQL"]
    K --> L{"Succès ?"}
    L -- Oui --> M(["Toast « Enregistré ✓ »<br/>visible par la famille"])
    L -- Non --> N
    J -- Non --> N["File d'attente locale<br/>(IndexedDB, photo incluse)"]
    N --> O(["Toast « Enregistré sur le téléphone —<br/>synchronisation dès que possible »"])
    O -.retour du réseau.-> P["flushOutbox() :<br/>envoi de chaque plein en attente"]
    P --> M
```

---

## 5. Diagrammes de séquence

### 5.1 Saisie complète en ligne (UC1)

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant App as PWA (React)
    participant IDB as IndexedDB (cache)
    participant ST as Supabase Storage
    participant DB as Supabase PostgreSQL

    U->>App: Remplit litres, prix, km + photo
    App->>App: Valide (litres > 0, prix ≥ 0)
    App->>App: downscalePhoto() → JPEG ≤ 1600 px
    App->>ST: upload pump/{id}.jpg
    ST-->>App: photo_path
    App->>DB: INSERT fillups (id, …, photo_path)
    Note over DB: RLS : réservé aux<br/>utilisateurs authentifiés
    DB-->>App: 201 (price_per_liter calculé en base)
    App->>DB: SELECT fillups (rafraîchissement)
    DB-->>App: liste à jour
    App->>IDB: met le cache à jour
    App-->>U: Toast « Plein enregistré ✓ »
```

### 5.2 Capture rapide hors ligne puis synchronisation (UC2 + UC8)

```mermaid
sequenceDiagram
    actor U as Marie
    participant App as PWA (React)
    participant OB as File d'attente (IndexedDB)
    participant ST as Supabase Storage
    participant DB as Supabase PostgreSQL

    U->>App: Touche « Capture rapide »
    App->>U: Ouvre l'appareil photo
    U->>App: Photo de la pompe
    App->>App: downscalePhoto()
    App->>App: navigator.onLine → false
    App->>OB: addToOutbox({id local, brouillon, photo})
    App-->>U: « Enregistré sur le téléphone — synchro dès que possible »
    Note over App,OB: Le plein apparaît dans l'historique<br/>avec le badge « En attente »

    rect rgb(240, 240, 240)
      Note over App: Plus tard — événement « online »
      App->>OB: listOutbox()
      loop chaque plein en attente
        App->>ST: upload pump/{id}.jpg
        App->>DB: INSERT fillups (id idempotent)
        alt succès ou doublon (23505)
          App->>OB: removeFromOutbox(id)
        else échec réseau
          App->>App: stop — nouvel essai plus tard
        end
      end
      App-->>U: Toast « 1 plein synchronisé ✓ »
    end
```

### 5.3 Complétion d'un brouillon (UC3)

```mermaid
sequenceDiagram
    actor U as Patrick
    participant App as PWA (React)
    participant ST as Supabase Storage
    participant DB as Supabase PostgreSQL

    U->>App: Ouvre l'historique
    App-->>U: Bandeau « 1 plein à compléter »
    U->>App: Touche le brouillon
    App->>ST: createSignedUrl(photo_path, 1 h)
    ST-->>App: URL signée
    App-->>U: Formulaire + photo de la pompe affichée
    U->>App: Recopie litres, prix, km depuis la photo
    App->>DB: UPDATE fillups SET …, is_draft = false
    DB-->>App: 204
    App-->>U: Toast « Plein complété ✓ »
    Note over DB: Le plein entre désormais<br/>dans les statistiques
```

---

## 6. Modèle de données

```mermaid
erDiagram
    VEHICLES ||--o{ FILLUPS : "possède"
    AUTH_USERS ||--o{ FILLUPS : "a créé"

    VEHICLES {
        uuid id PK
        text name
        text plate "optionnel"
        timestamptz created_at
    }
    FILLUPS {
        uuid id PK
        uuid vehicle_id FK
        timestamptz filled_at
        int odometer_km "nullable"
        numeric liters "nullable (brouillon)"
        numeric total_price "nullable (brouillon)"
        numeric price_per_liter "colonne calculée"
        bool is_full "plein complet ou partiel"
        bool is_draft "capture rapide à compléter"
        text photo_path "bucket pump-photos"
        text notes
        uuid created_by FK
        text created_by_email
    }
```

**Sécurité** : RLS activé sur toutes les tables — lecture/écriture réservées au rôle
`authenticated`. Bucket photos privé (URLs signées, 1 h). Le modèle « tout utilisateur
connecté voit tout » impose de **fermer les inscriptions publiques** une fois les
comptes familiaux créés (Dashboard Supabase → Authentication → Sign In / Up).

---

## 7. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| Hors ligne | L'app se charge sans réseau (service worker) ; création de pleins hors ligne ; consultation du dernier état connu (cache IndexedDB) |
| Performance | Bundle initial ≈ 420 kB (stats chargées à la demande) ; photos compressées avant envoi |
| Accessibilité | Contrastes WCAG AA ; cibles tactiles ≥ 44 px ; focus visible ; `prefers-reduced-motion` respecté ; libellés sur tous les champs |
| Ergonomie mobile | Claviers numériques (`inputmode`) ; virgule ou point acceptés ; saisie à une main visée |
| Fiabilité | Synchronisation idempotente (id fixes, doublon 23505 toléré) ; scripts d'envoi atomiques |
| Coût | Gratuit à l'échelle familiale (Supabase free tier, Vercel hobby) |
| Limite connue | La **modification** d'un plein exige d'être en ligne ; seule la **création** fonctionne hors ligne |
