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

## Imitation

Un individu qui voit un autre individu réaliser une recette (dans son rayon de perception, pendant toute la durée de fabrication) a 50 % de chances de l'apprendre, à force 0,6.
