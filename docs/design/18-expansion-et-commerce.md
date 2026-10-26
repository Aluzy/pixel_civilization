# 18 — Expansion et commerce

> Mise à jour demandée après l'architecture (décision 0029). Elle passe avant les conflits : le J13 (« Conflits ») est reporté. On veut voir les colonies s'étendre, se nourrir de la mer, garder leur savoir et commercer. Toutes les valeurs sont dans `data/balance.json` (sections `ai.weariness`, `migration`, `teaching`, `writing`, `quarters`, `sailing`, `works`, `economy`) et `data/resources.json`.

## Ce que montraient les mesures

Sur 100 graines et 150 jours (v0.15), puis une graine sur 1 000 jours :

- Une partie grandit par ses **colonies filles**, pas par sa colonie mère. Une fille posée sur un site fermé (marais, rivage, forêt : moins de 15 % de plaine) réussit deux fois moins souvent. Le bord de l'eau ne nourrit pas.
- Des colonies de 34 à 37 membres meurent de faim avec du poisson et des baies à 40 cases.
- Le savoir écrit est la composante la plus faible : elle vaut 0 dans plus de la moitié des colonies, et un livre n'est écrit que dans une partie sur deux.
- Les routes entre colonies sont rares (9 parties sur 100 au jour 150) et tracées d'un camp à l'autre, pas selon les chemins suivis.
- Au-delà de 300 jours, deux plafonds techniques figent le monde : 500 individus et 16 colonies. Une colonie éteinte garde sa place.

## 1. Correctifs

- **Recettes au-delà de 32.** Les ensembles de recettes (connues, écrites, perdues, vues en bibliothèque, savoir du planificateur, savoir-faire vu chez les autres) tenaient sur 32 bits ; il y a 34 recettes depuis la v0.14, et les deux dernières se confondaient avec les deux premières. Ils passent sur 53 bits (`src/sim/core/bits.js`) : un nombre ordinaire, travaillé mot par mot par division et `floor`, sans allocation. Les ensembles de stations du planificateur aussi (les codes de construction dépassent 32). Le catalogue refuse plus de 53 recettes.
- **Lassitude d'un objectif.** Un fondateur pouvait passer sa vie sur « S'équiper » : il cherche une arme en combinant ses matériaux, fabrique autre chose, recommence, et ne remplit jamais la réserve qu'exige la réplication (4 graines sur 100 s'éteignaient avec un seul individu). Chaque essai raté ajoute 1 à la **lassitude** de l'objectif poursuivi ; au-delà des 8 premiers (le prix normal de la découverte), son poids est divisé par 1 + 0,3 × la lassitude. Elle diminue de moitié en 3 jours et retombe à 0 à la première découverte.
- **Les affamés qui tournent en rond.** Un affamé loin du camp retournait lire le tableau noir, n'y trouvait rien, repartait chercher, et était renvoyé au camp quelques cases plus loin. Celui qui a lu le tableau noir depuis peu cherche désormais sans revenir.
- **Places des colonies.** Seules les colonies vivantes comptent dans la limite (`migration.maxColonies`, 24) ; le tableau des colonies peut en tenir 32 en tout.

## 2. La mer nourricière

- **Poisson** : une ressource renouvelable sur l'eau peu profonde, près du rivage (altitude 0,24 à 0,30), 2 à 6 unités par case, qui repousse en un jour. Il nourrit de 10 (une baie de 12) et se pêche en 8 cycles par unité, comme une baie : on va à la nourriture la plus proche, une pêche plus lente affamait les colonies au bord de l'eau.
- **Pêcher** : on pêche **depuis une case voisine**, comme on boit. On se souvient du poisson à la case de berge d'où on le prend, et le tableau noir partage ces coins de pêche.
- **Ponton** : un ouvrage ([17](17-architecture.md)) d'une colonie qui a du poisson en réserve. Depuis la berge libre la plus proche du camp (16 cases au plus), il avance tout droit de 2 à 4 cases sur l'eau (2 bois par case). On y marche comme sur la terre, et on y pêche les eaux plus profondes.
- **Fumoir** : une station (bois, argile, chaume) où 2 poissons et 1 bois deviennent du **poisson fumé**. Le **poisson grillé** se fait au feu de camp. Ce sont des plats pour les cuisiniers ([13](13-agriculture-cuisine.md)).
- **Barque** : un outil de pêche (×2), fait à l'établi de bois, de fibre et d'un peu d'argile. Qui la porte avance sur l'eau (×0,8). Un fondateur en fait souvent son premier outil.
- Qui se retrouve sur l'eau sans barque nage vers la rive (×0,3).

## 3. Le savoir durable

