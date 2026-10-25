# 0017 — Génome de décision et expérience apprise

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/06-ia.md`, `docs/design/03-individu.md`, `data/genome.json`, `data/balance.json`

## Contexte

Les couches 7 (apprentissage par l'expérience) et 8 (génome et évolution) étaient décrites sans dire comment un gène pèse sur une décision, comment muter sans fonction transcendante (décision 0005), ni quelles estimations apprendre en premier.

## Décision

- Les gènes sont des données (`data/genome.json`) : plage, valeur du fondateur, objectifs pesés. Un gène multiplie le score de ses objectifs par 1 + (gène − départ) / plage, entre 0,5 et 1,5 ; le fondateur décide exactement comme avant.
- Mutation : tirage normal approché par la somme de 12 tirages uniformes (additions seulement), écart-type 5 % de la plage, sur un flux aléatoire dédié `genome` pour ne pas décaler les autres flux.
- Expérience, propre à l'individu et perdue à sa mort : danger des zones où il a été attaqué (attaques / passages, a priori dont le poids dépend de la vitesse d'apprentissage), utilisé pour écarter des cibles d'exploration ; coût réel de chaque bien rapporté à la réserve (moyenne glissante), utilisé pour choisir ses tâches.

## Conséquences

- Les gènes dérivent de 5 à 12 % de leur plage en 100 jours, différemment selon les graines ; le tableau de bord montre leur moyenne et leur dispersion.
- Les graines de démonstration des tests changent quand le comportement change (J3 : graine 16 ; J6 : graine 32).
- Pas encore : coût réel par action pour le GOAP, rendement des zones, efficacité des considérations.
