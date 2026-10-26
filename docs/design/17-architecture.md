# 17 — Architecture et aménagement

Les individus sont des bâtisseurs : une colonie prospère ne se contente pas d'abriter ses membres, elle façonne son territoire. Ce document décrit les règles d'architecture qui transforment la carte : plan de ville, matériaux et édifices, paysage aménagé, grands travaux. La composante **Beauté** de l'harmonie les mesure (décision 0028).

## Principe : des ouvrages posés case par case

Un **ouvrage** est un projet de colonie (couche 4 de [06](06-ia.md)) fait d'une liste de cases. Chaque case reçoit une construction (un pavé, un mur de pierre, un arbre) ou un nouveau sol (un marais asséché devient une plaine).

- La colonie trace l'ouvrage à partir de ce qu'elle a bâti (son camp, ses maisons, son enceinte).
- Les membres apportent les matériaux par lots de 10 cases (`data/works.json`). Un ouvrage passe après la réserve de nourriture et après les autres projets (urgence 0,5 au lieu de 1 et 1,2).
- Un bâtisseur, n'importe quel membre (pas de recette : du travail et des matériaux), pose les cases une à une depuis une case voisine. Il ne pose jamais sous quelqu'un.
- Une case qu'on ne peut plus poser est sautée : quelque chose y a été bâti ou semé depuis le tracé.
- On ne pave jamais un champ.
- L'ouvrage achevé est annoncé dans la chronique, avec ses bâtisseurs.

**Quand** : une fois par jour, une colonie d'au moins 30 membres sans ouvrage en cours en ouvre un. Il faut :

- qu'elle aille bien : stabilité et bien-être d'au moins 0,5 ;
- que sa réserve tienne 2 portions par membre et ne baisse pas ;
- un ouvrage tous les 2 jours, ou chaque jour si la beauté est son point faible.

Elle ouvre le premier ouvrage de la liste qu'elle peut faire. Les ouvrages se répètent tant qu'il reste à faire (maisons de bois, routes, marais), les autres ne se font qu'une fois.

## Plan de ville

- **Le cœur civique** : aucune maison à moins de 6 cases du camp.
- **La place** : un carré pavé de 5 × 5 au camp.
- **Les rues** : des pavés le long des quatre axes qui passent par le camp, depuis la place jusqu'au mur de l'enceinte (ou 18 cases).
  - Le plan des maisons met ses allées sur ces axes : les rangées de maisons bordent les rues.
  - Une rue saute un champ et franchit un canal sur un **pont**.
- **Le pavé** : on y marche 1,4 fois plus vite.
- **Le pont** : il garde l'eau dessous (on y boit), on y marche comme sur un pavé, et les prédateurs le traversent.
- **La fontaine** : le canal qui amène l'eau au camp ([02](02-monde.md), « Canaux ») s'achève en fontaine sur la place, où l'on boit. Un canal qui croise une rue y passe sous un pont.

## Matériaux et édifices

- **Édifices publics** : aux quatre coins de la place, chacun un bloc de 3 × 3, posé le centre d'abord.

  | Édifice | Coin | Coût par case |
  | --- | --- | --- |
  | Temple | Nord-est | 2 pierres, 1 argile |
  | Grenier | Nord-ouest | 2 bois |
  | Marché | Sud-est | 1 bois, 1 fibre ; on y marche |
  | Monument et sa statue dorée au centre | Sud-ouest | 3 pierres |

  Les édifices pleins arrêtent tout le monde, prédateurs compris.
- **Maisons de pierre** : la colonie rebâtit en pierre les murs de ses maisons de bois, une maison à la fois. Elle garde la porte et les lits. Il faut 2 pierres par pan.
- **Mur de pierre** : la palissade d'une enceinte fermée est rebâtie en pierre, pan par pan (2 pierres). Le mur de pierre ferme l'enceinte comme la palissade, et une tour peut s'y dresser.

## Paysage aménagé

- **Vergers en rangées** : les champs de baies se plantent sur une rangée sur deux à partir du camp, trois buissons côte à côte, avec une rangée vide entre deux.
- **Allée d'arbres** : un arbre toutes les 3 cases sur l'anneau à 2 cases hors de l'enceinte, là où le sol est libre. L'arbre planté est un obstacle pour tous.
- **Arbres d'alignement** : un arbre toutes les 4 cases le long des routes, hors des murs.

## Grands travaux

- **Routes pavées entre colonies** : une colonie trace une route vers chaque colonie parente qu'elle connaît.
  - Le tracé est le plus court chemin (4 voisins) d'un camp à l'autre, par la terre libre, les portes et les pavés.
  - Une seule route par paire de colonies.
- **Défrichage** : le bois coupé jusqu'au dernier en forêt, à portée des champs de la colonie, laisse une clairière pour de bon. La forêt devient plaine et ne repousse pas.
  - Ce bois ne compte pas contre la durabilité : c'est un défrichage, pas une forêt épuisée.
- **Assèchement** : jusqu'à 40 cases de marais à portée des champs deviennent des plaines, les plus proches du camp d'abord (1 bois par case).
- **Carrières** : la pierre, l'argile ou le minerai extraits jusqu'au dernier en montagne ou au désert laissent une carrière, visible, où l'on marche moins vite (×0,7).

## Beauté

La sixième composante de l'harmonie ([07](07-harmonie.md)) est la **beauté**, de 0 à 1. Elle se compte une fois par jour sur l'enceinte élargie de 3 cases (ou sur le territoire). C'est la moyenne de :

- le pavage, rapporté à une place et quatre rues ;
- la part des murs de maisons en pierre ;
- les édifices (4 blocs de 9 cases) ;
- les arbres plantés (30 attendus) ;
- une fontaine ;
- s'il y a des murs d'enceinte, la part en pierre.

Quand la colonie va bien (stabilité et bien-être d'au moins 0,5) et que la beauté est sa composante la plus faible, la beauté devient son point faible. Elle ouvre alors un ouvrage chaque jour. Une colonie qui a faim ne s'embellit pas.

## Ce qui reste à faire

- Agrandir une ville pleine : un second anneau de murs.
- Des quartiers spécialisés (artisans, marché).
- Des styles qui diffèrent d'une colonie à l'autre, transmis par le savoir.
- L'usure des bâtiments et leur entretien.
