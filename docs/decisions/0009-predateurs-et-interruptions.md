# 0009 — Prédateurs, ordre des systèmes et actions qu'on ne lâche pas

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/02-monde.md`, `docs/design/06-ia.md`, `docs/design/09-architecture.md`, `data/balance.json`, `data/world.json`, `data/recipes.json`

## Contexte

Le J4 introduit les prédateurs et le combat. Il fallait décider où les faire agir dans le cycle, comment l'abri protège, et à quel niveau de la pyramide placer la fuite. Par ailleurs, avec des objectifs de fabrication toujours disponibles, les réévaluations toutes les 10 cycles faisaient abandonner une récolte ou une construction de 150 cycles dès que la soif montait un peu, et le sommeil était haché.

## Décision

- Un système `threatSystem` s'exécute après `actionSystem` et avant `lifecycleSystem` : une attaque met l'individu en demande de décision pour le cycle suivant, et une mort au combat est constatée dans le même cycle.
- Un individu dans un abri est hors d'atteinte (le « +5 de défense » de la conception est remplacé par une protection complète, plus lisible pour l'observateur).
- L'objectif Fuir est au niveau survie : une attaque imminente ne doit pas être écrasée par la faim.
- Les prédateurs apparaissent par une règle fixe (phase, distance, biome, plafond par individu) tirée du flux aléatoire `threats`, jamais par un script, et repartent au jour ou après une chasse vaine.
- Le sommeil et les actions de travail (récolter, fabriquer, essayer) ne sont pas reconsidérés périodiquement : seuls leur fin, une attaque ou une faim ou une soif ≥ 85 les interrompent.

## Conséquences

- Un individu sans arme fuit (il est plus rapide) ; armé, il tue le prédateur en trois échanges. L'abri et la lance ont un effet visible.
- Le travail aboutit et le sommeil dure ; la réactivité aux besoins vitaux et aux attaques est conservée.
- Le combat entre individus, l'insécurité comme jauge et les intempéries restent à faire.
