# 0028 — Architecture : ouvrages, plan de ville, édifices, paysage, grands travaux, beauté

- **Date** : 2026-10-26
- **Statut** : acceptée
- **Documents concernés** : `docs/design/17-architecture.md` (nouveau), `02-monde.md`, `06-ia.md`, `07-harmonie.md`, `08-interface.md`, `09-architecture.md`, `11-feuille-de-route.md`, `13-agriculture-cuisine.md`, glossaire

## Contexte

Avant le J13, la demande est de mettre en place des règles d'architecture : les individus deviennent des bâtisseurs, ont un réel impact sur la carte et transforment profondément leur environnement, pour que ce soit beau.

Les quatre ensembles proposés ont été retenus :

- le plan de ville ;
- les matériaux et les édifices ;
- le paysage aménagé ;
- les grands travaux.

S'y ajoute une composante Beauté dans l'harmonie, pour que l'IA embellisse d'elle-même.

## Décision

**Un moteur unique, l'ouvrage** (`src/sim/colony/works.js`, `data/works.json`) :

- Un ouvrage est un projet de colonie fait d'une liste de cases. Pour chaque case, il retient ce qui doit y venir (une construction, ou −1 − biome pour un nouveau sol) et ce qui doit y être avant (pour sauter une case devenue impossible).
- Les coûts par case viennent de `data/works.json` ; l'ordre des ouvrages aussi.
- N'importe quel membre pose les cases (action `BUILD`, `craftRecipe` = `WORKS_RECIPE`), depuis une case voisine, jamais sous quelqu'un.
- Ce sont des projets comme les autres : tableau noir, tâches, réserve, contributeurs, chronique.
- Un seul ouvrage à la fois par colonie.

**Quand bâtir** :

- Il faut au moins 30 membres et une colonie qui va bien : stabilité et bien-être d'au moins 0,5.
- Sa réserve doit tenir 2 portions par membre sans baisser.
- Un ouvrage s'ouvre tous les 2 jours, ou chaque jour si la beauté est son point faible.
- Les membres apportent d'abord la nourriture, puis les matériaux des autres projets, puis ceux des ouvrages (urgence 0,5).
- La colonie ouvre l'ouvrage qu'elle a le moins souvent ouvert, dans l'ordre de `data/works.json` à égalité :
  - place, rues, temple, grenier, marché, monument ;
  - maison de pierre, mur de pierre ;
  - allée d'arbres, route, assèchement.

**Les règles** (détail dans [17](../design/17-architecture.md)) :

- **Plan de ville** :
  - place pavée de 5 × 5 au camp, et cœur civique sans maisons à moins de 6 cases ;
  - rues pavées sur les quatre axes du camp (le plan des maisons y met ses allées) ;
  - ponts sur les canaux ;
  - fontaine au bout du canal du camp.
- **Matériaux et édifices** :
  - temple, grenier, marché et monument avec sa statue aux coins de la place (au plus près si le coin est pris) ;
  - maisons rebâties en pierre ;
  - palissade rebâtie en mur de pierre, qui ferme l'enceinte de même.
- **Paysage** :
  - vergers en rangées ;
  - allée d'arbres autour des murs ;
  - arbres d'alignement le long des routes.
- **Grands travaux** :
  - routes pavées entre colonies sœurs ;
  - défrichage durable des forêts à portée des champs ;
  - assèchement des marais ;
  - carrières en montagne et au désert.
- On ne pave ni ne bâtit jamais sur un champ.

**Beauté** (`data/balance.json` → `harmony.weights.beauty`) :

- C'est la sixième composante de l'harmonie, la moyenne de :
  - pavage ;
  - maisons de pierre ;
  - édifices ;
  - arbres ;
  - fontaine ;
  - murs de pierre.
- Les poids passent à :

  | Composante | Avant | Après |
  | --- | --- | --- |
  | Stabilité | 0,25 | 0,2 |
  | Durabilité | 0,25 | 0,2 |
  | Ordre spatial | 0,2 | 0,15 |
  | Savoir | 0,15 | 0,15 |
  | Bien-être | 0,15 | 0,15 |
  | Beauté | – | 0,15 |

- La beauté n'est le point faible que d'une colonie qui va bien (`harmony.calmAbove`). Sinon, une colonie toujours à 0 de beauté en début de partie ne visait plus jamais sa nourriture, et ses famines revenaient.

## Conséquences

- Mesures sur 10 graines et 150 jours : voir la feuille de route ([11](../design/11-feuille-de-route.md), « L'architecture »).
- Les premières versions affamaient les colonies :
  - la beauté visée sans condition détournait le point faible des réserves ;
  - les chantiers prenaient les bras de la nourriture ;
  - la place et les rues pavaient les champs.
  - D'où les conditions de calme, la réserve exigée, l'urgence basse et l'interdit sur les champs.
- Les maisons rebâties en pierre se répétaient sans fin et bloquaient les autres ouvrages. D'où le choix de l'ouvrage le moins souvent ouvert.
- Les mondes changent :
  - le défrichage et l'assèchement changent le sol ;
  - les cartes gardent les ouvrages ;
  - le biome des blocs modifiés entre dans le hachage de l'état.
  - Les graines de démonstration changent en conséquence.
- Valeurs de `data/balance.json` :
  - nouvelle section `works` ;
  - `harmony.calmAbove` (0,5) ;
  - `colony.worksUrgency` (0,5) ;
  - `colony.houseCore` passe de 2 à 5 ;
  - poids de l'harmonie ci-dessus.
- Reporté :
  - un second anneau de murs pour une ville pleine ;
  - les quartiers spécialisés ;
  - des styles propres à chaque colonie ;
  - l'usure et l'entretien des bâtiments.
