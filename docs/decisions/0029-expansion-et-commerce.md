# 0029 — Expansion et commerce : mer nourricière, savoir durable, routes, quartiers, navires

- **Date** : 2026-10-26
- **Statut** : acceptée
- **Documents concernés** : `docs/design/18-expansion-et-commerce.md` (nouveau), `02-monde.md`, `05-savoir.md`, `06-ia.md`, `08-interface.md`, `09-architecture.md`, `11-feuille-de-route.md`, `13-agriculture-cuisine.md`, `14-economie.md`, `15-colonies-et-migration.md`, `17-architecture.md`, glossaire

## Contexte

Une étude de 100 graines sur 150 jours, puis d'une graine sur 1 000 jours, a montré où les colonies s'arrêtent :

- elles grandissent par leurs filles, et une fille posée au bord de l'eau ou en forêt échoue deux fois plus souvent ;
- des colonies meurent de faim avec de la nourriture à 40 cases ;
- le savoir écrit est presque absent ;
- un fondateur peut s'enfermer dans un objectif qui échoue sans cesse ;
- les ensembles de recettes débordaient de 32 bits ;
- au-delà de 300 jours, le monde se fige à 16 colonies, même éteintes.

L'utilisateur a demandé des règles pour aider les pixels à prospérer : routes commerciales, routes plus rapides, ports, navires, pêche renouvelable, routes qui s'urbanisent, quartiers spécialisés, grandes bibliothèques avec des maîtres. Il a retenu toutes les pistes, ajouté navires et îles, et reporté le J13 (« Conflits ») : il préfère voir l'expansion et le commerce.

## Décision

Une mise à jour v0.16 en six ensembles ([18](../design/18-expansion-et-commerce.md)) :

1. **Correctifs** :
   - ensembles de 53 bits (`core/bits.js`) ;
   - lassitude d'un objectif dont les essais échouent ;
   - fin de l'aller-retour des affamés entre le camp et la recherche ;
   - places des colonies éteintes libérées.
2. **La mer nourricière** :
   - poisson pêché depuis la berge ;
   - ponton ;
   - fumoir, poisson fumé et grillé ;
   - barque, outil de pêche qui ouvre l'eau.
3. **Le savoir durable** :
   - tablette d'argile ;
   - grande bibliothèque ;
   - maîtres, élèves, école et gène du goût d'enseigner ;
   - savoir enseigné compté dans l'harmonie.
4. **Routes** :
   - sentiers pavés ;
   - routes vers les partenaires de commerce ;
   - relais sur les routes ;
   - haltes des caravanes.
5. **Quartiers** : bonus de travail près des stations du même type, et stations posées ensemble.
6. **Navires et îles** : un navire à quai fait voyager sur l'eau l'éclaireur, l'expédition et les caravanes. Une colonie fondée au-delà de l'eau est d'outre-mer.

Choix de conception :

- **Le navire est une construction à quai**, pas un objet porté. La colonie qui l'a fait voyager ses gens sur l'eau. Un objet porté demandait un nouveau genre de projet (fabriquer un bien à une station pour la réserve). Le chantier naval prévu disparaît : le navire se bâtit à mains nues sur la berge.
- **Le poisson se prend depuis la case voisine** : le navigateur marque les cases de berge à côté d'un poisson, la perception s'en souvient comme d'un coin de pêche, la récolte prend dans la case d'eau.
- **Une même vitesse de sol** (`sailing.js`) sert au navigateur et au pas : l'eau prend la vitesse de l'agent sur l'eau (0 à pied), un ponton se marche comme la terre.
- **Les recettes sont reconnues par leur station et l'ensemble de leurs ingrédients** : fumoir, école, navire et barque ont chacun un ensemble d'ingrédients que rien d'autre n'utilise à la même station.

## Conséquences

- Les mondes changent : poisson sur l'eau, nouvelles recettes et constructions, nouveaux objectifs (Enseigner) et gène. Les graines de démonstration changent en conséquence.
- Le critère du J4 compte la barque comme un outil.
- Valeurs nouvelles de `data/balance.json` :
  - `ai.weariness` ;
  - `migration.maxColonies`, `relayDistance`, `relayRoad` ;
  - `teaching` ;
  - `writing.tabletRecipes`, `greatRoom`, `greatTau` ;
  - `quarters` ;
  - `sailing` ;
  - `works.pierReach`, `pierLength`, `pathTiles` ;
  - `economy.haltRadius`, `haltShare`.
- Mesures : voir la feuille de route ([11](../design/11-feuille-de-route.md), « L'expansion et le commerce »).
- Reporté :
  - péremption des vivres (qui donnerait tout son sens au fumoir) ;
  - navire porté et chantier naval ;
  - marchés de carrefour ;
  - gel des blocs lointains, qui permettrait de relever le plafond de 500 individus ;
  - le J13.
