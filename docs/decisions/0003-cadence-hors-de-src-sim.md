# 0003 — La cadence en temps réel vit hors de `src/sim/`

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/09-architecture.md`, `CLAUDE.md`

## Contexte

Le Worker doit exécuter un nombre de cycles par seconde réelle qui dépend de la vitesse choisie, ce qui exige de lire l'horloge réelle (`performance.now`, `setTimeout`). Or `src/sim/` interdit tout accès au temps réel pour garantir le déterminisme.

## Décision

Le point d'entrée du Worker et l'ordonnanceur (`TickScheduler`) vivent dans `src/worker/`. Ils décident combien de cycles exécuter et appellent `Simulation.step(n)`. `src/sim/` reste purement fonction de la graine et du nombre de cycles.

## Conséquences

- Les interdits de `src/sim/` restent absolus et sont vérifiés par ESLint et par un test.
- L'ordonnanceur est testable avec une horloge simulée.
- Découper les cycles en lots n'a aucun effet sur l'état (test de déterminisme dédié).
