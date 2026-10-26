# 16 — Menaces, combattants, conflits et forteresses

> Chantier préparé après le J7 (décision 0020). Les sections 1 et 2 sont implémentées au J8 (décision 0021, voir « Ce que fait le J8 »), la section 3 au J12 (décision 0025, voir « Ce que fait le J12 ») ; la section 4 reste à faire. Valeurs 🟡 à caler.

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

## Ce que fait le J8

Ce qui est implémenté, et où cela s'écarte des sections 1 et 2 (décision 0021) :

- **Tanières** (`threats.densPerColony`, 2 au plus par colonie) : posées hors de vue du camp (28 à 40 cases) en forêt ou en plaine, dès que la colonie compte 6 membres (puis une de plus tous les 30). Une tanière a 80 PV et se soigne lentement ; détruite, elle disperse sa meute et la région reste calme 8 jours.
- **Meutes** : chaque tanière nourrit une meute de 2 à 4 prédateurs (un de plus tous les 15 membres). Le jour, la meute garde sa tanière ; la nuit, elle rôde vers le camp et encercle sa proie (chaque prédateur vise une case différente autour d'elle). Un prédateur blessé rentre à sa tanière et y guérit ; une chasse est abandonnée après 900 cycles. Les rôdeurs solitaires du J4 restent.
- **Abris forcés** : une meute peut frapper un individu dans un abri **isolé** (aucun autre abri à moins de 3 cases). Les abris groupés restent des sanctuaires en attendant les palissades (J12). Pas de PV d'abri pour l'instant.
- **Blessures** : après un coup, la régénération tombe au quart pendant 1 jour. Le ralentissement des blessés graves est reporté.
- **Gibier** : un prédateur tué laisse une **carcasse** (ressource de 4 unités, nutrition 30), qui pourrit en 2 jours ; la dernière unité récoltée donne une **peau**.
- **Peur** : jauge de 0 à 100 dans l'individu. Elle monte quand il est frappé (+25), quand il voit un prédateur (+4 par décision) et à la mort d'un proche tué par un prédateur à moins de 16 cases (+30). Elle baisse vite au camp ou dans un abri, plus lentement ailleurs, et remonte la nuit hors du camp. Le nouvel objectif **Se cacher** (vers l'abri le plus proche de la colonie, sinon le camp) en dépend ; le gène de sécurité le pondère.
- **Compétence de combat** : chaque coup porté (+0,02) ou reçu (+0,01) l'entraîne, au rythme du gène d'apprentissage ; elle multiplie attaque et défense jusqu'à ×1,5. Elle s'affiche dans l'inspecteur (« combat N % »).
- **Équipement** : **bouclier** (établi : 3 bois + 1 peau, défense 2) et **armure de peau** (établi : 2 peaux + 2 fibres, défense 3), découverts par l'essai comme toute recette.
- **Rôle de garde** (pas encore un métier payé, qui viendra avec l'économie du J10) : une colonie menacée (attaque dans les 3 derniers jours ou tanière connue) veut 1 garde par 10 membres. Un membre au camp prend la garde s'il est armé ou sait faire une arme, s'il n'est ni scribe ni inventeur et si son gène de goût du risque reste sous 0,6. Un poste dure 6 jours. La nuit, le garde veille : il attaque un prédateur vu à moins de 14 cases du camp, sinon fait des rondes juste hors du camp. Le jour, il s'équipe (arme puis armure). S'il connaît une tanière, si au moins 2 gardes sont en poste et s'il a 70 % de ses PV, il part la **chasser** et frappe la tanière jusqu'à la détruire. L'escorte attendra les expéditions (J11).
- **Combat de groupe** : la simulation mentale du combat compte les alliés proches (moins de 4 cases) et les prédateurs de la meute ; un individu seul face à une meute fuit, un groupe tient.

Mesures (10 graines, 60 jours) :

| Mesure | J7 | J8 |
| --- | --- | --- |
| Pixels tués par un prédateur, par partie | 0,1 | 1,9 |
| Prédateurs tués, par partie | 4,4 | 63,2 |
| Tanières détruites (total) | — | 14 |
| Gardes au plus fort | 0 | 5 à 11 |
| Part des décisions de sécurité | 0,004 % | 9,0 % |
| Population au jour 60 | 45 à 107 | 45 à 106 |

## 3. Trésors et forteresses (J12)

- **Trésor** : construction « salle du trésor » (coffre de pierre) qui garde l'or, les écus, les pierres précieuses et les objets rares de la colonie ([14](14-economie.md)). Son contenu se voit dans l'inspecteur.
- **Murs** : nouvelles constructions **infranchissables** (palissade de bois, mur de pierre, mur de brique), **porte** (franchissable par les membres, pas par les autres ni les prédateurs), **tour** (une garde y voit plus loin et frappe mieux). Les constructions sont franchissables aujourd'hui : la navigation doit apprendre les obstacles (coût infini, portes conditionnelles).
- **Forteresse émergente** : quand le danger perçu ou la valeur du trésor dépasse un seuil, la colonie ouvre un projet **enceinte** : un mur fermé autour du trésor et des abris, avec une porte. Le tracé est calculé par la colonie à partir de ses constructions (enveloppe convexe du J7 élargie d'une case), puis découpé en tâches « bâtir ce segment ».
- Les murs comptent dans l'ordre spatial (compacité) et créent une nouvelle catégorie de zone (défense).

## Ce que fait le J12

Implémenté au J12 (décision 0025). Là où il s'écarte de la section 3, c'est ce qui suit qui vaut.

**Or et pierres précieuses** : deux ressources nouvelles, à extraire à la pioche de pierre.

- L'or se trouve en montagne et, plus rare, au désert ; les pierres précieuses en haute montagne.
- Leur prix de base est leur valeur (40 et 80 écus), pas le travail de les extraire.
- Le mineur les vend au comptoir. Ce ne sont pas des matériaux : on ne les essaie pas dans des recettes, on les garde.
- Le comptoir ne les paie qu'avec les écus dont il peut se passer : au-delà de 100 écus par membre. Sinon l'or vidait la caisse, et le comptoir ne pouvait plus payer la nourriture.

**Salle du trésor** (pierre 8, argile 4, bâtie au camp) : projet ouvert dès 30 membres. Elle garde l'or, les pierres précieuses et les écus du comptoir. Sa **valeur** est la somme des écus et de l'or et des pierres au prix du comptoir. Le bloc Colonie de l'inspecteur montre son contenu.

**Danger ressenti** : chaque jour, le danger de la colonie est multiplié par 0,8, et augmente de 1 si un membre a été attaqué près du camp ce jour-là.

**Murs, porte, tour** :

- **Palissade** (bois 2) : infranchissable pour tous.
- **Porte** (bois 4, argile 2) : les individus passent, les prédateurs non. Au J12, elle laisse passer tout individu, même d'une autre colonie (les caravanes doivent atteindre le comptoir). La réserver aux membres viendra avec les conflits du J13.
- **Tour** (pierre 6, fibre 2) : posée sur le mur, à la place de la palissade voisine d'une porte (un angle ne se gravit pas : ses deux voisines sur l'anneau sont des murs, et l'on ne coupe pas les coins). Un individu y monte ; un prédateur ne la franchit pas. Le garde de nuit y veille : il voit 6 cases plus loin et frappe ×1,5.
- Le mur de pierre et le mur de brique sont reportés.

**L'enceinte** : quand la colonie a sa salle du trésor et que son danger atteint 2, ou la valeur du trésor 8 000 écus, elle ouvre le projet **Enceinte**.

- **Tracé** : un rectangle autour de la salle du trésor et des abris, stations et bibliothèques à 12 cases au plus d'elle, élargi d'une à trois cases : la marge dont l'anneau croise le moins de constructions. Pas plus de 40 cases de côté. Ce rectangle remplace l'enveloppe convexe de la section 3 : un anneau à angles droits ne laisse aucun passage en diagonale.
- **Portes** : une au milieu de chaque côté où l'on peut se tenir (la section 3 n'en prévoyait qu'une : avec une seule, tout le trafic du camp faisait le tour du mur, et la moitié des colonies cessaient de grandir). **Tour** à côté de la première porte.
- **Chantier** : les portes d'abord, puis la palissade par lots de 10 pans. Le bâtisseur prend les matériaux d'un lot à la réserve. Il se poste à côté du pan le plus proche de lui et le bâtit depuis là, jamais sur une case occupée.
- Une parcelle sur le tracé est abandonnée ; une ressource y est défrichée. Les cases d'eau comptent comme fermées. Aucune construction nouvelle ne se pose sur le tracé.
- Le dernier pan n'est pas posé tant qu'un prédateur est à l'intérieur.
- **Fermée**, l'enceinte est un événement de chronique. Un projet **Tour** suit.

**Les prédateurs** ne traversent ni mur, ni porte, ni tour, et aucun n'apparaît dans une enceinte fermée. Un anneau d'une case d'épaisseur les tient à deux cases de quiconque est à l'intérieur : ils ne peuvent pas frapper par-dessus. Chaque entrée d'un prédateur dans une enceinte fermée compte comme une intrusion (attendu : aucune).

**Navigation avec obstacles** : la recherche de chemin locale (fenêtre de perception) traite murs et prédateurs comme infranchissables. Un mur plus long que la fenêtre la piégerait, alors un individu passe par des points de route :

- pour sortir, la case juste derrière la porte qui fait le trajet le plus court ; pour entrer, de même parmi les portes des côtés devant lesquels il se trouve ;
- d'un côté sans porte, d'abord l'angle extérieur, le long du mur ;
- pour une cible de l'autre côté d'une enceinte, l'angle le plus proche.

Les enceintes sont des constructions visibles : chacun connaît leur tracé et leur porte, comme on voit un mur de loin.

Mesures (10 graines, 150 jours) :

| Mesure | Valeur |
| --- | --- |
| Enceinte fermée autour du trésor | 10 graines sur 10, du jour 24 au jour 71 |
| Tour bâtie | 10 sur 10 |
| Intrusions de prédateurs | 0 |
| Population au jour 150 | 48 à 500 (de même au J11) |
| Au moins deux colonies au jour 150 | 7 graines sur 10 (8 au J11) |

**Ce qui reste à faire** : agrandir l'enceinte quand la colonie déborde ses murs (les abris bâtis après restent dehors), murs de pierre et de brique, points de vie des murs, ordre spatial et zone de défense dans l'harmonie.

### Le village dans les murs (décision 0026)

L'enceinte doit loger toutes les habitations, elle est donc bien plus grande :

- **Tracé** : elle entoure :
  - la salle du trésor ;
  - les stations et bibliothèques à 12 cases d'elle ;
  - **toutes les maisons** de la colonie, murs compris.
- Ce rectangle est ensuite agrandi d'un côté à la fois, jusqu'à loger les maisons de 80 membres. Une maison et son allée occupent 5 × 4 cases.
- Pas plus de 64 cases de côté (au lieu de 40). En pratique, 30 à 43 cases de côté, soit 130 à 160 pans.
- **Maisons** : une fois l'enceinte décidée, les maisons se bâtissent à l'intérieur, en rangées autour du camp. Une parcelle restée dedans cède la place à une maison.
- **Champs** : les parcelles se font hors les murs, à 20 cases au plus de l'enceinte.
- **Tours** : une tour à côté de chaque porte. Après la fermeture, un projet de tour par tour, l'une après l'autre.
  - La nuit, chaque garde monte sur la tour libre la plus proche : il y voit 6 cases plus loin et frappe ×1,5.
  - Le jour, il dort quand sa fatigue l'y pousse.
- Les prédateurs ne passent ni les murs ni les portes des maisons : qui dort dans une maison est à l'abri, même hors de l'enceinte.
- **Porte d'eau** (décision 0027) : un canal peut passer sous l'enceinte à la place d'un pan de palissade. Les prédateurs ne le traversent pas : le pan compte comme fermé.

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

- **J8 (danger)** : sur 10 graines et 60 jours, des pixels meurent de prédateurs (au moins 1 par partie en moyenne) et les pixels tuent au moins 3 fois plus de prédateurs qu'au J7 ; un rôle de garde apparaît ; les décisions de sécurité (fuir, se cacher, garder, chasser) prennent au moins 1 % du temps des pixels, sans extinction. (« Doubler » une part de 0,004 % ne voulait rien dire : le seuil est devenu absolu, décision 0021.) Atteint, voir ci-dessus.
- **J12 (forteresses)** : sur la majorité des graines à 150 jours, une colonie bâtit une enceinte fermée autour de son trésor ; les prédateurs ne la franchissent pas.
- **J13 (conflits)** : sur un ensemble de graines à 200 jours, au moins un raid a lieu ; au moins un raid échoue contre une enceinte ; des colonies voisines restent aussi en paix et commercent.
