# 11 — Feuille de route

Le développement avance en huit jalons. Chacun produit une version jouable publiée sur GitHub Pages. **Un jalon n'est commencé que lorsque le précédent remplit son critère de sortie.**

L'IA monte en niveau au fil des jalons (niveaux définis dans [06-ia](06-ia.md)) :

| Jalon | Niveau d'IA ajouté |
| --- | --- |
| J2 | 1 — Utility AI |
| J3–J4 | 2 — GOAP et cartes d'influence |
| J4–J5 | 3 — Projets à long terme et simulation mentale |
| J5 | 4 — Modèle des autres et coopération |
| J7 | 5 et 6 — Apprentissage par l'expérience, génome et évolution |

## J0 — Socle (`v0.1.0`)

- Projet Vite + Phaser 4, scripts npm, ESLint, Prettier, Vitest.
- Squelette `src/` et `data/` conforme à [09-architecture](09-architecture.md).
- Worker vide qui répond à `init` et renvoie des `frame`.
- Générateur à graine, hash d'état, test de déterminisme (même trivial).
- Workflows `deploy.yml` et `ci.yml`.

**Sortie** : la page s'affiche sur `https://aluzy.github.io/pixel_civilization/` avec la graine et la version.

## J1 — Monde (`v0.2.0`)

- Génération procédurale par blocs : bruit, biomes, ressources en amas.
- `data/resources.json` avec la palette.
- Rendu des blocs en textures, caméra, zoom, chargement et déchargement des blocs selon la vue.
- Inspection d'une case.

**Sortie** : on se déplace dans un monde de 2 048 × 2 048 cases à 60 images par seconde ; deux chargements avec la même graine montrent le même monde.

## J2 — Survie (`v0.3.0`)

- ECS, ordre des systèmes, horloge de cycles, jour/nuit.
- Un individu : jauges faim/soif/fatigue, récolte à mains nues, manger, boire, dormir.
- Utility AI avec les objectifs de survie ; actions simples sans GOAP (déplacement en ligne droite puis A* sur la grille).
- Contrôle du temps : pause, paliers, saut à l'aube, saut à l'événement, vitesse effective.
- Panneau d'inspection minimal, simulation headless.

**Sortie** : le pixel survit seul 10 jours de simulation sans intervention, et l'observateur atteint le jour 10 en moins d'une minute réelle.

Réalisé : survie 10 jours sur 60 graines sur 60 (test automatique sur 10 graines), jour 10 atteint en ~5 s à ×256. Ajouts non prévus : une mémoire minimale des lieux d'eau et de nourriture (sans elle, l'individu ne retrouvait pas l'eau), la repousse des ressources, une chronique partielle et le suivi de l'individu par la caméra.

## J3 — Mémoire et exploration (`v0.4.0`)

- Perception, mémoire limitée, force et oubli, croyances fausses.
- Cartes d'influence personnelles, exploration de la frontière.
- Inspecteur : mémoire avec barres de force, calque « ce qu'il croit savoir ».

**Sortie** : on voit le pixel oublier un lieu, échouer à le retrouver, puis le redécouvrir par exploration.

Réalisé : mémoire à force et oubli, souvenirs flous, carte d'exploration personnelle, calque M. La séquence complète est rare quand la mémoire fonctionne bien (le pixel n'oublie que des lieux lointains) : 3 graines sur 150 en 40 jours. Graine de démonstration : **47** — il oublie le point d'eau (8, −7) au jour 11, le cherche au jour 19 d'après un souvenir flou, ne le trouve pas, puis le redécouvre le soir même. Depuis le J4, le comportement a changé ; au J5 c'est la graine **20** qui sert de test : l'individu #14 oublie le point d'eau (−12, 7) au jour 10, ne le retrouve pas au jour 14, puis le retrouve quelques instants plus tard. Survie 10 jours : 99 graines sur 100.

## J4 — Fabrication (`v0.5.0`)

- Stations, `data/recipes.json`, fabrication, construction de l'abri.
- Découverte par l'essai avec heuristique de curiosité, souvenirs d'échec.
- Planificateur GOAP complet, avec cache.
- Budget de réflexion en unités de travail.
- Premiers projets à long terme (HTN) pour l'individu seul : abri, outils.
- Menaces : prédateurs ; combat ; objectifs Sécurité et Équipement.

**Sortie** : sans aide, le pixel découvre l'établi, une arme, un outil et construit un abri avant le jour 5 sur au moins 8 graines sur 10.