- **Tablette d'argile** : un support d'écrit de 2 argiles, sans station. Elle tient 3 recettes (un livre 10). Le scribe vise un livre ou une tablette : s'il ne trouve pas comment faire un livre, il écrit sur l'argile.
- **Grande bibliothèque** : un ouvrage de pierre de 3 × 3, au nord de la place (8 cases). C'est une bibliothèque qui tient 4 fois plus de documents et ne brûle pas. On s'y tient à 2 cases de son centre. Une recette lue sur place s'oublie 2 fois plus lentement.
- **Maîtres et élèves** :
  - Le **maître** est un membre dont le souvenir d'une recette est assez fort (0,6 au moins), dans une colonie d'au moins 12 membres qui a une école ou une bibliothèque. Un seul à la fois. Le poste tourne tous les 2 jours, au profit d'un membre au camp qui maîtrise au moins aussi bien.
  - Il enseigne à l'**école** (une station de torchis : argile et fibre), sinon à la bibliothèque, un tiers de journée à la fois. Les membres qui ignorent une des recettes qu'il enseigne viennent l'apprendre à 2 cases de lui, avant de lire.
  - Une leçon dure 40 cycles. L'élève retient la recette aussi fort que le maître, fois 0,5 à 1 selon le **goût d'enseigner** du maître, un nouveau gène hérité et muté. À l'école, le souvenir dure 1,5 fois plus. Enseigner fortifie aussi le souvenir du maître.
  - Le savoir enseigné compte dans la composante Savoir comme le savoir écrit : une recette connue de 3 membres d'une colonie qui a une école est **enseignée**.

## 4. Sentiers, routes et relais

- **Sentiers** : une case beaucoup foulée devient un sentier, où l'on marche plus vite (déjà en place depuis la v0.14).
- **Sentiers pavés** : un ouvrage répété qui pave les 40 cases les plus foulées du territoire, les plus usées d'abord. Ce sont les chemins réellement suivis qui deviennent des routes.
- **Routes commerciales** : la route pavée relie une colonie à toute colonie avec laquelle elle a commercé, plus seulement à sa mère.
- **Relais** : un éclaireur peut fonder une colonie à 24 cases seulement des autres (au lieu de 56) si le site est à 2 cases d'une route pavée.
- **Halte** : une caravane qui passe à 8 cases du camp d'une troisième colonie que la sienne connaît y fait halte une fois. Elle y vend la moitié de sa charge si ce comptoir paie plus que le sien ne vendait, et les deux colonies comptent un échange : la route suivra.

## 5. Quartiers spécialisés

- On travaille plus vite à une station quand d'autres stations du **même type** sont à 4 cases : +10 % par voisine, +30 % au plus.
- Une nouvelle station se pose à côté d'une station du même type quand il y en a une en vue : les quartiers se forment d'eux-mêmes.
- L'inspecteur d'un individu qui fabrique affiche le bonus de quartier.

## 6. Navires et îles

- **Navire** : une construction posée sur la berge, faite à mains nues de 12 bois, 6 fibres et 2 charbons (le goudron). Une colonie d'au moins 40 membres qui va bien (stabilité et bien-être d'au moins 0,5) et n'en a pas en ouvre le projet.
- Tant que son navire est à quai, les **voyages** de la colonie avancent sur l'eau (×1,2, plus vite qu'à pied) : son éclaireur, son expédition en route, ses caravanes. L'éclaireur explore au-delà de l'eau et peut choisir un site sur une île ou une autre rive.
- L'eau se traverse case par case, comme la terre : pas de physique.
- **Îles** : le monde a déjà des terres coupées par l'eau. Sur 6 graines sur 10, une part de la terre à 100 cases du départ ne se rejoint pas à pied (jusqu'à 31 %).
- Une expédition qui a traversé l'eau fonde une colonie **d'outre-mer**, annoncée dans la chronique.

## Ce que fait la v0.16

Mesuré sur les graines 1 à 100 et 150 jours, face à la v0.15 :

- La faim recule : 12 % des morts au lieu de 41 %. Une seule partie s'éteint (9 avant), deux seulement restent sous 10 individus (13 avant).
- Le savoir tient : composante Savoir médiane 0,94 (0 avant). Une leçon est donnée dans 99 parties, un livre ou une tablette est écrit dans 92 (53).
- Les colonies prennent la mer : un navire dans 75 parties, 74 colonies d'outre-mer dans 43 parties, des relais dans 11.
- L'harmonie médiane passe de 49 à 63.
- La population au jour 150 ne bouge pas en moyenne (69) : les colonies durent, mais elles ne grandissent pas plus vite. Le prochain levier est la vitesse des naissances et l'encombrement des portes au coucher.
- Ponton, sentiers pavés et grande bibliothèque restent rares à 150 jours (7, 18 et 1 parties) : ils viennent après les autres ouvrages.
- Écarts à la conception de départ : le navire est une construction à quai, pas un objet ; le chantier naval est abandonné ; la barque est un outil.
