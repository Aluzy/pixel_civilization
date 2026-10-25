# 16 — Menaces, combattants, conflits et forteresses

> Chantier préparé après le J7 (décision 0020). Rien n'est encore implémenté. Valeurs 🟡 à caler.

## Le constat (J7)

Les menaces ne pèsent pas assez : le besoin de sécurité ne s'exprime presque jamais.

| Mesure (6 graines, 60 jours, 56 à 107 individus) | Valeur |
| --- | --- |
| Attaques de prédateurs | 12 à 174 par partie |
| Pixels tués par un prédateur | **0** |
| Prédateurs tués | 1 à 6 par partie |

Raisons : au plus un prédateur par individu et seulement hors abri, un prédateur fuit sous 25 % de ses PV et abandonne après 300 cycles sans toucher, la régénération des individus efface vite les blessures, les abris sont des sanctuaires absolus et l'objectif Fuir réussit presque toujours.

## 1. Des menaces qui comptent (J8)

- **Meutes** : les prédateurs arrivent par 2 à 4 🟡 la nuit, plus nombreux quand le camp grandit (la colonie attire). Une meute encercle (chaque prédateur vise une case libre différente autour de la proie).
- **Tanière** : chaque meute a une tanière (pixel rouge sombre fixe en forêt), d'où elle part et où elle revient. Une tanière connue est une cible (projet « chasse ») ; détruite, la région se calme pour longtemps.
- **Ils reviennent** : un prédateur blessé retourne à sa tanière, guérit et revient ; il abandonne une chasse plus tard (🟡 900 cycles).
- **Les abris ne sont plus des sanctuaires** : une meute peut forcer un abri isolé (dégâts à l'abri, comme une construction a des PV) ; un abri entouré d'une palissade ne peut pas l'être.
- **Blessures** : la régénération est lente quand l'individu a été blessé récemment (🟡 1/4 pendant 1 jour) ; une blessure grave (PV < 30 %) réduit la vitesse.
- **Gibier** : un prédateur tué laisse de la viande et une peau (bien : vêtement, couverture). La chasse devient rentable.
- **Le besoin de sécurité** entre dans la pyramide comme une jauge (aujourd'hui seule la vulnérabilité imaginée le porte) : elle monte avec le danger perçu (attaques vues ou subies, danger appris des zones, morts récentes au camp), baisse à l'abri entouré, en groupe, armé. Son poids est le gène « poids de la sécurité ».

## 2. Des combattants (J8)

- **Compétence de combat** : chaque coup porté ou reçu l'entraîne (expérience apprise, bornée, affichée) : attaque et défense effectives montent avec la pratique, jusqu'à ×1,5 🟡.
- **Métier de soldat** ([14-economie](14-economie.md)) : choisi par avantage comparatif (bonne attaque, compétence, aversion au risque basse dans le génome), payé par la colonie. Ses tâches : **garde** (veiller au camp la nuit, entre les abris et la forêt), **escorte** (accompagner une expédition ou une caravane), **chasse** (traquer une meute ou une tanière connue).
- **Équipement** : armes de l'arbre (lance, cuivre, fer), **bouclier** (bois puis métal, défense), **armure de peau**.
- **Combat de groupe** : l'IA connaît le nombre (simulation mentale du J5 étendue à plusieurs combattants de chaque côté) et attend des renforts plutôt que d'attaquer seule.

## 3. Trésors et forteresses (J12)

- **Trésor** : construction « salle du trésor » (coffre de pierre) qui garde l'or, les écus, les pierres précieuses et les objets rares de la colonie ([14](14-economie.md)). Son contenu se voit dans l'inspecteur.
- **Murs** : nouvelles constructions **infranchissables** (palissade de bois, mur de pierre, mur de brique), **porte** (franchissable par les membres, pas par les autres ni les prédateurs), **tour** (une garde y voit plus loin et frappe mieux). Les constructions sont franchissables aujourd'hui : la navigation doit apprendre les obstacles (coût infini, portes conditionnelles).
- **Forteresse émergente** : quand le danger perçu ou la valeur du trésor dépasse un seuil, la colonie ouvre un projet **enceinte** : un mur fermé autour du trésor et des abris, avec une porte. Le tracé est calculé par la colonie à partir de ses constructions (enveloppe convexe du J7 élargie d'une case), puis découpé en tâches « bâtir ce segment ».
- Les murs comptent dans l'ordre spatial (compacité) et créent une nouvelle catégorie de zone (défense).

## 4. Conflits entre colonies (J13)

- **Pourquoi** : rivalité pour un territoire qui se chevauche, une ressource rare (or, pierres, tanière de gibier), un trésor connu ; rancune après un incident ; faim (une colonie affamée pille).
- **Comment ça commence** : chaque incident baisse la relation ([15](15-colonies-et-migration.md)). Sous un seuil, et si la simulation mentale prédit un gain (butin attendu × chance de victoire > pertes attendues), la colonie ouvre un projet **raid** : une troupe de soldats va prendre de la nourriture ou le trésor de l'autre colonie et revient.
- **Défense** : les gardes voient arriver la troupe (perception), sonnent l'alerte (événement inscrit au tableau noir : tous les membres proches choisissent Se défendre ou Fuir vers l'enceinte). Derrière un mur, un défenseur reçoit moins de coups (🟡 défense ×2) ; une porte fermée doit être forcée (elle a des PV).
- **Fin** : une troupe battue fuit ; un butin rapporté entre au trésor. Une paix se fait quand la relation remonte (échanges, temps) ; une colonie trop affaiblie peut être absorbée (ses membres rejoignent l'autre).
- **Lisibilité** : un combat entre colonies se voit (pixels noirs qui se rencontrent, flashs de coups au zoom élevé), la chronique le raconte, le calque « territoires » montre qui est où.

## Ce qui reste exclu

- Le joueur ne choisit jamais de camp ni ne déclenche un conflit.
- Pas de scénario : un raid n'arrive que si les règles le produisent.
- Pas de violence détaillée au-delà de pixels et de nombres : la mort est un événement de chronique, comme aujourd'hui.

## Données à créer

- `data/world.json` → `threats` : meutes, tanières ; `data/recipes.json` : bouclier, armure, palissade, mur, porte, tour, salle du trésor.
- `data/balance.json` → `threats` (meutes, abandon, forçage d'abri), `combat` (compétence, bonus des murs), `conflict` (seuils de relation, simulation du raid).

## Critères de sortie proposés

- **J8 (danger)** : sur 10 graines et 60 jours, des pixels meurent de prédateurs (au moins 1 par partie en moyenne) et les pixels tuent au moins 3 fois plus de prédateurs qu'aujourd'hui ; un métier ou rôle de garde apparaît ; la part des décisions de sécurité (fuir, s'abriter, garder) double, sans extinction.
- **J12 (forteresses)** : sur la majorité des graines à 150 jours, une colonie bâtit une enceinte fermée autour de son trésor ; les prédateurs ne la franchissent pas.
- **J13 (conflits)** : sur un ensemble de graines à 200 jours, au moins un raid a lieu ; au moins un raid échoue contre une enceinte ; des colonies voisines restent aussi en paix et commercent.