Réalisé : 10 graines sur 10 (graines 1 à 10, test automatique), 28 sur 30 sur les graines 11 à 40, entre 2,4 et 4,7 jours. Stations et abri posés sur une couche « construction » des blocs, découverte par l'essai guidée par ce que l'individu sait déjà, GOAP à rebours avec cache partagé et budget de 300 nœuds, premier projet HTN « S'installer », prédateurs, combat et fuite. L'individu survit 10 jours sur 30 graines sur 30 et 20 jours sur 40 sur 40. Ajouts non prévus : les minerais exigent une pioche (sans quoi les matériaux à combiner étaient trop nombreux), les actions de travail et le sommeil ne sont plus interrompus par les réévaluations périodiques. Reporté : couleur des produits dérivée des ingrédients, feu de camp et cuisson, défense de l'abri remplacée par une protection complète (décisions 0008 à 0010).

## J5 — Réplication et colonie (`v0.6.0`)

- Conditions et coût de réplication, mutations, naissance sans mémoire.
- Tableau noir collectif, générateurs de tâches, réservations, rôles émergents.
- Transmission orale et imitation.
- Projets de colonie sur le tableau noir ; simulation mentale pour les décisions stratégiques (site du camp, expéditions, fuir ou combattre).
- Modèle des autres : fiches sociales, coopération, spécialisation par avantage comparatif.
- Workers penseurs (parallélisme multi-cœurs) avec test d'égalité de hash entre K = 1 et K = 4.
- Chronique et filtres d'alerte, accélération automatique.

**Sortie** : une colonie d'au moins 20 individus reste stable (pas d'extinction, pas d'explosion) pendant 30 jours sur 8 graines sur 10, et l'inspecteur montre au moins un comportement préparatoire (stock constitué pour un projet) et une coopération à plusieurs.

Réalisé : 9 graines sur 10 (test automatique), avec 22 à 40 individus au jour 30 (la graine 10 en compte 18), aucune extinction et au plus 1 mort par graine. La population plafonne ensuite (42 à 70 individus vers les jours 50 à 60, sous le plafond de sécurité de 120). Sur 10 graines sur 10, des abris sont bâtis à plusieurs à partir d'une réserve remplie à l'avance, et le bloc Colonie le montre (matériaux réunis, contributeurs, bâtisseur). Ajouts : réplication régulée par les lits et la réserve, tableau noir des lieux, projets et tâches réservées, transmission orale et imitation, fiches sociales, rôles émergents, simulation mentale du combat, filtres de chronique et accélération automatique. Reporté : Workers penseurs et test K = 1 / K = 4 (décision 0012), simulation mentale du site du camp et des expéditions, spécialisation par avantage comparatif.

## J6 — Écrit (`v0.7.0`)

- Papier, encre, scriptorium, cartes, livres, bibliothèques.
- Lecture par les nouveaux nés, incendies, abandon, âge sombre.

**Sortie** : une recette survit à la mort de celui qui l'a découverte grâce à un livre, et une partie montre au moins un savoir perdu puis redécouvert.

Réalisé : la graine 8 montre les deux (test automatique) : l'établi est lu dans la bibliothèque au jour 59 après la mort de son découvreur, puis perdu au jour 83 (plus personne ne le sait, aucun livre à portée) et redécouvert par l'essai au jour 119. Sur 30 graines et 150 jours : une bibliothèque est bâtie dans 22 colonies (vers les jours 13 à 30), une recette est sauvée par un livre dans 17 (8 sur les graines 1 à 10), un savoir est perdu dans 26 et retrouvé dans 9 ; 15 parties voient au moins un incendie. Ajouts : documents à contenu propre (livres, cartes), un scribe par colonie, lecture prioritaire des nouveaux nés, cartes dessinées tous les 10 jours, abandon et incendie des bibliothèques, journal du savoir collectif, vieillesse (54 à 66 jours), un chercheur par projet sans recette connue, demander son chemin, essais guidés par la famille de recette (décisions 0013 et 0014). Les critères des jalons précédents tiennent : J4 sur 9 graines sur 10, J5 sur 8 graines sur 10. Reporté : bibliothèque en gabarit de plusieurs pixels, cartes consultées hors de la bibliothèque, copies de livres, déclin avec l'âge.

## J7 — Harmonie et finitions (`v0.8.0`)

- Score d'harmonie et ses composantes, tâches qui ciblent la composante la plus faible, aménagement du territoire.
- Tableau de bord avec courbes, calques complets, accessibilité.
- Arbre technologique complet (four, fonderie, métaux), équilibrage via la simulation headless, optimisations.
- Apprentissage par l'expérience (estimations bayésiennes simples, affichées dans l'inspecteur).
- Génome de décision hérité et muté ; graphiques de distribution des gènes.

