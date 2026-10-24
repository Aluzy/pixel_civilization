# 0002 — Une IA ambitieuse qui apprend, sans réseau de neurones

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/06-ia.md`, `docs/design/09-architecture.md`, `docs/design/11-feuille-de-route.md`, `CLAUDE.md`

## Contexte

Le rendu minimal en pixels a été choisi pour réserver la puissance de calcul à l'intelligence des individus. La conception initiale limitait l'IA à l'Utility AI, au GOAP et au tableau noir, et interdisait tout apprentissage.

## Décision

L'IA est construite en six niveaux : réaction (Utility AI), planification (GOAP, cartes d'influence), long terme et anticipation (projets HTN, simulation mentale), modèle des autres et coopération, apprentissage par l'expérience, génome de décision qui évolue par mutation et sélection naturelle. L'apprentissage pendant la partie est autorisé s'il reste symbolique, borné, déterministe et affichable ; les réseaux de neurones et modèles entraînés hors de la partie restent exclus. Le calcul est réparti par un budget en unités de travail et peut s'étendre sur plusieurs Workers.

## Conséquences

- Les individus peuvent préparer des projets de plusieurs jours, coopérer, se spécialiser, et la population voit ses stratégies évoluer.
- Le coût de calcul augmente : arbitrage explicite entre population, profondeur de réflexion et vitesse, géré par `balance.json`.
- Le parallélisme impose un protocole strict (instantanés en lecture seule, application dans l'ordre des identifiants) et un test d'égalité de hash.
