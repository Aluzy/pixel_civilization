# 0004 — Bruit simplex implémenté dans le projet

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/02-monde.md`, `docs/design/09-architecture.md`, `CLAUDE.md`

## Contexte

La conception prévoyait la bibliothèque `simplex-noise`. Or le monde doit être identique pour une même graine, sur toutes les machines et dans la durée : une mise à jour de dépendance qui change même légèrement l'algorithme changerait tous les mondes déjà partagés.

## Décision

Le bruit simplex 2D (algorithme de référence de Stefan Gustavson, domaine public) est écrit dans `src/sim/world/noise.js`, avec une permutation tirée du générateur à graine. Il n'utilise que des additions, multiplications, `Math.floor` et `Math.sqrt`, dont les résultats sont garantis identiques par la norme IEEE 754 sur tous les moteurs JavaScript.

## Conséquences

- Aucune dépendance pour la génération ; les mondes ne changent que si le projet le décide.
- Une centaine de lignes à maintenir, couvertes par des tests (reproductibilité, bornes, continuité).