**Sortie** : une partie de 100 jours avec 500 individus reste fluide à ×16 et produit une chronique lisible ; le score d'harmonie progresse sur la majorité des graines testées ; sur 100 jours, au moins un gène montre une dérive nette de sa moyenne dans la population.

Réalisé (en partie) :
- **Harmonie** : sur 10 graines et 100 jours, la moyenne des jours 91 à 100 dépasse celle des jours 11 à 20 sur 10 graines sur 10 (de 32 à 35 vers 38 à 69) ; test automatique sur 3 graines.
- **Génome** : sur les 10 mêmes parties, le gène qui a le plus dérivé s'écarte de 5,6 à 12,3 % de sa plage depuis le fondateur ; test automatique (au moins 5 %).
- **500 individus** : `npm run bench` fait vivre 500 fondateurs dans un monde aux baies abondantes (`data/bench.json`) pendant 100 jours ; un cycle coûte en moyenne 0,92 ms (pire jour 1,26 ms), loin des 6,25 ms qu'exige ×16 dans un navigateur ; la population reste à 484 jusqu'au jour 50, puis tombe vers 300 quand les fondateurs, nés le même jour, meurent de vieillesse. Une colonie née d'un seul pixel n'atteint pas 500 en 100 jours : elle compte 60 à 125 individus au jour 100, limitée par la réserve de nourriture d'avance qu'exige chaque naissance (décision 0011). Ce point du critère n'est donc vérifié que par la mesure, pas dans une partie ordinaire.
- **Ajouts** : score d'harmonie et ses cinq composantes, point faible au tableau noir et tâches qui le visent (champs, réserve, écrit), champs plantés près du camp, génome de 10 gènes hérité et muté, expérience apprise (danger des zones, coût réel des biens), inventeur, arbre technologique complet dans les données (four, brique, fonderie, lingots, outils et armes de cuivre et de fer), tableau de bord avec courbes (H, onglet Harmonie sur téléphone), outil de mesure (décisions 0016 à 0019).
- **Reporté** : découverte effective du four et des métaux (jamais observée en 120 à 160 jours sur 8 graines), calques de colonie, taille de texte réglable, coopération sur un grand bâtiment et spécialisation par avantage comparatif, coût réel des actions pour le GOAP.

## Vision v2 : danger, agriculture, économie, colonies, forteresses, conflits

Chantier ouvert après le J7 (décision 0020) pour la vision suivante : des menaces qui comptent, des combattants, l'agriculture découverte par l'essai, la cuisine, une économie de métiers, des richesses (or, pierres précieuses), des migrations qui fondent de nouvelles colonies, des forteresses autour des trésors et des conflits entre colonies. Inspiration pour l'agriculture, la cuisine et le marché : [Aluzy/family_farm](https://github.com/Aluzy/family_farm). Conception : [13-agriculture-cuisine](13-agriculture-cuisine.md), [14-economie](14-economie.md), [15-colonies-et-migration](15-colonies-et-migration.md), [16-guerre-et-forteresses](16-guerre-et-forteresses.md).

Le point ouvert du J7 (500 individus dans une partie ordinaire) passe dans la sortie du J9, dont l'agriculture le rend atteignable.

Ordre retenu : chaque jalon s'appuie sur le précédent et reste jouable seul.

### J8 — Danger et combattants (`v0.9.0`)

- Meutes et tanières, prédateurs qui reviennent, abris isolés qui peuvent être forcés, blessures lentes à guérir, gibier (viande, peau).
- Jauge de sécurité dans la pyramide des besoins, nourrie par le danger perçu et appris.
- Compétence de combat apprise, rôle de garde (veille de nuit, chasse aux tanières), bouclier et armure de peau, combat de groupe dans la simulation mentale.

**Sortie** : sur 10 graines et 60 jours, des pixels meurent de prédateurs (au moins 1 par partie en moyenne) et tuent au moins 3 fois plus de prédateurs qu'au J7 ; un rôle de garde apparaît ; les décisions de sécurité prennent au moins 1 % du temps des pixels (0,004 % au J7), sans extinction.

