# 13 — Agriculture et cuisine

> Chantier préparé après le J7 (décision 0020), implémenté en partie au J9 (décision 0022) : voir « Ce que fait le J9 » à la fin, qui prime sur les valeurs de départ 🟡 des sections précédentes.

Les pixels doivent **découvrir** l'agriculture, pas la recevoir. Puis la cuisine leur donne une raison d'échanger : un plat nourrit plus que ses ingrédients, et le cuisinier n'est pas forcément l'agriculteur ([14-economie](14-economie.md)).

## D'où l'on part (J7)

- Les **champs** du J7 ([07-harmonie](07-harmonie.md)) replantent une ressource sauvage (des buissons de baies, du bois) près du camp. C'est de la cueillette organisée, sans semence, sans soin, sans récolte différée : c'est le précurseur de l'agriculture, pas l'agriculture.
- La découverte se fait par l'essai ([04-fabrication](04-fabrication.md)), et l'inventeur de la colonie essaie librement ([06-ia](06-ia.md)).
- La nourriture est le facteur limitant de la population (60 à 125 individus au jour 100).

## Inspiration : Ferme Familiale

Le dépôt [Aluzy/family_farm](https://github.com/Aluzy/family_farm) (`docs/conception.md`) apporte des règles simples et éprouvées, que l'on transpose à des pixels autonomes :

| Ferme Familiale | Pixel Civilisation |
| --- | --- |
| Une plante gagne **un stade par jour si elle a été arrosée**, sinon elle stagne | Même règle : un plant sur une parcelle gagne un stade chaque jour où il a reçu de l'eau |
| Rendement fixe par culture, graines rendues à la récolte (`seeds: [1, 2]`, ou « 1 patate = 1 plant ») | Même modèle de données dans `data/crops.json` |
| Chaînes de transformation : blé → Moulin → farine, tournesol → Presse → huile | Stations découvertes par l'essai : meule, pressoir |
| Énergie d'un plat = 1,3 × somme de ses ingrédients | Nutrition d'un plat = 1,3 × somme, arrondie (valeur entière) |
| Plats et bonheur : le Four rend plus que la Cuisine, l'huile et les fruits ajoutent un bonus | Un repas cuisiné apaise aussi la curiosité et le moral (« plaisir ») selon la même grille |
| Péremption par lots, retrait du plus ancien d'abord | Les aliments frais périment ; les plats et les conserves se gardent plus longtemps |
| Toutes les valeurs du jeu sont entières | Même règle pour les quantités et les prix |

## Découvrir l'agriculture

1. **Blé sauvage** : nouvelle ressource renouvelable (or pâle), en plaine, non comestible crue. La récolter rend parfois une **graine** (bien portable, 1 chance sur 3 🟡).
2. **Les graines poussent seules** : une graine tombée par terre (inventaire plein, mort d'un porteur) a une petite chance de germer en blé sauvage sur place. Un individu qui revoit, à l'endroit où il avait laissé une graine, du blé sauvage, retient un **indice** (mémoire de type `observation`).
3. **L'essai qui découvre** : « graine + eau sur terre nue, mains nues » est une combinaison d'essai comme une autre. Elle donne la recette **semer**, qui pose une **parcelle** (construction couleur terre labourée) portant un plant au stade 0. L'indice du point 2 donne un fort bonus de curiosité à cette combinaison : c'est ainsi que les pixels « comprennent » que les graines font des plantes.
4. **L'eau se porte** : l'eau n'est pas un bien portable aujourd'hui. Elle le devient avec la **jarre** (argile cuite au four, ou au feu de camp en version simple) : une jarre pleine = 10 unités d'eau 🟡. Avant la jarre, seules les parcelles à 1 case de l'eau peuvent être arrosées (l'individu arrose depuis la berge).

## Cultiver

| Culture 🟡 | Biome | Stades (jours arrosés) | Eau / jour | Rendement | Graines rendues | Nutrition crue | Usage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Blé | plaine | 7 | 2 | 8 | 1 blé = 1 graine | — | farine, nourriture des bêtes |
| Légumes (racines) | plaine, forêt | 5 | 3 | 8 | 1 à 2 | 12 | crus ou en plat |
| Baies cultivées | forêt | 4 | 2 | 10 | 2 à 3 | 12 | crues, tartes |
| Lin | marais | 6 | 3 | 6 | 1 à 2 | — | fibre (tissu, corde) |
| Tournesol | plaine | 7 | 2 | 9 graines | 1 graine = 1 plant | — | huile au pressoir |

- **Une parcelle** = 1 pixel, 1 plant. Elle s'arrose (action), se récolte quand le plant est mûr (action), puis redevient nue. Un plant non arrosé stagne ; non arrosé 3 jours de suite, il meurt 🟡.
- **Monter en graine** (comme la carotte de Ferme Familiale) : un plant mûr non récolté pendant 2 jours rend des graines au lieu de nourriture. C'est une façon émergente de multiplier les semences.
- **Ravageurs** : les prédateurs piétinent les parcelles qu'ils traversent (le plant perd un stade). Une clôture (bois) les arrête : premier lien entre agriculture et défense.
- **Saisons** : hors chantier (déjà « après la v1 »). On garde un monde sans saisons, comme Ferme Familiale depuis sa version 1.6.

## Transformer et cuisiner

| Station 🟡 | Construite avec | Recettes |
| --- | --- | --- |
| Feu de camp | 3 bois + 3 pierres, mains nues | viande grillée, légumes grillés, jarre crue cuite (version simple) |
| Meule | 4 pierres + 2 bois | blé ×3 → farine |
| Pressoir | 4 bois + 2 pierres | tournesol ×3 → huile |
| Four (J7) | 5 argiles + 5 pierres + 2 charbons | pain (farine ×2), tarte (farine + baies), gratin (légumes + huile), jarre |

- **Nutrition d'un plat** = 1,3 × somme de la nutrition de ses ingrédients (la farine et l'huile comptent pour la valeur de ce qu'elles ont coûté), arrondie. Un pain (2 farines = 6 blés) nourrit plus que 6 baies : la transformation crée de la valeur, c'est la base de l'économie.
- **Plaisir** : manger un plat apaise aussi le besoin de curiosité et donne un bonus de moral (barème de Ferme Familiale : four +5, feu de camp +3, huile ou fruit +2). Le moral entre dans le bien-être de l'harmonie.
- **Péremption** 🟡 : légumes et baies 4 jours, viande 2 jours, pain 6 jours, plats 5 jours, farine, blé et graines ne périment pas. Les stocks de la réserve sont gérés par lots, le plus ancien sort en premier.
- **Gibier** : un prédateur tué laisse de la viande (lien avec [16-guerre-et-forteresses](16-guerre-et-forteresses.md)).

## Ce que l'IA doit savoir faire

- **Objectif Cultiver** (niveau Efficacité) : semer quand on a des graines et une parcelle libre près du camp, arroser les plants qui en ont besoin (croyance : « je l'ai arrosé aujourd'hui »), récolter les plants mûrs.
- **Projets de colonie** : « parcelles » (préparer N parcelles près du camp), « arrosage du jour » (tâches d'arrosage réservées comme les autres tâches), « réserve de semences » (ne pas tout manger : une part des graines est réservée, comme la réserve de semences de Ferme Familiale).
- **Planification** : le GOAP apprend les chaînes blé → farine → pain comme les chaînes d'outils (recettes connues, ingrédients fabriqués).
- **Croyances** : un individu ne sait si un plant est mûr que s'il l'a vu ou si quelqu'un l'a inscrit au tableau noir.

## Données à créer

- `data/crops.json` : cultures (biomes, stades, eau, rendement, graines, nutrition), sur le modèle de `data/crops.ts` de Ferme Familiale.
- `data/resources.json` : blé sauvage ; `data/recipes.json` : semer, jarre, meule, pressoir, feu de camp, farine, huile, plats.
- `data/balance.json` → `agriculture` : chance de graine, durée de vie d'un plant sans eau, montée en graine, péremption, bonus de plaisir.

## Critère de sortie proposé (J9)

Sur la majorité des graines, une colonie découvre l'agriculture par l'essai avant le jour 60, et au jour 100 plus de la moitié de la nourriture qu'elle mange vient de ses cultures ; au moins un plat cuisiné est mangé chaque jour. La population d'une colonie ordinaire peut alors dépasser 300 individus (le critère des 500 du J7 devient atteignable dans une vraie partie).

## Ce que fait le J9

Implémenté au J9 (décision 0022). Là où il s'écarte des sections précédentes, c'est ce qui suit qui vaut.

**Une seule culture, le blé** (`data/crops.json`, `data/resources.json`) :

- Le blé sauvage pousse en plaine. On ne le broute pas sur place : une fois rapporté, le grain cru se mange mais nourrit peu (6).
- Chaque grain récolté donne une **graine** avec 30 % de chance.
- Légumes, baies cultivées, lin, tournesol, pressoir et huile sont reportés.

**Découverte** :

- La recette **« semer »** est « une graine seule, à mains nues ». Elle pose une parcelle, la graine déjà en terre.
- L'indice du point 2 est simplifié, faute d'objets posés au sol. Quand un individu trouve une graine dans du blé sauvage, il a 25 % de chances de comprendre que les graines font des plantes.
- Cet indice donne un fort bonus d'essai (+3) à « la graine seule, à mains nues ». L'individu le vérifie quand il est curieux, à la place d'explorer.
- L'inventeur, qui essaie librement, sait aussi qu'une graine se trouve en récoltant du blé (de même, une peau en dépeçant une carcasse).
- Sur 10 graines, l'agriculture est découverte entre les jours 9 et 51 dans 7 colonies, au jour 69 dans une, jamais dans deux.

**Parcelles** (`src/sim/farming/`, système `farm` après le système monde) :

- Un plant gagne un stade chaque jour où il a été arrosé la veille.
- Il mûrit en 3 stades et pose alors 40 grains sur la parcelle, récoltés comme une ressource. La parcelle redevient nue à la dernière unité.
- Un plant sans eau 3 jours de suite meurt.
- Un blé mûr laissé 2 jours tombe et se ressème de lui-même (au lieu de « monter en graine »).
- Il n'y a pas encore de jarre. Une parcelle doit avoir de l'eau à 4 cases au plus, et l'eau portée arrose aussi les parcelles voisines (1 case autour) : un champ groupé s'arrose rang par rang.
- Les ravageurs et les clôtures sont reportés.

**Travail aux champs** (objectif **Cultiver**, 0,65) :

- Les parcelles sont au tableau noir. Un membre qui sait semer prend un travail à la fois au camp, ou aux champs s'il a lu le tableau le jour même.
- Ordre de priorité :
  - récolter un blé mûr ;
  - arroser ;
  - semer une parcelle nue avec une graine de la réserve ;
  - tracer une nouvelle parcelle, tant que la colonie en a moins de 1,5 par membre, à partir de 8 membres. L'emplacement est choisi près de l'eau et des autres parcelles, à 20 cases du camp au plus.
- Sans graine, le membre glane du blé sauvage pour ses graines.
- Glaner (corrigé au J12, décision 0025) :
  - trois membres au plus glanent à la fois, les autres continuent de nourrir la colonie ;
  - un glaneur qui tient une graine la sème aussitôt, sans attendre une pleine charge de blé (le blé sauvage est parfois trop rare pour la faire) ;
  - un membre qui a oublié comment semer rend son travail agricole : il le gardait pour toujours, sans plus jamais le faire.
- Grain et graines vont à la réserve. Ne pas tout manger se fait seul : les graines ne se mangent pas.

**Cuisine** :

- Recettes (nutrition d'un plat = arrondi de 1,3 × la valeur de ses ingrédients) :

  | Recette | Où | Ingrédients | Nutrition |
  | --- | --- | --- | --- |
  | Farine | à la main | 3 grains | (valeur 18) |
  | Pain | feu de camp | 2 farines | 47 |
  | Tarte aux baies | feu de camp | 1 farine + 2 baies | 55 |
  | Viande grillée | feu de camp | 1 carcasse | 39 |

- Pas de meule ni de four pour l'instant. Le feu de camp coûte 3 bois et 3 pierres, à mains nues.
- **Cuisiniers** : un poste pour 10 membres, à partir de 12 membres, tenu par un membre qui n'est ni scribe, ni inventeur, ni garde. Objectif **Cuisiner**, 0,62.
- Le cuisinier prend à la réserve les ingrédients de 5 tournées. Il ramasse dehors ce qui ne vient pas de la réserve, puis cuisine et range le résultat. Il choisit la recette qui ajoute le plus de valeur nourrissante.
- **Recherche en cuisine** :
  - Une nourriture ou une production en réserve dont il ne connaît aucun usage (le grain avant la farine, la farine avant le pain, les baies avant la tarte) l'occupe. Il essaie d'abord cet ingrédient seul, puis avec un autre, et ainsi de suite.
  - Il commence par une station dont il ne connaît encore aucun usage (bonus d'essai +0,8).
  - Il cherche aussi de nouvelles stations 4 fois sur 10.
  - Les aliments ne sont jamais jetés dans les autres essais.
- **Plaisir** : un plat apaise la curiosité de 4 × son plaisir (pain et viande 3, tarte 5). Le moral et le bien-être de l'harmonie sont reportés.
- La **péremption** par lots est reportée au marché du J10.

**Ce qui change autour** :

- La réserve se compte en **portions** de n'importe quelle nourriture (12 de nutrition) : un pain vaut 4 portions.
- Une réplication coûte 6 portions de n'importe quelle nourriture (la moins nourrissante d'abord) et 3 fibres.
- Un abri a 4 lits. Une colonie ouvre plusieurs projets d'abri à la fois (1 + 1 par 30 membres).
- À partir de 40 membres, il n'y a pas de naissance tant que la colonie a moins d'une parcelle pour deux membres. Une réserve qui baisse depuis trois jours retient aussi les naissances, sauf s'il reste 12 portions par membre.
- La famine qui annule la stabilité de l'harmonie demande plus de 2 % des membres morts de faim ou de soif en 3 jours ([07](07-harmonie.md)).

**Mesures** (10 graines, 100 jours) : voir la feuille de route ([11](11-feuille-de-route.md), J9).


**Au J10** ([14](14-economie.md), décision 0023) : dans une colonie de 12 membres et plus, les fournées sont le métier des meuniers et des boulangers, qui achètent leurs ingrédients au comptoir et cuisinent ce qui rapporte. Les postes de cuisine ne servent plus qu'à chercher ce qui se cuisine. Le grain et les plats sont vendus au comptoir, et achetés par ceux qui ont faim.

## Champs hors les murs (décision 0026)

Une fois l'enceinte décidée, aucune parcelle nouvelle ne se fait à l'intérieur : la place est gardée pour les maisons.

- Les parcelles se font hors les murs, à 20 cases au plus de l'enceinte (au lieu de 20 cases du camp). Le garde-champ (« dans les champs ») se compte de la même façon.
- Une parcelle restée dans les murs cède la place à une maison quand le plan du village en a besoin.

## Vergers en rangées (décision 0028)

- Un champ de baies se plante sur une rangée sur deux à partir du camp : trois buissons côte à côte, une rangée vide entre deux.
- Défrichage : le bois coupé jusqu'au dernier en forêt, à portée des champs, laisse une plaine où l'on peut cultiver ([17](17-architecture.md)).

## Irrigation (décision 0027)

- Une parcelle à côté d'un canal (8 voisins) est arrosée d'elle-même chaque jour, à l'aube. Personne n'a à porter l'eau, et le travail d'arroser ne lui est plus proposé.
- Une case à 4 cases d'un canal peut devenir une parcelle, comme près d'un lac. Les canaux ouvrent donc des champs loin des rives.
