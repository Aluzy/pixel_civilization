# 04 — Fabrication par la couleur

Fabriquer consiste à combiner des pixels-ressources sur un pixel de transformation (une **station**). Les recettes suivent des règles de couleur cohérentes : elles sont devinables par l'IA comme par l'observateur.

## Stations

Une station est un pixel posé dans le monde. Un individu doit être adjacent à la station pour l'utiliser.

| Station | Couleur | Construite avec | Permet |
| --- | --- | --- | --- |
| Mains nues | — | — | Recettes les plus simples, sans station |
| Établi | Beige | 4 bois + 2 fibres | Outils simples, armes, cordes |
| Feu de camp | Jaune-orangé | 3 bois + 3 pierres | Cuisson, chaleur, sécurité nocturne |
| Four | Rouge brique | 5 argiles + 5 pierres + 2 charbons | Briques, poterie |
| Fonderie | Orange incandescent | 8 briques + 4 charbons | Lingots de cuivre et de fer |
| Scriptorium | Blanc cassé | 6 bois + 2 pierres + 2 argiles (J6) | Papier, encre, cartes, livres |

## Règles de recettes

- Une recette = une station + 1 à 3 types d'ingrédients avec quantités + une durée en cycles + un produit.
- La **couleur du produit** dérive de celle de ses ingrédients : moyenne pondérée par quantité dans l'espace HSL, puis arrondie vers la couleur la plus proche de la palette officielle. L'observateur peut ainsi deviner d'où vient un objet.
- Les recettes sont décrites dans `data/recipes.json`, jamais dans le code.

### Format de `data/recipes.json`

```json
{
  "recipes": [
    {
      "id": "stone_axe",
      "station": "workbench",
      "inputs": { "stone": 2, "wood": 1, "fiber": 1 },
      "durationTicks": 40,
      "output": { "item": "stone_axe", "count": 1 },
      "tags": ["tool", "efficiency"]
    }
  ]
}
```

## Arbre technologique de départ

1. Bois + fibre → **établi**.
2. Établi : pierre + bois + fibre → **hache de pierre** (récolte du bois ×2), **pioche de pierre** (pierre ×3, accès cuivre et charbon), **lance** (attaque ×2, accès gibier).
3. Pierre + bois → **feu de camp** ; au feu : gibier → **viande cuite** (nourrit 3 fois plus que des baies).
4. 10 bois + 5 fibres → **abri** (mur et toit ; défense +5 pendant le sommeil, fatigue récupérée 2 fois plus vite).
5. Argile + pierre + charbon → **four** ; au four : argile → **brique** → murs durables, **fonderie**.
6. Fonderie : cuivre + charbon → **lingot de cuivre** → outils et armes de cuivre (accès fer).
7. Au scriptorium : fibre → **papier** ; argile → **encre** ; papier + encre → **livre**, papier + encre + fibre → **carte** (J6).
8. Bâtiments composés (bibliothèque, entrepôt, champ cultivé) : plusieurs pixels posés selon un gabarit.

## Découverte par l'essai

Personne ne connaît les recettes au départ. Un individu dont le besoin « Savoir » est actif choisit une expérience :

