# 0012 — Workers penseurs reportés

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/06-ia.md`, `docs/design/09-architecture.md`, `docs/design/11-feuille-de-route.md`

## Contexte

La feuille de route plaçait au J5 les Workers penseurs (décisions calculées en parallèle sur plusieurs cœurs) et un test d'égalité de hash entre 1 et 4 penseurs. Aujourd'hui, une décision perçoit (ce qui met à jour la mémoire), planifie avec un cache partagé et démarre l'action, en écrivant directement dans l'état et dans des tampons partagés. La paralléliser demande de séparer une phase « réfléchir », sans écriture, d'une phase « appliquer » dans l'ordre des identifiants.

## Décision

Reporter les penseurs au jalon où la population ou la profondeur de l'IA l'exigeront. Mesure au J5 : 70 individus coûtent environ 0,06 ms par cycle (70 ms par jour simulé), pour un budget de 4 ms par cycle à 500 individus.

## Conséquences

- Pas de test K = 1 contre K = 4 pour l'instant ; le test de déterminisme (même graine, même hash, découpage des cycles indifférent) reste en place.
- Les choix déjà faits préparent le parallélisme : flux aléatoire par individu, plans du GOAP fonction pure des croyances (décision 0010), parcours par identifiant croissant.
