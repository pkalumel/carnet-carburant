# Product Decision: Retrait de la carte « Autour de moi »

- Date: 2026-08-30
- Status: accepted
- Related feature: Accueil

## Context

Demande directe du propriétaire du produit : retirer la carte « Autour de
moi » (stations et bornes proches sur l'accueil) ainsi que toutes les
fonctionnalités et API qu'elle utilisait. La carte reposait sur quatre
services externes (HERE, Open Charge Map, tuiles Mapbox, repli Overpass/OSM)
et sur Leaflet, pour une valeur d'usage jamais démontrée à l'échelle du foyer
(aucun signal d'utilisation ; le jeton Mapbox restreint rendait d'ailleurs la
carte grise hors production).

## Decision

Suppression complète : composant `NearbyCard`, module `src/lib/nearby.ts`,
dépendances `leaflet`/`@types/leaflet`, styles `.nearby-*` et `--map-filter`,
clés `VITE_OCM_KEY`/`VITE_HERE_KEY`/`VITE_MAPBOX_TOKEN` de `.env.example`,
section « Autour de moi » du crawler, UC12 des spécifications.

**Conservé** : la géolocalisation de la saisie et le géocodage inverse
Nominatim (`src/lib/geo.ts`) — ils servent au lieu des pleins, pas à la
carte — ainsi que `api_log` et sa carte d'administration.

## Alternatives

| Alternative | Why not selected |
| --- | --- |
| Masquer la carte derrière un réglage | Garde 3 clés d'API et une dépendance lourde pour une fonctionnalité indésirée |
| Ne retirer que les sources payantes/limitées (HERE, Mapbox) | La demande porte sur la carte entière |

## Consequences

- Positive: 3 clés d'API et ~150 kB de dépendances en moins, accueil plus
  court, surface d'entretien réduite.
- Negative: plus de découverte de stations/bornes dans l'app.
- Risks: aucun identifié — aucune donnée n'était produite par cette carte.

## Reversal or review trigger

Demande de la famille de retrouver la recherche de bornes en itinérance.