Réalisé :
- **Sortie** : sur 10 graines et 60 jours, 1,9 pixel tué par un prédateur par partie (0,1 au J7), 63,2 prédateurs tués par partie (4,4 au J7), 5 à 11 gardes au plus fort sur chaque graine, 9,0 % des décisions pour la sécurité, 45 à 106 individus au jour 60, aucune extinction ; test automatique sur ces 10 graines. `npm run bench` (500 fondateurs, 100 jours) : 1,04 ms par cycle en moyenne, 1,63 ms le pire jour, toujours sous les 6,25 ms de ×16.
- **Ajouts** : tanières et meutes qui encerclent, rentrent guérir et abandonnent tard ; abris isolés forcés ; blessures lentes à guérir ; carcasse et peau ; jauge de peur et objectif Se cacher ; compétence de combat apprise ; bouclier et armure de peau ; rôle de garde (veille de nuit, équipement de jour, chasse aux tanières) ; combat de groupe dans la simulation mentale ; filtre « danger » de la chronique (décision 0021, détail dans [16](16-guerre-et-forteresses.md)).
- **Reporté** : PV des abris et palissades (J12), ralentissement des blessés graves, viande à cuire (J9), métier de soldat payé (J10), escorte (J11).

### J9 — Agriculture et cuisine (`v0.10.0`)

- Blé sauvage et graines, découverte de « semer » par l'essai aidée par l'observation de graines qui germent, parcelles, arrosage (jarre), stades de croissance, récolte, montée en graine, réserve de semences.
- Feu de camp, meule, pressoir ; farine, huile ; plats dont la nutrition vaut 1,3 × leurs ingrédients ; plaisir des repas ; péremption par lots.

**Sortie** : sur la majorité des graines, une colonie découvre l'agriculture avant le jour 60 ; au jour 100, plus de la moitié de sa nourriture vient de ses cultures et au moins un plat est mangé chaque jour ; une colonie qui cultive avant le jour 30 dépasse 300 individus avant le jour 100 (précisé par la décision 0022 : « une colonie ordinaire » laissait de côté celles qui découvrent l'agriculture tard).

Réalisé :
- **Sortie**, sur 10 graines et 100 jours :
  - l'agriculture est découverte avant le jour 60 dans 7 colonies (jours 9 à 51), au jour 69 dans une et jamais dans deux ;
  - aux jours 91 à 100, plus de la moitié de la nourriture mangée vient des cultures dans 7 colonies (73 à 93 %), et un plat est mangé chaque jour dans les mêmes 7 ;
  - les 5 colonies qui cultivent avant le jour 30 culminent entre 302 et 408 individus (271 à 397 au jour 100) ;
  - les autres restent sous 260 ;
  - l'harmonie progresse toujours sur les graines 1 à 3 ;
  - test automatique sur les graines 1, 5 et 10.
- **Ajouts** :
  - blé sauvage, graines, indice « les graines font des plantes » ;
  - recette « semer », parcelles et croissance arrosée ;
  - travaux des champs au tableau noir (récolter, arroser, semer, tracer, glaner) ;
  - farine, feu de camp, pain, tarte aux baies et viande grillée ;
  - cuisiniers et recherche de l'usage d'un bien ;
  - plaisir des plats ;
  - réserve en portions ;
  - abris de 4 lits et projets d'abri simultanés ;
  - croissance bornée par les champs et la réserve ;
  - famine relative à la taille de la colonie ;
  - masques de recettes par ingrédient (plus de 30 biens) ;
  - détail dans [13](13-agriculture-cuisine.md) et la décision 0022.
- **Reporté** : jarre, meule, pressoir et huile, autres cultures, péremption, moral, ravageurs et clôtures, métier d'agriculteur (J10).

### J10 — Économie et métiers (`v0.11.0`)

- Arbre technologique rendu atteignable (four, fonderie, pioche de cuivre dans une partie ordinaire).
- Propriété et coffre personnel, troc, or et écus, marché de la colonie (offres, demandes, comptoir à coefficient), prix de référence.
- Métiers choisis par avantage comparatif (revenu attendu appris), inertie, apprentissage auprès du parent.

**Sortie** : au jour 100 d'une partie ordinaire, au moins 4 métiers coexistent ; la chaîne agriculteur → meunier ou boulanger → acheteur de pain est visible ; les prix de référence suivent la rareté.

Réalisé :
- **Sortie**, sur 10 graines et 100 jours :
  - au jour 100, 4 à 6 métiers choisis coexistent sur les 10 graines (agriculteur, meunier, boulanger, cueilleur, mineur, parfois bûcheron), plus les postes de garde, d'inventeur et de scribe ;
  - dans les 8 colonies qui cultivent avant le jour 30, la chaîne est dans les comptes du comptoir et dans la chronique : un agriculteur vend du blé, un meunier ou un boulanger en achète, la farine est vendue puis achetée par un boulanger, qui vend du pain, acheté par d'autres (« Premier achat de pain au comptoir, par l'individu #22 : il venait de l'individu #34 ») ;
  - dans ces 8 colonies, le blé coûte plus cher les jours où son stock est au plus bas (14,6 à 18,1 écus en moyenne sur le tiers des jours au stock le plus faible) que ceux où il abonde (9,5 à 12,4) ;
  - les 2 autres colonies, qui cultivent tard et restent petites (39 et 54 individus), ont 4 métiers sans meunier ni boulanger ;
  - test automatique sur les graines 1, 5 et 10, avec les parties du J9.
