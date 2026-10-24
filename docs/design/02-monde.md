# 02 — Le monde

## Grille et blocs

- Le monde est une grille 2D quasi infinie de cases (coordonnées entières signées 32 bits).
- Il est découpé en **blocs** (*chunks*) de 64 × 64 cases, générés à la demande à partir de la graine.
- Une même graine produit toujours le même monde.
- Un bloc est identifié par `(cx, cy) = (floor(x / 64), floor(y / 64))`.
- Stockage d'un bloc : `Uint8Array(4096)` pour le type de case, plus un `Uint8Array(4096)` pour la quantité restante de la ressource de la case.

## Génération procédurale

1. Trois cartes de bruit Simplex multi-octaves, chacune avec un flux aléatoire dérivé de la graine :
   - altitude (échelle ~1/256, 4 octaves) ;
   - humidité (échelle ~1/192, 3 octaves) ;
   - température (échelle ~1/512, 2 octaves, plus un léger gradient nord-sud).
2. Le **biome** de chaque case est déterminé par une table altitude × humidité × température.
3. Chaque biome fixe la probabilité d'apparition des ressources, distribuées **en amas** (bosquets, filons) grâce à un quatrième bruit à haute fréquence seuillé, pas au hasard uniforme.
4. La génération d'un bloc ne dépend que de la graine et de `(cx, cy)` : elle est parallélisable et rejouable.

### Biomes

| Biome | Condition indicative | Couleur de fond | Ressources principales |
| --- | --- | --- | --- |
| Eau | altitude < 0,30 | Bleu foncé | Eau |
| Berge | 0,30 ≤ altitude < 0,33 | Sable | Argile, fibre |
| Plaine | altitude moyenne, humidité moyenne | Vert pâle | Baies, fibre, gibier |
| Forêt | altitude moyenne, humidité forte | Vert foncé | Bois, baies, gibier |
| Marais | altitude basse, humidité très forte | Vert olive | Fibre, argile |
| Désert | humidité faible, température forte | Jaune pâle | Pierre (rare) |
| Montagne | altitude > 0,70 | Gris clair | Pierre, cuivre, charbon, fer |

Les couleurs de fond des biomes sont **désaturées** pour que les pixels de ressources, vifs, ressortent.

## Ressources

Chaque case de ressource contient une quantité (1 à 255 unités). Récolter retire une unité. Une case vide redevient du sol du biome.

| Ressource | Couleur | Biome principal | Renouvelable | Accès |
| --- | --- | --- | --- | --- |
| Baies | Rouge vif | Forêt, plaine | Oui, repousse lente | Dès le départ |
| Eau | Bleu vif | Eau | Inépuisable | Dès le départ |
| Bois | Brun | Forêt | Oui, très lente | Dès le départ (lent à mains nues) |
| Fibre végétale | Vert clair | Plaine, marais | Oui | Dès le départ |
| Pierre | Gris | Montagne | Non | Mains nues lentement ; outil de pierre ×3 |
| Argile | Ocre | Marais, berges | Non | Après découverte |
| Cuivre | Orange | Montagne | Non | Outil de pierre requis |
| Charbon | Gris anthracite (≠ noir pur) | Montagne | Non | Outil de pierre requis |
| Fer | Gris-bleu | Montagne profonde | Non | Outil de cuivre requis |
| Gibier | Jaune | Forêt, plaine | Oui, se déplace et se reproduit | Arme requise |

La palette exacte (codes hexadécimaux) est définie dans `data/resources.json`. Règles de palette :

- `#000000` est réservé aux individus ;
- deux ressources doivent rester distinguables pour les daltoniens (vérifier avec un simulateur de deutéranopie) ;
- aux zooms ≥ ×8, chaque type peut afficher un motif en plus de sa couleur.

**Accès** : une ressource n'est récoltable qu'avec la compétence ou l'outil requis. Le temps écoulé ne débloque rien à lui seul ; seule la découverte fait progresser.

**Régénération** : les ressources renouvelables repoussent à proximité des cases existantes de même type, selon un taux défini dans `balance.json`. Une ressource totalement éradiquée d'une zone ne revient pas.

## Cycle jour/nuit

- Un jour dure 1 200 cycles (120 s à ×1, à 10 cycles/s).
- Répartition : 60 % jour, 10 % crépuscule, 20 % nuit, 10 % aube.
- La nuit, la perception est divisée par 2 et les prédateurs sont plus actifs.
- Dormir hors d'un abri : pas de récupération complète et risque de pertes de santé (froid, prédateurs).

## Menaces

| Menace | Couleur | Comportement |
| --- | --- | --- |
| Prédateur | Rouge sombre | Rôde en forêt, attaque les individus isolés, surtout la nuit |
| Intempérie | Effet visuel, pas de pixel | Zone temporaire où les individus hors abri perdent de la santé |
| Incendie | Orange vif clignotant | Se propage sur le bois et les bâtiments en bois, déclenché par un feu de camp mal placé ou la foudre |
| Épuisement | — | Une ressource non renouvelable finit par manquer |

Les menaces donnent un sens à l'abri, aux armes, à l'attribut défense et à l'organisation spatiale.

## Régions gelées

Seuls les blocs à moins de 2 blocs d'un individu sont simulés en détail. Les autres sont **gelés** ; à leur réactivation, la régénération des ressources est rattrapée analytiquement à partir du nombre de cycles écoulés, sans simuler chaque cycle.
