# 0021 — Danger : tanières, meutes, peur et gardes

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/16-guerre-et-forteresses.md`, `02-monde.md`, `03-individu.md`, `06-ia.md`, `08-interface.md`, `11-feuille-de-route.md`, glossaire

## Contexte

Au J7, le besoin de sécurité ne s'exprimait presque jamais : 0,1 pixel tué par un prédateur par partie de 60 jours, 4,4 prédateurs tués, et 0,004 % des décisions consacrées à la sécurité. Le J8 doit rendre le danger réel sans rendre les colonies impossibles à faire vivre, et faire naître des combattants.

## Décision

- **Des tanières attachées aux colonies** plutôt qu'un monde plus dangereux partout : une colonie d'au moins 6 membres attire jusqu'à 2 tanières hors de vue, chacune avec une meute dont la taille suit la population. Le danger grandit avec ce qu'il y a à protéger, et une tanière détruite apaise la région pour 8 jours. Les rôdeurs solitaires du J4 restent pour le pixel isolé.
- **Les abris groupés restent des sanctuaires** ; seul un abri isolé (aucun autre à moins de 3 cases) peut être forcé. Cela récompense le camp compact sans attendre les palissades et les PV des constructions (J12).
- **La peur est une jauge**, distincte du danger instantané de Fuir : elle se souvient d'un coup, d'un prédateur vu ou d'un proche tué, et porte un objectif à part, Se cacher. Fuir reste un réflexe de survie.
- **La garde est un rôle, pas encore un métier** : un nombre de postes fixé par la menace (1 pour 10 membres), occupés par des membres aptes (armés ou sachant faire une arme, peu averses au risque selon leur génome, ni scribe ni inventeur), pour 6 jours. Le métier payé viendra avec l'économie (J10).
- **La compétence de combat** s'apprend à chaque coup (borne ×1,5), au rythme du gène d'apprentissage, et s'affiche dans l'inspecteur : apprentissage symbolique, borné, lisible.
- **Combat de groupe imaginé** : la simulation mentale met en commun PV et coups des alliés proches et de la meute.
- **Critère de sortie reformulé** : « doubler la part des décisions de sécurité » n'avait pas de sens à partir de 0,004 % ; le seuil devient absolu, au moins 1 % du temps des pixels.

## Conséquences

- Mesures (10 graines, 60 jours) : 1,9 pixel tué par un prédateur par partie, 63,2 prédateurs tués, 14 tanières détruites, 5 à 11 gardes au plus fort, 9,0 % des décisions pour la sécurité, 45 à 106 individus au jour 60, aucune extinction.
- `data/balance.json` gagne `threats` (tanières, meutes), `combat` et `safety` ; l'attaque d'un prédateur passe de 7 à 8 pour que les blessures comptent malgré la compétence.
- Les graines de démonstration changent encore (J3 : graine 10 ; J6 : graines 5 et 33, aucune graine ne montrant plus les deux en 90 jours) parce que les colonies vivent autrement.
- Reporté : PV des abris et palissades (J12), ralentissement des blessés graves, viande à cuire (J9), escorte (J11).