1. **Candidats** : combinaisons de 1 à 3 types d'ingrédients qu'il possède, sur une station qu'il connaît et qui est proche.
2. **Exclusions** : combinaisons mémorisées comme échec (tant que le souvenir n'est pas oublié) et recettes déjà connues.
3. **Score de curiosité** de chaque candidat :
   - bonus si un ingrédient a été découvert récemment ;
   - bonus si la couleur moyenne des ingrédients est proche de celle d'une recette connue ;
   - bonus si le résultat potentiel répond à un besoin actif (deviné par la couleur) ;
   - malus selon le coût des ingrédients consommés.
4. L'essai consomme la **moitié** des ingrédients, arrondie au supérieur. Expérimenter a un coût réel.
5. Succès → la recette entre en mémoire à pleine force et produit l'objet. Échec → un souvenir d'échec est créé.

## État au jalon J4

Implémenté (`data/recipes.json`, `src/sim/crafting/`, `src/sim/agents/work.js`) :

- **Stations et constructions** : l'établi (station) et l'abri (construction) sont posés sur une couche dédiée des blocs (`structure`, un octet par case, codes 1 et 2), dessinés dans leur couleur et franchissables. Une construction se bâtit sur la case de l'individu, libre de toute ressource et de toute construction. L'individu choisit le site : une case libre à environ deux cases du camp (la construction la plus proche en vue, sinon l'eau la plus proche), si bien que l'eau, l'abri et l'établi finissent groupés.
- **Recettes** : établi (4 bois + 2 fibres, mains nues), abri (10 bois + 5 fibres + 3 pierres, mains nues), lance (2 bois + 1 fibre, établi), hache de pierre (2 pierres + 1 bois, établi), pioche de pierre (3 pierres + 1 bois + 1 fibre, établi). Deux recettes d'une même station n'ont jamais le même ensemble d'ingrédients : un essai désigne une recette sans ambiguïté. L'abri ne figure plus à 10 bois + 5 fibres : sans pierre, il aurait le même ensemble d'ingrédients que la lance sur une autre station et la découverte deviendrait triviale.
- **Objets** : un objet porté agit tant qu'il est dans l'inventaire. Lance : attaque ×2. Hache : bois récolté 2 fois plus vite. Pioche : pierre 3 fois plus vite, et seule elle permet de récolter le cuivre et le charbon (`tool` dans `data/resources.json`) ; le fer demande un outil de cuivre qui n'existe pas encore.
- **Essai** : un essai est une station (ou les mains nues) et un ensemble de 1 à 3 matériaux (ressources non comestibles). Il dure 20 cycles et met en jeu un échantillon d'une unité par ingrédient. S'il correspond à une recette, l'individu la comprend (force 1) et garde son échantillon, puis fabrique normalement ; sinon il perd l'échantillon et retient l'échec (5 jours). C'est un écart assumé avec « la moitié des ingrédients » : un essai ne connaît pas les quantités, il teste une combinaison (décision 0008).
- **Choix de l'essai** : parmi les matériaux portés ou dont l'individu connaît un lieu, sur les mains nues et les stations qu'il connaît, hors recettes connues et échecs retenus. Score = ressemblance avec la recette connue la plus proche du genre recherché (objet ou construction) + 0,3 × ressemblance cumulée avec toutes les recettes connues (« des matériaux qui ont déjà servi ») + bonus de la station où se font les choses de ce genre (à défaut, bonus de toute vraie station) + bonus d'ingrédient récent − coût par ingrédient − coût d'aller chercher ce qui manque − coût de marche jusqu'à la station + léger aléa. Le genre recherché vient du but : un abri est une construction ; l'individu a appris en découvrant l'établi que les constructions se font à mains nues. Il va ensuite chercher l'ingrédient manquant le plus proche (6 unités), puis essaie.
- **Ordre** : une station connue mais pas encore bâtie passe avant tout essai (elle ouvre de nouvelles combinaisons) ; quand plus rien n'est à essayer, l'individu explore plus loin pour trouver de nouveaux matériaux.
- **Pas encore** : couleur des produits dérivée des ingrédients, imitation (J5), feu de camp, four, fonderie, scriptorium.

Mesure : sur les graines 1 à 10, l'établi, la lance, un outil (presque toujours la pioche, découverte en même temps que l'abri par ressemblance) et l'abri sont réalisés en 2,4 à 4,7 jours ; 28 graines sur 30 (graines 11 à 40) avant le jour 5. Les deux échecs (16 et 17) sont des mondes où la pierre, à 9 cases du départ, n'entre jamais dans le champ de vision avant que l'individu ne parte vers une région qui n'en a pas.

## État au jalon J6

- **Nouvelles constructions** : scriptorium (station blanc cassé : 6 bois + 2 pierres + 2 argiles, mains nues) et bibliothèque (pixel brun, construction de type `library` : 6 pierres + 4 argiles + 4 fibres, mains nues). Écart : le scriptorium ne demande pas d'être à côté d'un établi, et ses ingrédients diffèrent du tableau ci-dessus. Avec 6 bois + 4 fibres (+ argile), l'individu seul le découvrait par hasard en cherchant son abri, puis perdait des jours à essayer ses outils sur deux stations ; le critère du J4 tombait à 2 graines sur 10.
- **Matériaux fabriqués** (objets de type `material`, utilisables dans les essais) : papier (3 fibres au scriptorium) et encre (2 argiles au scriptorium). Écart : ni eau ni charbon, l'eau n'étant pas un bien portable et le charbon exigeant une pioche que beaucoup de colonies n'ont pas.
- **Livre** (3 papiers + 1 encre, scriptorium) et **carte** (1 papier + 1 encre + 1 fibre, scriptorium).
- **Familles** : chaque recette a une famille, « structure » ou « item: » suivi du type d'objet (`item:weapon`, `item:tool`, `item:book`…). La ressemblance utilisée par le choix de l'essai compare aux recettes de la famille recherchée (avant, à tout objet) : chercher une arme ne s'inspire plus du papier.
- **Choix de l'essai, ajouts** : quand l'individu cherche une construction et sait où se font les constructions (aux mains nues), un essai ailleurs a un malus de 1,5 ; quand il cherche un livre ou une carte, chaque matériau fabriqué de l'ensemble vaut +1 (« l'écrit se fait avec des matériaux fabriqués ») et un ensemble de seules ressources vaut +0,8 sur une station où un matériau a déjà été fabriqué (« on y fera peut-être d'autres matériaux »). Seules les vraies stations accueillent des essais (pas l'abri ni la bibliothèque).
- **Ingrédients fabriqués** : le coût d'aller chercher un matériau fabriqué dont l'individu connaît la recette est 0,2 + 0,3 ; il le fabrique au lieu de le récolter.
- **On ne fabrique que ce qu'on croit savoir** : un bâtisseur qui découvre qu'il avait mal compris la recette (moitié des ingrédients perdue, échec retenu) rend sa tâche ; il ne peut plus bâtir avec une recette qu'il ne connaît plus. Avant ce correctif, il rebâtissait aussitôt avec la recette juste, sans l'avoir apprise.

