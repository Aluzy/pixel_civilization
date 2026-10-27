# 0030 — Le grand essor : un peuple sans IA complète, des villes à vocation

- **Date** : 2026-10-27
- **Statut** : acceptée
- **Documents concernés** : `docs/design/19-grand-essor.md` (nouveau), `03-individu.md`, `06-ia.md`, `09-architecture.md`, `11-feuille-de-route.md`, `15-colonies-et-migration.md`, glossaire, `CLAUDE.md`

## Contexte

L'utilisateur veut un boom démographique : des populations de l'ordre de 10 000 individus, et des éclaireurs qui fondent loin des villes spécialisées (pierre en montagne, champs en plaine, pêche au bord de l'eau). Il est prêt à limiter les fonctions des pixels pour y arriver. Il a choisi « le peuple sans IA » et la cible ×16.

Trois obstacles :

- les plafonds (512 entités, 24 colonies, éclaireurs à 90 cases) ;
- le coût : environ 4,5 µs par individu et par cycle, dont une part croissait comme le carré de la population, alors que ×16 à 10 000 individus demande 0,6 µs ;
- les naissances, liées à la réserve d'avance d'une réplique à la fois.

## Décision

1. **Deux rangs.** Les figures (12 par colonie plus 2 % des membres, toute la colonie sous 16 membres) gardent l'IA complète. Les autres, le peuple, suivent une routine de ville fixe (boire, manger, s'abriter, dormir, travailler pour la ville) et fabriquent ce que savent faire les figures de leur ville.
2. **La carte de la ville.** Un arbre de chemins depuis le camp, un autre vers l'eau, et les sources proches, recalculés au plus toutes les 300 cycles. Le peuple lit cette carte au lieu de planifier ses trajets.
3. **Un index spatial** remplace les boucles en carré sur les individus. Le budget de réflexion des figures s'étale quand elles sont nombreuses.
4. **La foule** : un membre du peuple en chemin traverse un autre en chemin ; seul celui qui se tient, travaille ou dort tient sa case.
5. **Démographie** : maisons longues et maisons de ville, faubourgs, un lit par membre, puits, naissances par foyers (un crédit de 0,1 par membre et par jour, un lit libre et une réserve proportionnelle).
6. **Vocations** : l'éclaireur cherche loin (70 à 180 cases) un site pour la vocation dont les biens manquent le plus à son comptoir ; le peuple d'une ville récolte ses biens plus vite et vend le surplus ; 160 colonies au plus.

Choix de conception :

- **Une exception assumée à la règle « ne pas simplifier l'IA ».** `CLAUDE.md` interdit de simplifier l'IA pour gagner du calcul. On la garde pour les figures, qui portent tout ce qui se raconte (invention, écrit, commerce, expéditions), et on l'assouplit pour le peuple : sa routine est déterministe, explicable (sa tâche s'affiche) et lit la carte de sa ville, pas la grille du monde. La règle et l'invariant de performance de `CLAUDE.md` sont mis à jour.
- **Le savoir-faire de la ville plutôt qu'un savoir individuel** : le peuple fait ce que la ville sait faire, ce qui se lit comme l'imitation des maîtres, sans mémoire ni apprentissage par individu.
- **Un pixel par case, sauf en chemin** : la règle « personne ne partage une case » (v0.14) bloquait les ruelles des grandes villes. On la garde pour qui se tient, travaille ou dort, et pour les figures.
- **La maison se remplit par le fond** : les lits sont rangés du fond vers la porte, et nul ne dort sur le seuil.
- **Le peuple tient les champs, la réserve et les chantiers ; les figures, les métiers qui fabriquent et pensent.** Sans cela, les figures d'une ville se faisaient toutes agriculteurs (plus de pain), la réserve d'argile et de charbon restait vide (plus de four) et personne ne bâtissait le mur (aucune enceinte fermée en 150 jours sur 24 graines). Un membre du peuple sur quatre tient la réserve de matériaux, un sur quatre sert d'abord les chantiers.

## Conséquences

- Plafonds : 16 384 entités, 16 000 individus, 256 colonies en mémoire (160 vivantes).
- L'état haché comprend le rang, la tâche et le lit de chaque individu : les parties changent, et les graines de démonstration avec elles.
- Valeurs nouvelles de `data/balance.json` :
  - la section `people` (dont `materialStock`, `minerEvery`, `farmUrgency`, `homeTicks`, `wornAt`) ;
  - `migration` : `minDistance`, `maxDistance`, `scoutLeg`, `siteView`, `poolRadius`, `vocationSpread`, `maxColonies` ;
  - `colony` : `maxPopulation`, `suburbRange`, `squareEvery` ;
  - `agriculture.plotsPerMember`.
- Données nouvelles : `data/vocations.json` ; maison longue, maison de ville et puits dans `data/recipes.json`.
- Mesures : voir la feuille de route ([11](../design/11-feuille-de-route.md), « Le grand essor »).
- Critère du J10 assoupli (accord de l'utilisateur) : la fonderie dans une partie sur trois, au lieu de deux.
- Reporté :
  - retrouver le rythme d'invention de la v0.16 (fonderie au jour 100 : 3 parties sur 24 contre 9) ;
  - les caravanes de vivres dédiées (le commerce existant transporte les biens) ;
  - la péremption des vivres ;
  - le gel des blocs lointains.
