# 18 — Expansion et commerce

> Mise à jour demandée après l'architecture (décision 0029). Elle passe avant les conflits : le J13 (« Conflits ») est reporté. On veut voir les colonies s'étendre, se nourrir de la mer, garder leur savoir et commercer. Les valeurs marquées 🟡 sont des points de départ, réglés dans `data/balance.json` par la mesure. La section « Ce que fait la v0.16 » à la fin prime sur elles.

## Ce que montraient les mesures

Sur 100 graines et 150 jours (v0.15), puis une graine sur 1 000 jours :

- Une partie grandit par ses **colonies filles**, pas par sa colonie mère. Une fille posée sur un site fermé (marais, rivage, forêt : moins de 15 % de plaine) réussit deux fois moins souvent. Le bord de l'eau ne nourrit pas.
- Quatre colonies de 34 à 37 membres meurent de faim : plus de baies en réserve, la colonie vit des seules moissons de blé.
- Le savoir écrit est la composante la plus faible : elle vaut 0 dans plus de la moitié des colonies, et un livre n'est écrit que dans une partie sur deux.
- Les routes entre colonies sont rares (9 parties sur 100 au jour 150) et tracées d'un camp à l'autre, pas selon les chemins suivis.
- Au-delà de 300 jours, deux plafonds techniques figent le monde : 500 individus et 16 colonies. Une colonie éteinte garde sa place.

## 1. Correctifs

- **Recettes au-delà de 32.** Les ensembles de recettes (connues, écrites, perdues, vues en bibliothèque, savoir du planificateur) tenaient sur 32 bits ; il y a 34 recettes depuis la v0.14, et les deux dernières se confondaient avec les deux premières. Ils passent sur 53 bits (`src/sim/core/bits.js`), un nombre ordinaire manipulé par division et `floor`, sans allocation. Le catalogue refuse plus de 53 recettes.
- **Objectif qui échoue sans cesse.** Un fondateur pouvait passer sa vie sur « S'équiper » : son plan échoue (il fabrique autre chose en cherchant), il recommence. Un objectif dont le plan a échoué perd de l'attrait, d'autant plus qu'il a échoué souvent de suite, et le retrouve avec le temps (🟡 demi-vie d'une journée). L'échec est noté au journal.
- **Places de colonie.** Seules les colonies vivantes comptent dans la limite (`migration.maxColonies`, 🟡 24) ; le tableau des colonies peut en tenir 32 en tout.
- **Famines des grandes colonies.** Voir « Ce que fait la v0.16 ».

## 2. La mer nourricière

- **Poisson** : une ressource renouvelable sur l'eau peu profonde, près du rivage (altitude 🟡 0,22 à 0,30). Il repousse en 🟡 un jour. Une case vidée sans cesse s'épuise comme une autre, et compte dans la durabilité.
- **Pêcher** : on pêche **depuis une case voisine**, comme on boit. Les individus le découvrent en essayant, comme une récolte ; aucun outil n'est requis.
- **Ponton** : un ouvrage (moteur des ouvrages, [17](17-architecture.md)) qui avance de quelques cases dans l'eau depuis la berge la plus proche du camp. On y marche ; on y pêche les eaux plus profondes. Il faut une colonie qui pêche déjà.
- **Fumoir** : une station où le poisson et le bois deviennent du **poisson fumé**, plus nourrissant. C'est un plat pour les cuisiniers ([13](13-agriculture-cuisine.md)) : la réserve tient entre deux moissons.
- **Barque** : un objet (bois et fibre). Qui la porte avance sur l'eau (🟡 ×0,8), pêche au large et franchit un bras d'eau.

## 3. Le savoir durable

- **Tablette d'argile** : un support d'écrit qui ne demande que de l'argile, sans scriptorium. Elle tient 🟡 3 recettes (un livre 10). Le scribe qui ne parvient pas à faire un livre en fait une.
- **Grande bibliothèque** : un ouvrage de pierre de 3 × 3 près de la place. Elle compte comme une bibliothèque, tient 🟡 quatre fois plus de documents et ne brûle pas. Une recette lue ou apprise sur place s'oublie 🟡 deux fois plus lentement.
- **Maîtres et élèves** :
  - Le **maître** est le membre qui maîtrise le mieux une recette que d'autres membres ignorent (la maîtrise est la force du souvenir de la recette). Un rôle à la fois par colonie, comme le scribe.
  - Il enseigne à l'**école** (une station de bois et de pierre), sinon à la bibliothèque. Les membres qui ignorent la recette viennent apprendre à la place de lire.
  - Après une leçon (🟡 40 cycles), l'élève connaît la recette ; la force de son souvenir dépend de celle du maître et de son **goût d'enseigner**, un nouveau gène hérité et muté. Un bon maître transmet mieux.
  - Le savoir enseigné compte dans la composante Savoir comme le savoir écrit : une recette connue de plusieurs membres d'une colonie qui a une école est un savoir **enseigné**.

## 4. Sentiers, routes et relais

- **Sentiers** : une case beaucoup foulée devient un sentier, où l'on marche plus vite (déjà en place depuis la v0.14).
- **Paver les sentiers** : un ouvrage qui pave les cases les plus foulées du territoire (🟡 40 par ouvrage), les plus usées d'abord. Ce sont les chemins réellement suivis qui deviennent des routes.
- **Routes commerciales** : la route pavée relie une colonie à toute colonie avec laquelle elle a commercé, plus seulement à sa mère.
- **Relais** : un éclaireur peut fonder une colonie à 🟡 24 cases seulement d'une autre si le site touche une route pavée. Les routes se couvrent de hameaux.
- **Halte** : une caravane qui passe près d'une colonie amie y fait halte et y commerce. Les relais vivent du passage.

## 5. Quartiers spécialisés

- Une station travaille plus vite quand d'autres stations du **même type** sont proches (🟡 4 cases) : 🟡 +10 % par voisine, 🟡 +30 % au plus.
- La colonie pose une nouvelle station près de celles du même type quand elle le peut : les forges se groupent, les fours aussi.
- L'inspecteur d'une station affiche son bonus.

## 6. Navires et îles

- **Chantier naval** : une station posée sur la berge.
- **Navire** : un bien de la colonie, fait au chantier naval (beaucoup de bois et de fibre). Un navire dans la réserve sert aux voyages :
  - l'**éclaireur** l'emporte : il explore au-delà de l'eau et peut choisir un site sur une **île** ou une autre rive ;
  - l'**expédition** voyage en équipage : tant que son chef porte le navire, chacun de ses membres avance sur l'eau ;
  - une **caravane** qui en porte un franchit l'eau.
- L'eau se traverse case par case, comme la terre, avec sa propre vitesse (🟡 ×1,2 pour un navire) : pas de physique.
- **Îles** : le monde a déjà des terres entourées d'eau. Une colonie fondée sur une terre qu'on ne peut rejoindre à pied depuis le camp de sa mère est une colonie d'outre-mer, signalée dans la chronique.

## Ce que fait la v0.16

À compléter avec les mesures : valeurs retenues, sorties vérifiées, écarts à ce document.
