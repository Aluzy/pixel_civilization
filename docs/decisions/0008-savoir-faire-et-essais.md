# 0008 — Savoir-faire : mémoire des recettes, essais par échantillon, minerais à la pioche

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/04-fabrication.md`, `docs/design/05-savoir.md`, `data/recipes.json`, `data/resources.json`, `data/balance.json`

## Contexte

La conception prévoyait que les recettes et les échecs partagent les emplacements de la mémoire avec les lieux, qu'un essai consomme la moitié des ingrédients, et que l'abri coûte 10 bois et 5 fibres. En jeu : les 20 emplacements sont occupés par les lieux et une recette chassait un point d'eau ; « la moitié des ingrédients » suppose des quantités alors qu'un individu qui ne connaît pas la recette ne sait pas combien en mettre ; un abri bois + fibre à mains nues avait le même ensemble d'ingrédients que la lance à l'établi ; et avec 7 matériaux récoltables à mains nues, il y avait 63 combinaisons par station, si bien que l'individu passait ses journées à essayer de l'argile avec du charbon.

## Décision

- Recettes et échecs ont leur propre mémoire : un emplacement par recette du catalogue, un anneau de 32 échecs ; même loi d'oubli que les lieux (τ = 10 et 5 jours).
- Un essai teste une combinaison (station + ensemble de 1 à 3 matériaux) avec un échantillon d'une unité par ingrédient : réussi, il enseigne la recette et l'échantillon est gardé ; raté, l'échantillon est perdu et l'échec retenu.
- L'abri demande aussi 3 pierres. Deux recettes d'une même station n'ont jamais le même ensemble d'ingrédients (vérifié au chargement du catalogue).
- Le cuivre et le charbon exigent une pioche de pierre, le fer un outil de cuivre (pas encore fabricable), conformément à l'arbre technologique (« pioche : accès cuivre et charbon »).
- Le choix d'un essai s'appuie sur ce que l'individu sait : ressemblance avec les recettes connues du genre recherché, station où se font les choses de ce genre, coût d'aller chercher ce qui manque.

## Conséquences

- La découverte de l'établi, d'une arme, d'un outil et de l'abri prend 2 à 5 jours au lieu de ne jamais aboutir.
- Une recette peut être oubliée et redécouverte, ce qui prépare l'« âge sombre » et l'intérêt des livres.
- On perd la concurrence directe entre souvenirs de lieux et de recettes ; elle pourra revenir avec un plafond commun si le besoin s'en fait sentir.
