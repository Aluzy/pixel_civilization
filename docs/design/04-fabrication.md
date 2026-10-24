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
| Scriptorium | Blanc cassé | 6 bois + 4 fibres, à côté d'un établi | Papier, encre, cartes, livres |

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
7. Fibre + eau → **papier** ; charbon + eau → **encre** ; au scriptorium : papier + encre → **carte** ou **livre**.
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

## Imitation

Un individu qui voit un autre individu réaliser une recette (dans son rayon de perception, pendant toute la durée de fabrication) a 50 % de chances de l'apprendre, à force 0,6.
