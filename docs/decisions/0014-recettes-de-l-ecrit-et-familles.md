# 0014 — Recettes de l'écrit et essais guidés par la famille de recette

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/04-fabrication.md`, `data/recipes.json`, `data/balance.json`

## Contexte

Les recettes prévues pour l'écrit posaient trois problèmes à la découverte par l'essai :

- Le papier (fibre + eau) et l'encre (charbon + eau) demandent l'eau, qui n'est pas un bien portable, et le charbon exige une pioche que beaucoup de colonies n'ont pas.
- Un scriptorium fait de bois, de fibres et d'argile était découvert par hasard par l'individu seul qui cherchait son abri ; il essayait ensuite ses outils sur deux stations, et le critère du J4 tombait de 9 à 2 graines sur 10.
- Le choix de l'essai comparait à « toute recette d'objet » : en cherchant un livre, le scribe essayait sans fin des combinaisons de bois et de fibres qui ressemblaient à la lance.

## Décision

- Papier : 3 fibres au scriptorium. Encre : 2 argiles au scriptorium. Livre : 3 papiers + 1 encre. Carte : 1 papier + 1 encre + 1 fibre.
- Scriptorium : 6 bois + 2 pierres + 2 argiles, mains nues, sans condition d'établi voisin. Bibliothèque : 6 pierres + 4 argiles + 4 fibres.
- Chaque recette a une **famille** (« structure », « item:weapon », « item:book »…). La ressemblance compare aux recettes de la famille recherchée.
- En cherchant une construction, un essai là où aucune construction n'a été faite a un malus (1,5). En cherchant un livre ou une carte, chaque matériau fabriqué vaut +1, et un ensemble de seules ressources vaut +0,8 sur une station où un matériau a déjà été fabriqué.
- Un matériau fabriqué manquant pour un essai est fabriqué avec sa recette connue, au lieu d'être récolté.

## Conséquences

- Le critère du J4 revient à 9 graines sur 10. Le scriptorium est trouvé plus tard, souvent par le chercheur de la bibliothèque.
- Le scribe découvre papier, encre puis livre en quelques jours une fois la bibliothèque bâtie, sur 8 graines sur 10.
- Les heuristiques « l'écrit se fait avec des matériaux fabriqués » sont un savoir a priori de l'individu, comme « les constructions se font à mains nues » au J4. Elles devront devenir de l'expérience apprise (J7).