- **Arbre technologique**, sur les mêmes parties :
  - four, brique et fonderie découverts sur les 10 graines (four aux jours 16 à 49, fonderie aux jours 18 à 74) ;
  - lingot de cuivre sur 8 graines (jours 28 à 77) ;
  - pioche de cuivre sur 4 graines (jours 35 à 89), hache ou lance de cuivre sur 6 ;
  - le fer n'est jamais atteint en 100 jours.
- **J9 tenu** :
  - l'agriculture est découverte avant le jour 60 sur 9 graines (jours 12 à 44) ;
  - plus de la moitié de la nourriture vient des cultures et un plat est mangé chaque jour dans les 8 colonies qui cultivent tôt ;
  - 6 d'entre elles dépassent 300 individus (327 à 406), deux restent sous 300 (223 et 275) ;
  - l'harmonie progresse toujours et le génome dérive (test du J7).
- `npm run bench` (500 fondateurs, 100 jours) : 1,24 ms par cycle en moyenne, 2,26 ms le pire jour, sous les 6,25 ms de ×16.
- **Ajouts** :
  - comptoir de colonie (prix de base, prix de référence suivant la rareté, achat et vente, rations, caisse) ;
  - écus frappés à 200 par membre ;
  - héritage des écus ;
  - métiers choisis par le revenu appris, avec inertie et apprentissage auprès du parent ;
  - ventes libres des cueilleurs, bûcherons et mineurs ;
  - postes payés (garde, inventeur, scribe) ;
  - meuniers et boulangers qui achètent leurs ingrédients ;
  - objectif Inventer ;
  - carnet d'essais de la colonie ;
  - stations bâties au camp ;
  - idées des chercheurs ;
  - demandes au comptoir ;
  - inspecteur, bloc Colonie et chronique de l'économie (filtre « économie ») ;
  - détail dans [14](14-economie.md) et la décision 0023.
- **Reporté** : or et pierres précieuses (J12), coffre personnel et héritage des biens, troc et carnet d'offres et de demandes entre individus, prospérité dans l'harmonie, péremption, fer, courbes de prix au tableau de bord.

### J11 — Migration et colonies (`v0.12.0`)

- Objectif Migrer, projet d'expédition, provisions et copie de livres, fondation d'une colonie, filiation.
- Fiches de relation entre colonies, territoires, caravanes ; gel des blocs lointains ; tableau de bord par colonie, calque des territoires.

**Sortie** : sur la majorité des graines, au moins deux colonies au jour 150, la seconde fondée par une expédition ; au moins un échange entre colonies.

Réalisé :
- **Sortie**, sur 10 graines et 150 jours :
  - au moins deux colonies vivent au jour 150 sur 8 graines ;
  - chaque fois, la seconde a été fondée par une expédition de la première, entre les jours 49 et 126 ;
  - une troisième colonie existe sur 3 graines ;
  - au jour 150, les colonies filles comptent de 3 à 248 membres ;
  - dans les 8 cas, une première caravane relie la mère et la fille, le jour même de la fondation ou jusqu'à 25 jours après ;
  - les 2 autres graines : une colonie restée petite (48 membres), qui ne ressent jamais la foule, et un éclaireur qui ne trouve pas de site ;
  - test automatique sur les graines 1 et 6 (fondation, caravane, colonie fille de 16 membres).
- **Tenu** :
  - les sorties des J5 à J10 passent ;
  - la graine de démonstration du J3 change (27) ;
  - `npm run bench` (500 fondateurs, 100 jours) : 1,64 ms par cycle en moyenne, 2,09 ms le pire jour, sous les 6,25 ms de ×16.
- **Ajouts** :
  - objectifs Migrer et Commercer ;
  - éclaireur sur un anneau de 56 à 90 cases ;
  - expédition affichée au tableau noir, recrutement, provisions et copie de livre ;
  - fondation par le premier abri, filiation ;
  - recherche des matériaux inconnus par une jeune colonie ;
  - fiches de relation (parenté, camp, rencontres, caravanes, prix rapportés) ;
  - métier de marchand et caravanes entre comptoirs ;
  - bloc Colonie de l'individu sélectionné, liste des colonies ;
  - chronique de la migration ;
  - détail dans [15](15-colonies-et-migration.md) et la décision 0024.
