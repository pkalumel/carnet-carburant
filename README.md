# Carbuvolt ⛽

Application web installable (PWA) pour suivre les pleins de carburant de la famille :
plusieurs véhicules, plusieurs utilisateurs, photos de la pompe, saisie hors ligne,
historique et statistiques (consommation L/100 km, coût mensuel, prix du litre).

## Fonctionnement

- **Capture rapide** : pas le temps à la pompe ? Photographie l'écran de la pompe —
  le plein est enregistré « à compléter », les chiffres s'encodent plus tard depuis
  l'historique, photo sous les yeux.
- **Hors ligne** : sans réseau, les pleins (photo comprise) sont stockés sur le
  téléphone et synchronisés automatiquement au retour de la connexion.
- **Consommation** : calculée entre deux pleins *complets* avec kilométrage relevé ;
  les pleins partiels intermédiaires sont correctement comptés.

## Mise en route (une seule fois)

### 1. Base de données Supabase

1. Ouvre le [dashboard Supabase](https://supabase.com/dashboard) du projet.
2. **SQL Editor → New query** : colle le contenu de `supabase/schema.sql` et exécute-le.
   Cela crée les tables, les règles de sécurité et le bucket de photos.

### 2. Comptes de la famille

L'application donne accès à toutes les données à **tout utilisateur connecté**.
Il faut donc contrôler qui peut créer un compte :

1. Chaque membre de la famille crée son compte depuis l'écran de connexion de l'app
   (« Première fois ? Créer un compte »).
2. Ensuite, **ferme les inscriptions** : Dashboard → **Authentication → Sign In / Up
   → désactiver "Allow new users to sign up"**.
3. Optionnel : pour éviter l'étape du mail de confirmation, désactive
   **Authentication → Sign In / Up → Confirm email** avant de créer les comptes.

### 3. Développement local

```bash
npm install
npm run dev        # http://localhost:5173
```

Les clés sont dans `.env` (voir `.env.example`).

### 4. Déploiement sur Vercel

```bash
npm i -g vercel    # si nécessaire
vercel             # depuis ce dossier, réponses par défaut
```

Puis dans les réglages du projet Vercel → **Environment Variables**, ajoute
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (valeurs de `.env`) et redéploie
(`vercel --prod`). Alternative : pousser le dossier sur GitHub et importer le
dépôt sur [vercel.com](https://vercel.com) — chaque `git push` redéploiera.

### 5. Installer sur les téléphones

Ouvre l'URL de production dans le navigateur du téléphone :

- **iPhone** (Safari) : Partager → « Sur l'écran d'accueil ».
- **Android** (Chrome) : menu ⋮ → « Installer l'application ».

## Structure

```
supabase/schema.sql     # schéma de la base (à exécuter dans Supabase)
src/lib/db.ts           # accès aux données + bascule hors ligne
src/lib/outbox.ts       # file d'attente des pleins saisis hors ligne
src/lib/stats.ts        # calculs de consommation et de coûts
src/components/         # écrans : connexion, saisie, historique, stats
```
