# 0020 — Vision v2 : danger, agriculture, économie, colonies, forteresses, conflits

- **Date** : 2026-10-25
- **Statut** : acceptée (le chantier est préparé, rien n'est implémenté)
- **Documents concernés** : `docs/design/01-vision.md`, `11-feuille-de-route.md`, `12-risques.md`, `13-agriculture-cuisine.md`, `14-economie.md`, `15-colonies-et-migration.md`, `16-guerre-et-forteresses.md`, `02-monde.md`, `06-ia.md`, glossaire, `CLAUDE.md`

## Contexte

Après le J7, la vision s'élargit :

- les menaces doivent compter (aujourd'hui aucun pixel ne meurt d'un prédateur, et 1 à 6 prédateurs meurent en 60 jours) ;
- l'agriculture doit se découvrir ; des métiers et une économie doivent naître (un agriculteur vend, un cuisinier transforme en plats plus nourrissants) ;
- des pixels doivent amasser or et pierres précieuses, migrer pour fonder des colonies, se spécialiser au combat, bâtir des forteresses autour de leurs trésors, et des colonies doivent pouvoir s'affronter.

Le combat entre colonies était hors périmètre de la version 1. Le dépôt [Aluzy/family_farm](https://github.com/Aluzy/family_farm) apporte des règles éprouvées pour l'agriculture (un stade par jour arrosé, rendement et graines rendues), la transformation (moulin, presse), la cuisine (nutrition d'un plat = 1,3 × ses ingrédients, plaisir des repas), la péremption par lots, le marché à coefficient et des valeurs toujours entières.

## Décision

- Le combat entre colonies entre dans le périmètre, toujours par émergence : le joueur reste observateur.
- Six jalons, dans cet ordre : J8 danger et combattants, J9 agriculture et cuisine, J10 économie et métiers (dont l'arbre technologique rendu atteignable), J11 migration et colonies, J12 trésors et forteresses, J13 conflits. La version 1.0.0 passe au J13 ; le J7 sort en 0.8.0.
- Les règles de Ferme Familiale sont transposées à des pixels autonomes : ce que le joueur y fait au clic, un pixel le fait par décision, à partir de ses croyances.
- Le point du J7 resté ouvert (500 individus dans une partie ordinaire) est rattaché au J13 et devient atteignable avec l'agriculture (J9).

## Conséquences

- Quatre nouveaux documents de conception (13 à 16) ; la feuille de route, la vision, les risques et le glossaire sont mis à jour.
- Chantiers techniques identifiés : murs infranchissables dans la navigation, plusieurs colonies actives (gel des blocs lointains), carnet d'ordres déterministe, combat de groupe dans la simulation mentale.
- Questions ouvertes : composantes d'harmonie « sécurité » et « prospérité », monnaie précoce ou seulement l'or.
