# 02 — Le monde

## Grille et blocs

- Le monde est une grille 2D quasi infinie de cases (coordonnées entières signées 32 bits).
- Il est découpé en **blocs** (*chunks*) de 64 × 64 cases, générés à la demande à partir de la graine.
- Une même graine produit toujours le même monde.
- Un bloc est identifié par `(cx, cy) = (floor(x / 64), floor(y / 64))`.
- Stockage d'un bloc (`src/sim/world/chunk.js`) : quatre `Uint8Array(4096)` parallèles — biome, ressource (0 = aucune), quantité restante, altitude quantifiée sur 0–255.
- Un bloc généré mais jamais modifié est une fonction pure de la graine : il ne compte pas dans le hash d'état. Seuls les blocs modifiés par la simulation (`modified`) y entrent, si bien que ce que regarde l'observateur ne change jamais le résultat.

## Génération procédurale

1. Trois champs de bruit simplex fractal (fbm), chacun avec un flux aléatoire dérivé de la graine, puis étirés autour de 0,5 (`contrast`) pour exploiter toute la plage [0, 1] :
   - altitude (fréquence 0,0045, 5 octaves) ;
   - humidité (0,006, 3 octaves) ;
   - température (0,003, 2 octaves). Le gradient nord-sud initialement prévu est abandonné : le monde est sans bord.
2. Le **biome** de chaque case est la première règle de `data/world.json` dont les plages altitude × humidité × température correspondent.
3. Les ressources sont placées **en amas** : pour chaque règle de `data/resources.json` (`placement`), un bruit propre délimite des taches (`threshold`), à l'intérieur desquelles une case porte la ressource avec la probabilité `density`. Le tirage par case vient d'un hachage des coordonnées (`hashCoords`), pas d'un flux séquentiel.
4. La génération d'un bloc ne dépend que de la graine et de `(cx, cy)`, jamais de l'ordre de génération : elle est parallélisable et rejouable (testé).
5. Le bruit est implémenté dans le projet (`src/sim/world/noise.js`), pas importé : décision 0004.

Proportions mesurées sur 1 024 × 1 024 cases (3 graines) : eau ~23 %, plaine ~24 %, forêt ~23 %, montagne ~17 %, désert ~5 %, berge ~4 %, marais ~3 % ; ~80 % des cases sans ressource. Génération : ~2,5 ms par bloc sur une machine de développement.

### Biomes

| Biome | Condition (ordre d'évaluation) | Couleur de fond | Ressources principales |
| --- | --- | --- | --- |
| Eau | altitude < 0,30 | Bleu foncé | Eau (le biome lui-même) |
| Berge | 0,30 ≤ altitude < 0,33 | Sable | Argile, fibre |
| Montagne | altitude ≥ 0,75 | Gris clair | Pierre, cuivre, charbon, fer (altitude ≥ 0,86) |
| Marais | 0,33 ≤ altitude < 0,42 et humidité ≥ 0,68 | Vert olive | Fibre, argile |
| Désert | humidité < 0,30 et température ≥ 0,55 | Jaune pâle | Pierre (rare) |
| Forêt | humidité ≥ 0,52 | Vert foncé | Bois, baies |
| Plaine | sinon | Vert pâle | Baies, fibre |

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
| Gibier | Jaune | Forêt, plaine | Oui, se déplace et se reproduit | Arme requise (faune, ajoutée au jalon J4) |

La palette exacte (codes hexadécimaux) est définie dans `data/resources.json`. Règles de palette :

- `#000000` est réservé aux individus, et aucune ressource ne doit pouvoir s'y confondre : le charbon est un gris violacé (`#4d4858`), pas un quasi-noir ;
- l'eau n'est pas une couche de ressource : c'est le biome Eau, inépuisable ;
- deux ressources doivent rester distinguables pour les daltoniens (vérifier avec un simulateur de deutéranopie) ;
- aux zooms ≥ ×8, chaque type peut afficher un motif en plus de sa couleur.

**Accès** : une ressource n'est récoltable qu'avec la compétence ou l'outil requis. Le temps écoulé ne débloque rien à lui seul ; seule la découverte fait progresser.

**Régénération** : les ressources renouvelables repoussent à proximité des cases existantes de même type, selon un taux défini dans `balance.json`. Une ressource totalement éradiquée d'une zone ne revient pas.

Au J5, les baies sont plus nombreuses (forêt : seuil 0,64 et densité 0,35 au lieu de 0,68 et 0,3 ; plaine : 0,66 et 0,3 au lieu de 0,7 et 0,25) : autour de certains camps, le territoire ne pouvait pas nourrir une vingtaine d'individus.

Implémentation actuelle (J2) : une case renouvelable vidée repousse **au même endroit** après `regrowTicks` cycles (`data/resources.json` : baies 2 jours, fibre 3 jours, bois 10 jours), avec une quantité tirée dans sa plage. La propagation vers les cases voisines viendra avec l'agriculture.

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

État au J4 (`src/sim/threats/`, `src/sim/systems/threat-system.js`, `data/world.json` → `threats`, `data/balance.json` → `threats`) : seuls les prédateurs existent. À partir du jour 2, au crépuscule et la nuit, tous les 100 cycles, chaque individu hors abri a 20 % de chances d'en voir apparaître un, à 20–30 cases, en forêt ou en plaine, s'il n'y en a pas déjà un à moins de 48 cases. Un prédateur (24 PV, attaque 7, défense 1, 1,5 case/s) chasse l'individu hors abri le plus proche à moins de 32 cases, frappe quand il est adjacent, s'enfuit sous 25 % de ses PV, abandonne après 300 cycles de chasse sans toucher, et repart au lever du jour. Il ne peut pas atteindre un individu dans un abri. Les directions d'apparition viennent d'une table de 16 caps entiers, sans trigonométrie.

## Régions gelées

Seuls les blocs à moins de 2 blocs d'un individu sont simulés en détail. Les autres sont **gelés** ; à leur réactivation, la régénération des ressources est rattrapée analytiquement à partir du nombre de cycles écoulés, sans simuler chaque cycle.
