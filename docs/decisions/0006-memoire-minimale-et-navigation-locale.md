# 0006 — Mémoire minimale et navigation limitée à la perception (J2)

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/05-savoir.md`, `docs/design/06-ia.md`, `docs/design/11-feuille-de-route.md`

## Contexte

Le jalon J2 exige que l'individu survive 10 jours, mais la mémoire n'arrive qu'au J3. Sans aucune mémoire, un individu qui quitte son point d'eau pour chercher à manger ne le retrouve pas : dans les premiers essais, 7 graines sur 20 mouraient de soif. Par ailleurs, un calcul de chemin sur toute la grille violerait la règle « croyances, pas omniscience ».

## Décision

- Le J2 introduit une mémoire minimale : 4 lieux d'eau et 4 lieux de nourriture, sans oubli dans le temps, corrigés par ce que l'individu voit. Le J3 la remplace par le modèle complet (force, oubli, capacité).
- Les chemins sont calculés uniquement dans la fenêtre de perception. Pour une cible hors de vue, l'individu se dirige vers la case visible la plus proche de la cible et recalcule en avançant.

## Conséquences

- Survie 10 jours sur 60 graines sur 60.
- Un lieu mémorisé n'est vérifié que lorsque ses 8 voisines sont visibles : sinon un point d'eau en bord de champ de vision était oublié à tort (cause des dernières morts observées).
- L'individu peut s'obstiner vers un lieu inaccessible ; il l'oublie quand aucune case visible ne le rapproche.
