# 15 — Migration et colonies multiples

> Chantier préparé après le J7 (décision 0020), implémenté en partie au J11 (décision 0024) : voir « Ce que fait le J11 » à la fin, qui prime sur les valeurs de départ 🟡 des sections précédentes.

Aujourd'hui une seule colonie naît du premier pixel et ne se divise jamais (l'exploration est tenue en laisse à 40 cases du camp). Des pixels doivent pouvoir **partir fonder leur propre colonie**, qui vivra ensuite sa vie : son camp, son tableau noir, sa bibliothèque, ses métiers, ses relations avec les autres.

## Pourquoi partir

Un individu envisage l'**objectif Migrer** (niveau Harmonie) quand sa colonie lui paraît saturée, d'après ce qu'il en croit :

- pas de lit libre depuis longtemps, réserve de nourriture sous la cible, longs trajets vers les ressources (l'expérience apprise du coût des biens monte) ;
- harmonie basse ou point faible persistant ;
- danger appris autour du camp ([16](16-guerre-et-forteresses.md)) ;
- ses gènes : curiosité haute et sociabilité basse poussent au départ.

Il faut aussi un **lieu en vue** : un endroit remémoré (ou lu sur une carte) avec eau, nourriture et matériaux, à au moins 🟡 80 cases du camp, hors du territoire d'une autre colonie.

## Partir à plusieurs

- Le candidat inscrit au tableau noir un **projet d'expédition** (le lieu, le nombre de places 🟡 3 à 8). Les membres qui le lisent et partagent son jugement (même calcul, avec leurs propres croyances et gènes) s'inscrivent ; les liens d'affinité (fiches sociales du J5) comptent.
- L'expédition emporte des **provisions** (nourriture, matériaux d'un premier abri, outils) prélevées dans la réserve ou achetées ([14](14-economie.md)), et si possible une **copie de livre** : c'est ainsi que le savoir voyage.
- Le voyage est une marche groupée vers le lieu ; le groupe dort ensemble, se défend ensemble.

## Fonder

- Au lieu choisi, le premier abri bâti crée une **nouvelle colonie** (nouvel identifiant, camp, réserve, tableau noir vide, projets). Les migrants changent de colonie : leurs souvenirs, recettes et fiches restent les leurs.
- La nouvelle colonie a son propre point faible, son harmonie, ses projets ; sa bibliothèque se construit à partir des livres apportés.
- **Filiation** : chaque colonie retient sa colonie mère. Les liens de parenté pèsent sur les relations (voir plus bas).

## Les relations entre colonies