## État au jalon J7

- **Arbre complet dans les données** : four (station, 5 argiles + 5 pierres + 2 charbons, mains nues), brique (2 argiles au four), fonderie (station, 8 briques + 4 charbons, mains nues), lingot de cuivre (2 cuivres + 1 charbon, fonderie), lingot de fer (2 fers + 1 charbon, fonderie), pioche de cuivre (2 lingots de cuivre + 1 bois, établi ; ouvre le fer), hache de cuivre (bois ×3), lance de cuivre (attaque ×3), hache de fer (bois ×4), lance de fer (attaque ×4).
- **Essai libre** : l'inventeur de la colonie ([06-ia](06-ia.md)) essaie sans genre recherché ; chaque matériau qu'aucune recette connue n'utilise vaut +1,5.
- **Constat** : sur 8 graines et 120 à 160 jours, le four n'a pas encore été découvert. Le charbon demande une pioche, sa position doit être connue (souvent oubliée, et le tableau noir n'est cru que 6 jours), et les combinaisons à essayer sont nombreuses (8 matériaux, 4 lieux). L'arbre est prêt ; sa découverte reste rare.
- **Pas encore** : un outil meilleur ne remplace pas l'outil exigé (une pioche de cuivre ne suffit pas pour le charbon sans la pioche de pierre), couleur des produits dérivée des ingrédients, feu de camp et cuisson.

## État au jalon J9

- **Recettes** ([13](13-agriculture-cuisine.md)) : semer (une graine, mains nues : une parcelle), feu de camp (3 bois + 3 pierres, mains nues), farine (3 grains, mains nues), pain (2 farines), viande grillée (1 carcasse), tarte aux baies (1 farine + 2 baies), au feu de camp. Le nombre de biens dépasse 30 : les masques désignent les **ingrédients** (bit par ingrédient) et non plus les biens.
- **Indice** : une graine trouvée dans du blé sauvage peut faire deviner qu'elle se sème (25 %) ; « ce bien seul, à mains nues » reçoit alors +3, et l'individu le vérifie quand il est curieux.
- **Sous-produits** : l'essai libre de l'inventeur sait qu'une graine vient du blé et une peau d'une carcasse (coût d'aller les chercher = celui de leur source ; il récolte la source, et laisse de côté le grain déjà porté).
- **Chercher l'usage d'un bien** (cuisiniers) : seules les combinaisons qui le contiennent sont essayées ; −1 par autre ingrédient (seul d'abord), sans bonus de nouveauté ; les aliments n'entrent que dans ces essais-là.
- **Station inconnue** : une station dont aucune recette connue ne se sert vaut +0,8 (ce qu'elle fait reste à trouver). Une station connue mais pas bâtie n'est plus bâtie « pour voir » quand l'individu cherche une construction (les constructions se font à mains nues).

## État au jalon J10

L'arbre du J7 devient atteignable (décision 0023, détail dans [14](14-economie.md)) :

- **Carnet d'essais de la colonie** : les échecs de ses chercheurs, transmis d'un inventeur au suivant, sans oubli.
- **Station de destination inconnue** : chaque matériau y est d'abord essayé seul.
- **Usage d'un matériau nouveau** : seul, puis avec un autre, puis avec deux (−3 par ingrédient en plus, au lieu de −1, pour les cuisiniers aussi).
- **Nouveauté** : en essai libre, +1,5 une seule fois pour une combinaison qui contient au moins un matériau nouveau (au lieu de +1,5 par matériau nouveau).
- **Idées** : fabriquer un matériau nouveau, bâtir une station inconnue ou y essayer un matériau seul donne une fois sur deux, à un chercheur, l'idée d'un usage dont il peut réunir les ingrédients (+3 à cet essai, oubliée après 3 jours).
- **Stations au camp** ; l'inventeur prend à la réserve les matériaux de la station qu'il sait faire et ceux de ses ingrédients.
- **Mesures** (10 graines, 100 jours) : voir [11](11-feuille-de-route.md), J10.

## Bâtir une maison (décision 0026)

L'abri n'est plus une case mais une **maison** : un anneau de murs d'abri, une porte et des lits ([03](03-individu.md), « Le village »).

- Recette : 8 bois + 4 fibres + 2 pierres, mains nues. L'ensemble d'ingrédients reste celui de l'abri, donc sa découverte ne change pas.
- La maison se bâtit d'un coup, à la fin de la fabrication.
  - Le bâtisseur se tient sur la case de la future porte.
  - Les murs s'élèvent autour de lui dans la première orientation qui tient (porte au sud, au nord, à l'est, à l'ouest).
  - Si rien ne tient (quelqu'un s'est mis sur un mur, une construction est apparue), il garde ses matériaux et cherche un autre site.
- Les murs et la porte d'abri n'ont pas de recette propre : ils sont des pièces de la maison (`wall`, `door` dans `data/recipes.json`).

## Imitation

Un individu qui voit un autre individu réaliser une recette (dans son rayon de perception, pendant toute la durée de fabrication) a 50 % de chances de l'apprendre, à force 0,6.