- **Reporté** : gel des blocs lointains, calque des territoires, tableau de bord par colonie, autres raisons de partir, troc direct entre individus de colonies différentes.

### J12 — Trésors et forteresses (`v0.13.0`)

- Or et pierres précieuses, salle du trésor.
- Murs infranchissables, portes, tours ; navigation avec obstacles ; projet d'enceinte émergent quand le danger ou la valeur du trésor le justifie.

**Sortie** : sur la majorité des graines à 150 jours, une colonie bâtit une enceinte fermée autour de son trésor, que les prédateurs ne franchissent pas.

Réalisé :
- **Sortie**, sur 10 graines et 150 jours :
  - la première colonie bâtit sa salle du trésor, puis ferme son enceinte autour d'elle, sur les 10 graines, entre les jours 24 et 71 ;
  - les 10 enceintes ont leur tour ;
  - aucune intrusion de prédateur dans une enceinte fermée ;
  - test automatique sur les graines 2 et 3 : enceinte fermée autour du trésor, anneau entièrement infranchissable, prédateurs venus jusqu'au mur et restés dehors pendant 10 jours.
- **Tenu** :
  - au jour 150, 48 à 500 individus, comme au J11 sur les mêmes graines ;
  - au moins deux colonies sur 7 graines sur 10 (8 au J11) : la sortie du J11 tient ;
  - les sorties des J3 à J11 passent ; leurs graines de démonstration changent (J3 : 2 ; J6 : 6 et 1 ; J9 et J10 : 2, 4 et 14 ; J11 : 2 et 3), car l'or change les mondes ;
  - `npm run bench` (500 fondateurs, 100 jours) : 1,30 ms par cycle en moyenne, 1,80 ms le pire jour, sous les 6,25 ms de ×16.
- **Ajouts** :
  - or et pierres précieuses, salle du trésor, danger ressenti au camp ;
  - palissade, portes, tour ;
  - projet d'enceinte, chantier pan par pan ;
  - navigation par points de route autour des enceintes ;
  - veille du haut de la tour ;
  - bloc Colonie (trésor, enceinte), chronique de l'enceinte ;
  - corrections du glanage (décision 0025) ;
  - détail dans [16](16-guerre-et-forteresses.md) et la décision 0025.
- **Reporté** :
  - agrandir l'enceinte quand la colonie la déborde ;
  - murs de pierre et de brique, points de vie des murs ;
  - portes réservées aux membres ;
  - ordre spatial et zone de défense ;
  - fonte de l'or en écus.

### Mise à jour — Le village (`v0.14.0`)

Demandée entre le J12 et le J13 (décision 0026) :

- un abri est un cercle de murs avec une porte et une place par dormeur ;
- deux individus ne se superposent pas ;
- l'enceinte accueille toutes les habitations ;
- les individus modifient durablement leur environnement ;
- une baie récoltée ne repousse pas avant 3 jours ;
- on dort la nuit, et les gardes veillent du haut des tours ;
- il faut manger régulièrement pour rester en bonne santé.

Puis, à la demande (décision 0027) : des canaux d'irrigation qui amènent l'eau jusqu'aux maisons.

Réalisé :

- **Mesures**, sur 10 graines et 150 jours, canaux compris :
  - toutes les maisons de la première colonie sont dans son enceinte (23 à 29 maisons, 2 lits chacune), en rangées séparées par des allées ;
  - l'enceinte (30 à 44 cases de côté) se ferme sur 6 graines sur 10, entre les jours 52 et 116 ;
  - elle porte une tour à côté de chaque porte (deux tours sur deux de ces graines) ;
  - aucune intrusion de prédateur ;
  - jamais deux individus sur la même case (test sur 30 jours) ;
  - la première colonie creuse 5 à 10 canaux (47 à 79 cases), et ses filles en creusent aussi ;
  - 600 à 3 900 cases de sentier par partie ;
  - au moins deux colonies sur 6 graines sur 10 ;
  - population totale au jour 150 : 23 à 290 ;
  - morts de faim ou de soif : 5 à 99 par partie en 150 jours.
  - Avant les canaux, la même mesure donnait :
    - l'enceinte fermée sur 9 graines ;
    - au moins deux colonies sur 7 graines ;
    - 9 à 167 individus ;
    - 11 à 119 morts de faim ou de soif.
  - Une part de l'écart tient au hasard des parties, qui changent toutes avec la moindre règle nouvelle.
