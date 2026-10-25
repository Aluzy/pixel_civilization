# 0025 — Trésors et forteresses : salle du trésor, enceinte rectangulaire, portes, navigation par points de route

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/16-guerre-et-forteresses.md`, `02-monde.md`, `06-ia.md`, `08-interface.md`, `09-architecture.md`, `11-feuille-de-route.md`, `13-agriculture-cuisine.md`, `14-economie.md`, glossaire

## Contexte

Le J12 doit donner aux colonies un trésor, des murs infranchissables, des portes et des tours, une navigation qui sait contourner des obstacles, et un projet d'enceinte qui naît du danger ou de la valeur du trésor. Critère de sortie : sur la majorité des graines à 150 jours, une colonie bâtit une enceinte fermée autour de son trésor, que les prédateurs ne franchissent pas.

Jusqu'ici, toutes les constructions se traversaient. La recherche de chemin ne voit que la fenêtre de perception (décision 0006) : un mur plus long que cette fenêtre l'enfermerait dans un cul-de-sac.

## Décision

**Trésor** :

- Deux ressources nouvelles, l'**or** (montagne, désert) et les **pierres précieuses** (haute montagne), à extraire à la pioche de pierre.
  - Leur prix de base est une valeur fixe (40 et 80 écus).
  - Elles ne sont pas des matériaux d'essai.
  - Le mineur les vend.
  - Le comptoir les paie avec les écus qu'il a au-delà de 100 par membre.
- La **salle du trésor** (pierre 8, argile 4) est un projet de colonie dès 30 membres ; elle est bâtie au camp. La valeur du trésor est la somme des écus du comptoir, et de l'or et des pierres au prix du comptoir.

**Murs** :

- La **palissade** (bois 2) bloque tout le monde.
- La **porte** (bois 4, argile 2) bloque les prédateurs. Au J12, elle laisse passer tout individu, même d'une autre colonie.
- La **tour** (pierre 6, fibre 2) remplace la palissade voisine d'une porte : elle se gravit depuis l'intérieur, ce qu'un angle ne permet pas. Un garde y monte ; les prédateurs ne la franchissent pas.
- La recherche locale traite les murs comme de l'eau. Un déplacement prévu avant qu'un mur ne coupe le chemin s'arrête et se replanifie.

**Enceinte** :

- **Quand** : la colonie a sa salle du trésor, et son **danger ressenti** atteint 2, ou la valeur du trésor 8 000 écus. Le danger ressenti s'efface de ×0,8 par jour et augmente de 1 chaque jour où un membre est attaqué près du camp.
- **Tracé** : un rectangle autour de la salle du trésor et des abris, stations et bibliothèques à 12 cases d'elle. Il est élargi d'une à trois cases, selon la marge qui croise le moins de constructions, et ne dépasse pas 40 cases de côté.
  - Pas d'enveloppe convexe : un anneau à angles droits et d'une case d'épaisseur ne laisse aucun passage en diagonale. Il tient aussi tout prédateur à deux cases au moins de quiconque est dedans.
- **Portes** : une au milieu de chaque côté où l'on peut se tenir. La tour se place à côté de la première porte.
- **Chantier** : les portes d'abord, puis la palissade par lots de 10 pans.
  - Le bâtisseur se poste à côté du pan le plus proche et le bâtit (action `BUILD`), jamais sur une case occupée.
  - Une parcelle sur le tracé est abandonnée, une ressource y est défrichée, et rien de neuf ne s'y bâtit.
  - Le dernier pan attend qu'aucun prédateur ne soit à l'intérieur.
- Aucun prédateur n'apparaît dans une enceinte fermée. Une entrée y compterait comme une **intrusion**.

**Navigation par points de route** : chacun voit les enceintes, qui sont des constructions visibles de loin.

- Pour franchir un mur, l'individu vise la case juste derrière la porte qui fait le trajet le plus court. Pour entrer, il choisit une porte d'un côté devant lequel il se trouve.
- D'un côté sans porte, il longe le mur jusqu'à l'angle.
- Pour une cible de l'autre côté d'une enceinte, il passe par l'angle le plus proche.

**Garde** : la nuit, il veille du haut de la tour s'il y en a une ; il y voit 6 cases plus loin et frappe ×1,5.

**Agriculture**, deux corrections révélées par les mesures :

- Trois glaneurs au plus à la fois ; un glaneur qui tient une graine la sème aussitôt.
- Un membre qui a oublié comment semer rend son travail agricole.
  - Sinon il le gardait pour toujours, sans plus jamais le faire.
  - Les places de glaneur restaient prises, et la colonie restait sans champ.

## Conséquences

- Mesures sur 10 graines et 150 jours : voir la feuille de route ([11](../design/11-feuille-de-route.md), J12).
- **Une porte unique coûtait cher** : tout le trafic du camp (dépôts, réserve, tableau noir) faisait le tour du mur.
  - Avec une seule porte, 5 colonies sur 10 plafonnaient entre 40 et 120 membres, et 4 graines seulement avaient deux colonies.
  - Avec les murs traversables (expérience), 9 graines sur 10 en avaient deux.
  - D'où une porte par côté, qui s'écarte de la conception initiale (« une porte »).
- L'enceinte entoure le cœur du camp au moment où elle est décidée (vers 30 à 40 membres). Les abris bâtis ensuite restent dehors.
- La porte ne trie pas encore amis et étrangers (J13).
- Le mur de pierre, le mur de brique et les points de vie des murs sont reportés. Les murs ne comptent pas encore dans l'ordre spatial de l'harmonie.
- Les mondes changent : de l'or et des pierres apparaissent sur des cases de montagne et de désert qui étaient vides. Les graines de démonstration des tests changent en conséquence.
- Valeurs de `data/balance.json` :
  - nouvelle section `fortress` ;
  - `agriculture.gleaners` (3).
