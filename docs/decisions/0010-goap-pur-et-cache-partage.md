# 0010 — GOAP sans distances, cache partagé, replanification à chaque décision

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/06-ia.md`, `docs/design/09-architecture.md`, `data/balance.json`

## Contexte

La conception veut un GOAP avec cache partagé entre individus et un budget en unités de travail. Un cache n'est sûr que si le plan dépend seulement de la clé ; or les distances réelles aux lieux changent à chaque pas, et un plan qui en dépendrait varierait selon l'ordre des appels, ce qui menacerait l'égalité de hash entre un et plusieurs Workers penseurs (J5).

## Décision

- Les coûts du planificateur sont estimés sans distance (durées de récolte et de fabrication, trajet forfaitaire, recherche forfaitaire). Le plan est une fonction pure des croyances (inventaire, recettes connues, stations et lieux mémorisés) et du but ; il est mis en cache par une signature de 53 bits de ces croyances.
- Le budget est de 300 nœuds développés par plan (`ai.planNodeBudget`) et 12 étapes au plus.
- À chaque décision, l'individu replanifie depuis l'état présent et ne lance que la première étape ; la distance réelle intervient seulement dans l'exécution (lieu visible le plus proche, sinon mémorisé).

## Conséquences

- Un test vérifie que vider le cache à chaque cycle ne change pas le hash d'état.
- Le planificateur ne choisit pas entre deux gisements selon leur distance ; c'est l'exécution qui prend le plus proche. Quand plusieurs recettes produiront le même bien, il faudra peut-être des coûts appris (couche 7) plutôt que des distances.