- **Tenu** :
  - les sorties des J2 à J12 passent ;
  - graines de démonstration : J3 3 ; J6 5 ; J9 et J10 1, 6 et 2 ; J11 2 et 4 ; J12 1 et 7.
- **Assoupli**, et dit dans les tests :
  - la sortie du J9 attend un plat sur 6 des 10 derniers jours (au lieu de chaque jour), et plus de la moitié de la nourriture venue des cultures sur 2 des 3 parties (« la majorité des graines ») au lieu des 3 ;
  - la plus grande des trois parties dépasse 100 individus (au lieu de 300).
  - Les nuits entières de sommeil, deux lits par maison et un village borné par son enceinte font plafonner chaque colonie vers 60 à 100 individus. La croissance passe désormais par l'essaimage.
- **Ajouts** :
  - maisons à murs, porte et lits ; plan du village ;
  - une case par individu : attendre, se croiser, s'écarter, contourner ;
  - sommeil la nuit ;
  - repas menés à terme, santé liée aux repas réguliers ;
  - baies à 3 jours, terre bâtie qui ne repousse plus, sentiers ;
  - grande enceinte, une tour par porte, champs hors les murs ;
  - canaux depuis l'eau jusqu'au camp et aux maisons, porte d'eau, irrigation des parcelles ;
  - essaimage plus tôt ;
  - détail dans [03](03-individu.md), [02](02-monde.md), [06](06-ia.md), [16](16-guerre-et-forteresses.md) et la décision 0026.
- **Reporté** :
  - agrandir une enceinte pleine ;
  - des maisons de tailles diverses ;
  - l'usure des sentiers abandonnés ;
  - les prédateurs qui occupent une case.

### Mise à jour — L'architecture (`v0.15.0`)

Demandée avant le J13 (décision 0028, [17](17-architecture.md)). Les individus sont des bâtisseurs qui transforment profondément la carte, pour que ce soit beau, par quatre ensembles de règles :

- plan de ville ;
- matériaux et édifices ;
- paysage aménagé ;
- grands travaux.

Et une composante Beauté dans l'harmonie.

Réalisé :

- **Mesures**, sur 10 graines et 150 jours :
  - la première colonie pave sa place et ses rues sur 9 graines (24 à 88 cases de pavé) ;
  - elle élève au moins un édifice public sur 8 graines (les quatre sur 3) ;
  - elle plante une allée d'arbres sur 6 graines (20 à 39 arbres) ;
  - elle rebâtit son enceinte en pierre sur 5 graines ;
  - elle rebâtit des maisons en pierre sur 8 graines ;
  - la beauté atteint 0,40 à 0,58 sur 7 graines. Les colonies en difficulté (famines) embellissent peu ou pas : elles vont d'abord à leurs réserves ;
  - l'enceinte se ferme sur 6 graines sur 10, et il y a au moins deux colonies sur 7 graines sur 10 ;
  - population totale au jour 150 : 15 à 237.
  - Avec et sans ouvrages, sur les mêmes 10 graines :
    - population totale au jour 150 : 1 030 et 1 074 ;
    - harmonie moyenne : 46 et 40.
- **Tenu** :
  - les sorties des J2 à J12 passent ;
  - graines de démonstration : J3 9 ; J6 9 ; J9 et J10 11, 4 et 2 ; J11 2 et 4 ; J12 1 et 7.
- **Assoupli** :
  - la sortie du J9 demande, sur 2 des 3 parties, que les cultures donnent plus de la moitié de la nourriture ou qu'un plat soit mangé 8 jours sur 10 (« ou » au lieu de « et ») ;
  - les deux à la fois ne tiennent plus que sur peu de graines : les bras partent aussi aux ouvrages.
- **Ajouts** :
  - moteur des ouvrages ;
  - place, rues, ponts et fontaine ;
  - temple, grenier, marché, monument ;
  - maisons et murs de pierre ;
  - vergers en rangées, allée d'arbres, arbres d'alignement ;
  - routes entre colonies, défrichage, assèchement, carrières ;
  - beauté dans l'harmonie et le tableau de bord ;
  - chronique des ouvrages.
- **Reporté** :
  - second anneau de murs ;
  - quartiers ;
  - styles propres aux colonies ;
  - entretien des bâtiments.

### Mise à jour — L'expansion et le commerce (`v0.16.0`)

Demandée à la place du J13 (décision 0029, [18](18-expansion-et-commerce.md)) : voir les colonies s'étendre et commercer plutôt que se faire la guerre. Six ensembles :

