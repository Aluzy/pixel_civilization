# 0018 — Un inventeur par colonie, arbre technologique complet dans les données

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/04-fabrication.md`, `docs/design/06-ia.md`, `data/recipes.json`, `data/balance.json`

## Contexte

Le J7 demande l'arbre complet (four, fonderie, métaux). Mais la découverte par l'essai n'a lieu que lorsqu'un objectif cherche quelque chose (une arme, un outil, un abri, un livre) : rien ne pousse à chercher un four. Laisser tous les curieux expérimenter librement affamait la colonie au J6.

## Décision

- Les recettes du four, de la brique, de la fonderie, des lingots de cuivre et de fer et des outils et armes de cuivre et de fer sont ajoutées aux données.
- Dès 8 membres, un seul inventeur à la fois (12 jours), choisi parmi ceux qui savent fabriquer un outil ouvrant un matériau. Quand il choisit d'explorer, il fabrique ces outils, lit le tableau noir, puis explore 3 fois sur 10 et sinon essaie librement, en préférant les matériaux qu'aucune recette connue n'utilise.

## Conséquences

- Les découvertes ordinaires (scriptorium, bibliothèque) arrivent plus tôt.
- Le four n'a pas encore été découvert en 120 à 160 jours sur 8 graines : l'arbre est prêt, sa découverte reste à faciliter (voir `12-risques.md`).
