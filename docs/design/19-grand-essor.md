# 19 — Le grand essor : le peuple, les villes et leurs vocations

> Mise à jour demandée après l'expansion et le commerce (décision 0030). On veut des populations de l'ordre de 10 000 individus, fluides à ×16, et des éclaireurs qui fondent au loin des villes spécialisées : la pierre en montagne, les champs en plaine, la pêche au bord de l'eau. L'utilisateur accepte pour cela de **limiter les fonctions** de la plupart des pixels. Toutes les valeurs sont dans `data/balance.json` (sections `people`, `migration`, `colony`, `agriculture`) et `data/vocations.json`.

## Ce qui bloquait

- **Plafonds techniques** : 512 entités, 24 colonies vivantes, éclaireurs à 56–90 cases.
- **Coût** : environ 4,5 µs par individu et par cycle. À ×16, un cycle doit tenir en 6,25 ms : 10 000 individus demandent 0,6 µs chacun. Une part du coût croissait comme le carré de la population (voisins, prédateurs, imitation).
- **Naissances** : une naissance demande la réserve d'avance de la colonie (décision 0011), une réplique à la fois. Une colonie de 100 jours comptait 60 à 125 individus.

## 1. Deux rangs : les figures et le peuple

Chaque colonie a deux rangs d'individus (`Tier` dans `agent-store.js`) :

- Les **figures** gardent l'IA complète ([06](06-ia.md)) : Utility AI, planification, simulation mentale, modèle des autres, apprentissage, génome. Elles explorent, inventent, écrivent, enseignent, commercent, partent en éclaireur ou mènent une expédition. Ce sont elles qu'on suit dans la chronique.
- Le **peuple** (les autres) suit une **routine de ville** (`agents/commoner.js`), sans planification ni mémoire propre :
  1. boire quand la soif passe 45, manger quand la faim passe 45 (25 le soir : on ne ressort pas une fois couché) ;
  2. rentrer s'abriter si un prédateur le chasse ;
  3. le soir (150 cycles avant le crépuscule, puis le crépuscule et la nuit) ou épuisé, aller dormir ;
  4. sinon travailler pour la ville, et s'il n'y a rien à faire, se reposer chez soi.

  La routine se revoit tous les 30 cycles (120 au repos), ou quand une action finit. Elle écrit sa tâche (`duty`) que l'inspecteur affiche.

**Quota de figures** (`people.figureQuota`) : toute la colonie tant qu'elle a moins de 16 membres, puis 12 figures plus 2 % des membres. Un membre du peuple est promu quand une figure manque ; un nouveau-né est une figure si le quota n'est pas plein.

**Esprit léger** : un membre du peuple a une mémoire de 2 lieux, une carte d'exploration grossière, un journal de 4 entrées et un modèle social d'une place. La routine ne lit que la carte de la ville (ci-dessous), jamais la grille du monde au-delà.

**Savoir-faire de la ville** : ce que savent faire les figures (l'union de leurs recettes) est le savoir-faire de la colonie (`colony.knowhow`). Le peuple fabrique ce que la ville sait faire : il bâtit un abri si une figure connaît l'abri, cultive si une figure connaît le champ. C'est la transmission par l'exemple des maîtres, sans apprentissage individuel.

**Budget de réflexion** : l'intervalle de décision des figures croît avec leur nombre (× ⌈figures / 200⌉), pour que leur coût reste borné.

## 2. La carte de la ville

Chaque colonie a une **carte de ville** (`colony/town-map.js`) de 105 × 105 cases autour du camp, redessinée tous les 1 200 cycles, ou après 300 cycles si une construction a changé dessus (`ChunkStore.changedSince`) :

- un arbre des plus courts chemins depuis le camp (Dijkstra sur la vitesse du sol) ; un trajet entre deux points suit leurs chemins vers le camp jusqu'à leur point de rencontre ;
- un second arbre vers l'eau la plus proche (rive, canal, puits), pour aller boire ;
- les 48 sources les plus proches de chaque ressource (le poisson pris depuis la berge), et 64 places où boire.

Le peuple ne calcule donc presque jamais de chemin : il lit la carte. Hors de la carte ou bloqué, il regarde autour de lui (4 cases).

## 3. La foule

Un pixel par case, une ville de centaines d'habitants se bloque dans ses ruelles. Pour le peuple :

- **traverser la foule** : un membre du peuple en chemin passe à travers un autre en chemin ; seul celui qui se tient, travaille ou dort tient sa case, et personne ne finit son trajet sur une case tenue ;
- se croiser de face, doubler celui qui attend ou mange, contourner celui qui se tient sur le chemin ;
- attendre trois fois plus longtemps avant de chercher un autre chemin ;
- un trajet vers le camp ou vers l'eau s'arrête à la première case du camp ou de la rive.

## 4. Les maisons et les lits

- **Maisons collectives** : la maison longue (6 × 4, 8 lits ; bois, fibre, pierre) dès 30 membres, la maison de ville (8 × 6, 24 lits) dès 120. Elles s'apprennent avec l'abri (`learntWith`) et ne se découvrent pas par essai.
- **Faubourgs** : quand l'enceinte est pleine, les maisons s'élèvent au dehors jusqu'à 44 cases du camp. Une place sur 4 × 4 reste libre (les placettes, où l'on creuse les puits).
- **Un lit à soi** : chaque membre du peuple a son lit (`bedOwner`), dans une maison. Il dort dans le lit libre le plus profond de sa maison : les lits sont rangés du fond vers la porte, la maison se remplit par le fond et personne ne dort entre la porte et un lit libre, ni sur le seuil.
- **Puits** : un ouvrage de pierre, solide et mouillé, creusé par le peuple sur une placette près de la maison la plus loin de l'eau (une maison sans eau d'abord). Un puits pour 25 membres.

