# 0011 — Colonie : lits et réserve régulent les naissances, la réserve fait foi

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/03-individu.md`, `docs/design/06-ia.md`, `docs/design/02-monde.md`, `data/balance.json`, `data/resources.json`

## Contexte

Avec les seules conditions individuelles (nourri, indemne, coût, délai), la population croissait jusqu'à ce que la nourriture manque, puis les individus mouraient de faim en chaîne autour du camp. Le critère du J5 demande une colonie d'au moins 20 individus, stable sur 30 jours, sans extinction ni explosion. Par ailleurs, les projets d'abri comptaient les matériaux « livrés » : quand un bâtisseur qui avait mal compris la recette les gaspillait, le projet se croyait complet pour toujours.

## Décision

- Une naissance demande un **lit libre** (chaque abri de la colonie compte 2 lits) et une **réserve de nourriture d'avance** au camp (au moins une unité par membre, telle que l'individu l'a vue). Les abris supplémentaires et la réserve sont des projets de colonie, découpés en tâches.
- L'avancement d'un projet d'abri se lit dans la réserve elle-même : ce qui manque à la réserve est à rapporter.
- Le coût de la réplication passe à 6 baies et 3 fibres. Les baies sont plus nombreuses (`data/resources.json`), la curiosité monte moins vite (80 par jour au lieu de 120), car l'exploration occupait près d'un tiers du temps des membres.
- Le camp et ses abris ne s'oublient pas, et l'exploration reste dans un rayon de 40 cases autour du camp.

## Conséquences

- La population suit ce que le territoire nourrit : 18 à 40 individus au jour 30, puis un plafond (42 à 70 vers le jour 60). Les morts de faim ont presque disparu.
- Les projets ont un comportement préparatoire visible : la réserve se remplit avant que l'abri soit bâti.
- On ne modélise pas encore la répartition des lits ni l'agriculture.