- correctifs (recettes au-delà de 32, objectif qui échoue sans cesse, places des colonies éteintes, famines des grandes colonies) ;
- la mer nourricière : pêche, ponton, fumoir, barque ;
- le savoir durable : tablettes, grande bibliothèque, maîtres et école ;
- sentiers, routes, relais et haltes des caravanes ;
- quartiers spécialisés ;
- navires et îles.

Réalisé :

- **Mesures**, sur les graines 1 à 100 et 150 jours, face à la v0.15 :
  - parties éteintes : 1 (9 avant) ; parties sous 10 individus : 2 (13) ;
  - morts de faim ou de soif : 12 % des morts (41 %), 990 au lieu de 4 173 ;
  - harmonie médiane de la colonie mère : 63 (49) ; savoir 0,94 (0) ; beauté 0,43 (0,35) ;
  - un livre ou une tablette est écrit dans 92 parties (53) ; une leçon est donnée dans 99 ;
  - un navire est bâti dans 75 parties, une colonie est fondée outre-mer dans 43 (74 colonies) ; 11 parties ont un relais ;
  - population au jour 150 : médiane 47,5 (49,5), moyenne 69,4 (69,4) ; 28 parties passent 100 (28). Les colonies vivent plus longtemps (plus de morts de vieillesse) mais ne grandissent pas plus vite.
  - Ouvrages nouveaux, plus rares parce qu'ils viennent après les autres : ponton dans 7 parties, sentiers pavés dans 18, grande bibliothèque dans 1.
- **Coût** : 197 ms par jour simulé en médiane sur ces parties (143 en v0.15). `npm run bench` : 1,62 ms par cycle en moyenne, 2,34 ms le pire jour, pour 200 à 315 individus (6,25 ms permis à ×16).
- **Tenu** :
  - les sorties des J2 à J12 passent ;
  - graines de démonstration : J3 4 ; J6 5 ; J9 et J10 22, 34 et 1 ; J11 12 et 15 ; J12 6 et 11.
- **Assoupli** :
  - le J4 compte la barque comme un outil ;
  - la nuit : plus de 70 % des membres dorment à minuit sur 5 parties (« presque tous » sur une partie avant). Ceux qui rentrent tard de la pêche attendent aux portes des maisons, qui n'ont qu'une case.
- **Ajouts** : voir [18](18-expansion-et-commerce.md) et la décision 0029.
- **Reporté** :
  - la péremption des vivres ;
  - le navire porté et le chantier naval ;
  - les marchés de carrefour ;
  - l'encombrement des portes des maisons au coucher ;
  - le gel des blocs lointains, pour relever le plafond de 500 individus.

### Mise à jour — Le grand essor (`v0.17.0`)

Demandée après la v0.16 (décision 0030, [19](19-grand-essor.md)) : des populations de l'ordre de 10 000 individus, fluides à ×16, et des éclaireurs qui fondent au loin des villes spécialisées. L'utilisateur accepte de limiter les fonctions de la plupart des pixels : le **peuple** suit une routine de ville, les **figures** gardent l'IA complète.

Réalisé :

- plafonds relevés : 16 384 entités, 16 000 individus, 160 colonies vivantes ;
- figures et peuple, savoir-faire de la ville, budget de réflexion étalé ;
- index spatial à la place des boucles en carré ; positions des individus en tableaux transférés et dessinées d'un seul objet ;
- carte de la ville (chemins, eau, sources) ; la foule qui se traverse ;
- maisons longues et maisons de ville, faubourgs, placettes, puits, un lit par membre, la maison qui se remplit par le fond ;
- naissances du foyer ;
- vocations des villes, éclaireurs lointains, expéditions plus sûres ;
- inspecteur : rang et tâche d'un membre du peuple ; panneau de colonie : vocation, figures et peuple, les plus grandes villes d'abord.

MESURES

### J13 — Conflits (reporté)

Reporté à la demande (décision 0029) : l'expansion et le commerce passent d'abord. Le contenu prévu reste valable.

- Incidents et rancunes, raids décidés par simulation mentale (butin, chances, pertes), alerte et défense, bonus des murs, butin, paix, absorption.

**Sortie** : sur un ensemble de graines à 200 jours, au moins un raid a lieu et au moins un échoue contre une enceinte, tandis que des colonies voisines restent en paix et commercent ; une partie de 100 jours avec 500 individus reste fluide à ×16.

## Après la v1 (pistes)

Saisons, livres de conseils (évolution culturelle), son, sauvegarde et partage de parties.