## 5. Les naissances du foyer

Une colonie de 16 membres ou plus enfante par foyers (`people.household`), au lieu de la réplication de la décision 0011 :

- un crédit de naissances croît de 0,1 par membre et par jour ;
- une naissance demande un lit libre et une réserve de 6 portions plus 1 par membre ; les 6 portions du nouveau-né sont prises dans la réserve.

Les figures d'une petite colonie se répliquent comme avant.

## 6. Les vocations

Une ville a une **vocation** (`data/vocations.json`, `colony/vocation.js`) :

| Vocation | Site | Biens |
| --- | --- | --- |
| Ville agricole | la moitié de la vue en plaine ; deux fois plus de champs | blé, baies |
| Ville de la pierre | 3 cases de pierre en vue | pierre, argile |
| Port de pêche | 4 cases de poisson en vue | poisson |
| Ville forestière | 40 % de la vue en forêt | bois, fibre |

- **Le choix** : quand une colonie nomme son éclaireur, elle choisit la vocation dont les biens sont les plus chers à son comptoir (par rapport à leur prix de référence), moins 0,3 par ville de cette vocation déjà fondée.
- **L'éclaireur part loin** : 70 à 180 cases, par étapes de 40 à 90. Il juge un site sur une vue de 16 cases : il doit convenir à la vocation et border l'eau. Après la moitié de son temps de recherche, il accepte tout site au bord de l'eau.
- **Le travail** : le peuple d'une ville récolte ses biens 1,5 fois plus vite et vend au comptoir ce que la réserve a en trop (au-delà de 20 par membre) ; les caravanes ([15](15-colonies-et-migration.md)) les emportent vers les villes qui en manquent.
- **Les expéditions** : 160 colonies au plus. Un éclaireur doit savoir bâtir un abri ; la tête de l'expédition revient à un membre qui sait le faire ; les matériaux qui manquent sont mis en commun entre les membres proches.

## 7. Le travail du peuple

Dans l'ordre :

1. lancer ou bâtir ce que la ville sait faire et qui est prêt : un abri, un puits, le mur de l'enceinte, ses tours, un canal (le mur et le canal se posent case par case, depuis une case voisine) ;
2. selon sa place dans la ville (un sur quatre pour chaque rôle, par identifiant) :
   - **réserve** : garder en réserve 2 unités par membre de chaque matériau (pierre, argile, charbon…), le plus cher au comptoir et le moins tenu d'abord : les figures l'achètent pour fabriquer et inventer ;
   - **chantiers** : apporter les matériaux des projets, par charges de 15 ;
   - les autres : les champs d'abord quand la nourriture manque (moins de 4 portions par membre) ;
3. apporter les matériaux des projets ;
4. cultiver ;
5. récolter les biens de la vocation, puis les matériaux, pour le comptoir.

**Les champs sont au peuple** : il glane le blé sauvage sur la carte de la ville, sème ses premières graines, agrandit les champs tant que la ville sait faire un champ, et pèse l'urgence d'un travail contre la marche (`farmUrgency`).

**Les outils de la ville** : un membre du peuple récolte une ressource qui demande un outil (le charbon et la pioche de pierre) si sa ville sait fabriquer cet outil.

**Les métiers des figures** : dans une ville, une figure ne prend plus un métier qui ne fait que récolter (agriculteur, cueilleur, bûcheron, mineur) ; elle quitte celui qu'elle avait et choisit parmi ceux qui fabriquent (meunier, boulanger), transportent (marchand) ou réfléchissent (inventeur, scribe, garde). Une vente du peuple au comptoir est comptée au métier de ce qu'il apporte (le blé à l'agriculteur), pour que les livres du comptoir montrent toujours les chaînes.

## 8. Performance

- **Index spatial** (`agents/agent-grid.js`) : des seaux de 16 × 16 cases ; une requête rend les individus d'une zone dans l'ordre des identifiants. Il remplace les boucles en carré (voisins, demandes, alliés, prédateurs, frayeur, imitation).
- **Rendu** : le Worker envoie positions et sommeil dans des tableaux typés transférés ; un seul objet graphique dessine les individus visibles.
- **Mesure** : `npm run bench:towns` pose 40 villes de 250 habitants et mesure le coût d'un cycle face aux 6,25 ms de ×16 (voir la feuille de route).

## Limites assumées

- Le peuple n'apprend pas, ne se souvient pas, n'invente pas. Son savoir est celui des figures de sa ville. La décision 0030 assume cette entorse à la règle « ne pas simplifier l'IA » : l'intelligence reste entière chez les figures, qui gardent tout ce qui se raconte.
- Deux membres du peuple en chemin peuvent partager une case un instant.
- La fonderie vient plus tard : au jour 100, 2 parties sur 24 l'ont découverte, contre 9 en v0.16 (le four 13 contre 18). L'inventeur a ses matériaux en réserve, mais ne trouve pas la brique puis la fonderie à temps. Le critère du J10 ne l'exige plus que d'une partie sur trois (décision 0030).
