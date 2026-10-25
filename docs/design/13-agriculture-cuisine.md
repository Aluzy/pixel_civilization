# 13 — Agriculture et cuisine

> Chantier préparé après le J7 (décision 0020). Rien n'est encore implémenté. Les valeurs sont des **valeurs de départ 🟡**, à caler avec la simulation headless.

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
