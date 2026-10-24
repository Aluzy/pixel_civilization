# 0001 — Simulation dans un Web Worker, séparée du rendu

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/09-architecture.md`, `CLAUDE.md`

## Contexte

La simulation doit gérer des centaines d'individus avec une IA coûteuse et pouvoir tourner très vite (×256, Max), tout en gardant un affichage fluide. Elle doit aussi être déterministe et testable sans navigateur.

## Décision

Toute la simulation vit dans `src/sim/`, s'exécute dans un Web Worker, n'importe ni Phaser ni le DOM et compte le temps en cycles. Le rendu Phaser communique avec elle uniquement par messages.

## Conséquences

- L'affichage reste fluide quelle que soit la charge de simulation.
- La simulation est testable dans Node et utilisable en headless pour l'équilibrage.
- Il faut maintenir un protocole de messages et limiter les données transférées à la vue courante.