- Chaque colonie tient, pour chaque autre colonie qu'elle connaît, une **fiche de relation** (comme les fiches sociales, à l'échelle de la colonie, tenue au tableau noir) : rencontres, échanges, incidents (vol, mort d'un membre, passage armé sur le territoire), parenté.
- **Territoire** : le carré de l'harmonie (24 cases autour du camp) devient la zone revendiquée. Deux territoires qui se touchent créent des occasions de commerce et de conflit.
- **Commerce** : une **caravane** (un ou deux marchands) porte des biens d'un marché à l'autre quand l'écart de prix de référence le justifie ([14](14-economie.md)).
- **Conflit** : voir [16-guerre-et-forteresses](16-guerre-et-forteresses.md).

## Effets techniques

- Plusieurs colonies multiplient les camps à suivre : le gel des blocs lointains (déjà prévu dans [02-monde](02-monde.md)) devient indispensable. Les blocs autour de chaque camp restent actifs.
- Le tableau de bord montre une ligne par colonie (population, harmonie) et une carte des territoires (calque « territoires »).
- Couleurs : les individus restent noirs (pilier de lisibilité) ; le calque des territoires colore le sol, pas les pixels.

## Données à créer

- `data/balance.json` → `migration` : seuils de saturation, distance minimale, taille d'une expédition, provisions, durée maximale du voyage.

## Critère de sortie proposé (J11)

Sur la majorité des graines, au moins deux colonies existent au jour 150, la seconde fondée par une expédition partie de la première ; au moins un échange entre colonies (caravane ou troc) est observé ; la filiation et les relations sont visibles dans l'inspecteur.

## Ce que fait le J11

Implémenté au J11 (décision 0024). Là où il s'écarte des sections précédentes, c'est ce qui suit qui vaut.

**Pourquoi partir** : la seule raison retenue est la foule, telle que lue au tableau noir.

- La pression vaut (membres − 100) / 150, bornée à [0, 1], × (1 + 0,5 × (curiosité − sociabilité)).
  - Depuis le village (décision 0026), elle vaut (membres − 30) / 40.
  - Un village enclos loge une centaine d'individus, et deux lits par maison et des nuits entières de sommeil font plafonner la population plus bas. Une colonie essaime donc plus tôt.
- Saturation des lits, de la réserve, harmonie et danger ne comptent pas encore.

**Trouver un site** : un **éclaireur** à la fois, au camp, dont la pression dépasse 0,3.

- Il n'y en a qu'une fois que 15 jours sont passés depuis la dernière expédition.
- Il prend 6 portions de nourriture et part pour 20 jours au plus.
- Il va de point en point d'un anneau de 56 à 90 cases autour du camp, au-delà de la laisse d'exploration, et dort où il se trouve.
- Un site convient quand il voit de l'eau, que de la nourriture est vue ou remémorée à 10 cases, et qu'aucun camp connu n'est à moins de 56 cases.
- Les matériaux ne sont pas exigés : le chef apporte ceux du premier abri, et la jeune colonie cherche le reste.

**Partir à plusieurs** :

- L'éclaireur devient le chef de l'expédition. Il rentre l'annoncer au tableau noir, et c'est seulement là que le recrutement commence.
- Pendant 2 jours, les membres au camp dont la pression dépasse 0,2 s'inscrivent (8 au plus). Ils apprennent où est l'eau du site et quittent leurs postes, tâches et travaux.
- À 4 membres au moins, l'expédition part ; à moins, elle est abandonnée au bout de 4 jours.
- **Provisions** :
  - 6 portions de nourriture par membre, prises à la réserve ;
  - les matériaux d'un abri pour le chef ;
  - une copie du livre le plus riche de la bibliothèque, si la réserve a le papier et l'encre d'un livre : le savoir voyage.
- En route, chacun marche vers le site, mange ce qu'il porte et dort où il est. L'expédition est abandonnée après 8 jours de voyage.

**Fonder** :

- Sur le site, qui sait bâtir un abri le bâtit avec ce qu'il porte, ou récolte sur place ce qui manque.
- Cet abri, à 10 cases du site au plus, crée la nouvelle colonie : identifiant, camp, comptoir aux prix de base, colonie mère, jour de fondation.
- Les membres de l'expédition y passent avec leur savoir et leurs écus. Les écus de la nouvelle colonie sont frappés dès le lendemain.
- Un projet qui attend depuis 2 jours laisse un membre partir chercher un matériau dont il ne connaît pas de gisement (score × 0,4) : c'est ainsi que la fille trouve sa pierre.

**Relations** (fiches au tableau noir de chaque colonie, jusqu'à 16 colonies) :

- **Contenu** : colonie connue ou non, son camp, la parenté, les rencontres de membres qui se parlent, les caravanes, et les prix de son comptoir avec leur date.
- **À la fondation** : la mère et la fille se connaissent et sont parentes. La fille connaît les prix de la mère ; la mère sait qu'un comptoir neuf ouvre aux prix de base.

**Caravanes** (métier **marchand**, objectif **Commercer**, efficacité, 0,6, pesé par la curiosité) :

- On peut être marchand quand sa colonie connaît une autre colonie et ses prix. Le revenu attendu est la meilleure marge (prix d'achat de l'autre comptoir − prix de vente du sien) × la charge × 480 / (2 × distance × 3 + 300).
- **Un voyage** :
  - acheter une charge au comptoir de sa colonie ;
  - marcher jusqu'à l'autre camp (au-delà de la laisse) et y vendre ;
  - y acheter ce que son comptoir paie mieux ;
  - rentrer, vendre, et afficher les prix vus.
- Deux caravanes au plus sur une même route.
- La colonie visitée apprend le camp de la colonie du marchand.
- Le commerce ne fait pas encore de troc direct entre individus : il passe par les comptoirs.

**Interface** :

- Le bloc Colonie montre la colonie de l'individu sélectionné (la première sinon), avec :
  - la liste des colonies et leurs membres ;
  - la filiation (fille de, jour de fondation) ;
  - l'expédition (site trouvé, recrutement, en route) ou l'éclaireur ;
  - une ligne par colonie connue (parenté, camp, rencontres, caravanes).
- L'inspecteur nomme la colonie de l'individu et sa caravane.
- La chronique annonce l'expédition, la fondation et la première caravane de chaque route.

**Mesures** (10 graines, 150 jours) : voir la feuille de route ([11](11-feuille-de-route.md), J11).

**Reporté** : gel des blocs lointains, calque des territoires, tableau de bord par colonie, incidents et rancunes (J13), troc direct entre individus, groupe soudé en voyage, autres raisons de partir (lits, harmonie, danger).

## Expansion (décision 0029)

- Seules les colonies vivantes comptent dans la limite (24) ; une colonie éteinte libère sa place.
- **Relais** : un site à 2 cases d'une route pavée n'a besoin que de 24 cases d'écart avec les autres camps (56 sinon).
- **Navire** : une colonie d'au moins 40 membres qui va bien bâtit un navire sur sa berge. Tant qu'il est à quai, son éclaireur, son expédition et ses caravanes avancent sur l'eau. Une colonie fondée au-delà de l'eau est d'outre-mer.
- Les routes pavées relient aussi les colonies qui ont commercé.
- Détail dans [18](18-expansion-et-commerce.md).

## Éclaireurs lointains et vocations (décision 0030)

L'éclaireur part désormais loin (70 à 180 cases, par étapes de 40 à 90) chercher un site pour la **vocation** dont les biens manquent le plus au comptoir de sa colonie : ville agricole, ville de la pierre, port de pêche, ville forestière. Il juge un site sur une vue de 16 cases et doit savoir bâtir un abri. Jusqu'à 160 colonies vivent à la fois. Voir [19](19-grand-essor.md).
