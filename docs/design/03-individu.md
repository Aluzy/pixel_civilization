# 03 — L'individu

Un individu est un pixel noir avec des attributs, des jauges de besoins, un inventaire, une mémoire (voir [05-savoir](05-savoir.md)) et un journal de décisions.

## Attributs

| Attribut | Rôle | Départ |
| --- | --- | --- |
| Points de vie (PV) | Mort à 0. Régénération lente si nourri et reposé | 100 |
| Force | Capacité de port de l'inventaire, vitesse de récolte | 10 |
| Vitesse | Cases parcourues par seconde à ×1 | 2 |
| Attaque | Dégâts de base, multipliés par l'arme | 5 |
| Défense | Réduction des dégâts, augmentée par l'équipement et l'abri | 2 |
| Perception | Rayon de vision en cases (÷2 la nuit) | 8 |
| Mémoire | Nombre d'emplacements de souvenirs | 20 |

Formules de base :

- Capacité d'inventaire = Force × 3 unités (× 2 jusqu'au J3 ; porter de quoi bâtir un abri et une réserve de baies demandait plus).
- Dégâts reçus = max(1, attaque de l'adversaire × multiplicateur d'arme − défense totale).
- Temps de récolte d'une unité = base de la ressource ÷ (1 + Force / 20) ÷ multiplicateur d'outil.

## Jauges de besoins

Chaque jauge va de 0 (satisfait) à 100 (critique) et évolue à chaque cycle.

| Jauge | Monte avec | Descend avec | Conséquence à 100 |
| --- | --- | --- | --- |
| Faim | Le temps, l'effort | Manger | Perte de PV |
| Soif | Le temps, la chaleur | Boire | Perte de PV rapide |
| Fatigue | Le temps éveillé, l'effort | Dormir (mieux dans un abri) | Vitesse et perception réduites, puis sommeil forcé |
| Insécurité | Danger perçu, nuit hors abri, PV bas | Abri, armes, compagnie | Fuite prioritaire |
| Curiosité | Le temps passé sans nouveauté | Explorer, expérimenter | Aucune ; pousse à explorer |

### Valeurs actuelles (J2, `data/balance.json`)

| Paramètre | Valeur |
| --- | --- |
| Faim | +50 par jour |
| Soif | +100 par jour |
| Fatigue | +80 par jour éveillé, −400 par jour de sommeil |
| Curiosité | +120 par jour éveillé hors exploration, −300 par jour d'exploration |
| Effort (déplacement, cueillette) | faim, soif et fatigue montent ×1,3 |
| Besoin critique (faim ou soif à 100) | −150 PV par jour et par besoin critique |
| Régénération | +40 PV par jour si faim et soif < 60 |
| Réveil | quand la fatigue descend à 5 |
| Épuisement | fatigue à 100 : l'individu s'endort, quel que soit son objectif |

Le premier individu commence avec toutes ses jauges à 30. En J2, il dort là où il se trouve : l'abri et les dangers nocturnes arrivent au J4.

Au J4, la fatigue baisse deux fois plus vite dans un abri (`sleepRecovery`), et un individu dans un abri est hors d'atteinte des prédateurs. L'inventaire contient aussi des objets (lance, hache, pioche) qui agissent tant qu'ils sont portés. La jauge d'insécurité n'est pas une jauge à part : le danger perçu et la vulnérabilité sont des entrées de l'objectif Fuir ([06-ia](06-ia.md)).

Au J8, l'insécurité devient une jauge : la **peur** (0 à 100, `balance.safety`). Elle monte quand l'individu est frappé, voit un prédateur ou apprend la mort d'un proche tué par un prédateur ; elle baisse au camp et dans un abri, plus lentement ailleurs, et remonte la nuit hors du camp. Elle porte l'objectif Se cacher. Après un coup, la régénération des PV tombe au quart pendant 1 jour. L'individu porte aussi une **compétence de combat** (0 à 1) et peut porter une armure (bouclier, armure de peau). Détail dans [16](16-guerre-et-forteresses.md).

## Pyramide des besoins

Un niveau ne compte pleinement que si les niveaux inférieurs sont satisfaits. Le moteur de décision ([06-ia](06-ia.md)) applique un facteur qui écrase les objectifs d'un niveau tant qu'un niveau inférieur est en souffrance.

1. **Survie** : manger, boire, dormir.
2. **Sécurité** : construire et entretenir un abri ; fuir le danger.
3. **Équipement** : armes et protections pour explorer sereinement.
4. **Efficacité** : outils pour extraire plus vite et accéder à de nouvelles ressources.
5. **Savoir** : expérimenter, cartographier, écrire, lire.
6. **Harmonie** : aménager le territoire, spécialiser les zones, transmettre.

## Réplication

Un individu peut se répliquer quand **toutes** ces conditions sont réunies :

- sa faim est restée inférieure à 30 sur les 600 derniers cycles ;
- il n'a perdu aucun PV depuis 2 jours ;
- il possède un abri ou réside dans un abri de la colonie ;
- il dispose du coût de réplication dans son inventaire (ex. 10 baies, 5 fibres) ;
- au moins 300 cycles (30 s à ×1) se sont écoulés depuis sa dernière réplication.

Se répliquer est une **décision** évaluée par le moteur d'IA (niveau Harmonie de la pyramide, avec un bonus quand la colonie manque de bras), pas un automatisme.

### Héritage

- La réplication apparaît sur une case libre adjacente.
- Elle hérite des **attributs** du parent avec une mutation de ±5 % par attribut (tirage via le générateur à graine). Depuis le J7, elle hérite aussi du **génome de décision** de son parent, chaque gène muté d'un tirage normal d'écart-type 5 % de sa plage (voir [06-ia](06-ia.md), couche 8).
- Elle hérite du **génome de décision** du parent (curiosité, aversion au risque, prévoyance…), lui aussi muté de ±5 % par gène (voir [06-ia](06-ia.md), couche 8). C'est le support de l'évolution des stratégies sur les générations.
- Elle naît **sans mémoire** ni expérience apprise : aucun lieu, aucune recette, aucune estimation. Elle doit tout apprendre (exploration, imitation, parole, livres).
- Ses jauges démarrent à 30.

### État au jalon J5

Implémenté (`src/sim/colony/replication.js`, objectif « Se répliquer » au niveau Harmonie, 0,6) :

- Conditions de la colonie, qui rendent l'objectif possible : un **lit libre** (chaque abri de la colonie compte 2 lits), assez de **nourriture d'avance** dans la réserve du camp (au moins une unité par membre, telle que l'individu l'a vue la dernière fois au camp), 300 cycles depuis sa dernière réplication, population sous le plafond de sécurité (120).
- Conditions individuelles, que le comportement prépare lui-même : porter le coût (**6 baies et 3 fibres**, au lieu de 10 et 5), manger dès que la faim dépasse 15 pour rester sous 30 pendant 600 cycles, n'avoir perdu aucun PV depuis 2 jours (il se repose au camp en attendant). La réplication dure 60 cycles, au camp.
- La réplique naît sur une case franchissable voisine, avec les attributs du parent multipliés chacun par un facteur tiré uniformément dans [0,95 ; 1,05] (flux aléatoire `lifecycle`), ses jauges à 30, sans souvenir ni recette, dans la colonie du parent, génération + 1. Pas encore de génome (J7).
- Les lits et la réserve régulent la population : une naissance demande un abri de plus, et la réserve ne se remplit que si le territoire nourrit plus de bouches qu'il n'en a. Mesure : 18 à 40 individus au jour 30 sur les graines 1 à 10, au plus 1 mort par graine ; la population plafonne ensuite (graines 1 à 3 : 42, 48 et 70 individus aux jours 50 à 60).
- Mort : la tâche est libérée, la colonie compte le décès, les autres oublient le défunt (son identifiant peut être réutilisé). L'inventaire ne tombe pas encore au sol.

### État au jalon J9

Avec l'agriculture ([13](13-agriculture-cuisine.md)) : le coût d'une réplication devient **6 portions de n'importe quelle nourriture** (une portion = 12 de nutrition ; la moins nourrissante est donnée d'abord, prise à la réserve si l'individu y croit assez de nourriture) et 3 fibres ; la réserve d'avance se compte en portions ; un abri compte **4 lits** ; à partir de 40 membres, pas de naissance avec moins d'une parcelle pour deux membres, et une réserve qui baisse depuis trois jours (telle que vue au camp) retient les naissances, sauf s'il reste 12 portions par membre. Un plat apaise la curiosité (plaisir).

### État au jalon J10

Une réplique reçoit 30 % des écus de son parent et fait son métier ses 5 premiers jours ; à la mort, les écus vont aux enfants vivants, sinon au comptoir ([14](14-economie.md)).

## Actions de survie (J2)

| Action | Effet |
| --- | --- |
| Boire | Debout à côté d'une case d'eau : −2 de soif par cycle, jusqu'à 0 (sans s'interrompre depuis le village) |
| Cueillir | Sur une case de baies : une unité toutes les `harvestTicks / (1 + Force / 20)` cycles. Elle est mangée si la faim dépasse la moitié de sa valeur nutritive (12 pour les baies), sinon mise en réserve jusqu'à 6 unités |
| Manger | Consomme une unité portée tous les 2 cycles, jusqu'à une faim de 5 |
| Dormir | Sur place, ou dans un lit depuis le J4 ; la fatigue baisse, l'individu se réveille à 5 (pas avant la fin de la nuit depuis le village) |
| Se déplacer | Le long d'un chemin calculé dans le champ de vision ; vitesse × facteur du biome (`speed` dans `data/world.json`) |

Une case de ressource vidée disparaît ; si la ressource est renouvelable, elle repousse au même endroit après `regrowTicks` cycles (baies : 2 jours, 3 depuis le village).

## Le village : maisons, nuits et repas (décision 0026)

**Maison**. L'abri est une construction de plusieurs cases :

- un anneau de **murs d'abri** et une **porte d'abri** ;
- chaque case intérieure est un **lit**, une place pour un dormeur.

Les tailles :

- Le plus petit abri (3 × 3) est un cercle de 8 cases, 7 murs et la porte, autour d'un lit.
- L'abri bâti par les colonies fait 4 × 3 : 9 murs, la porte et **2 lits**.
- Taille et pièces viennent de `data/recipes.json` (`footprint`, `wall`, `door`).

Murs et porte :

- Les murs arrêtent tout le monde.
- La porte laisse entrer les individus, pas les prédateurs : qui dort dans une maison est à l'abri.

Bâtir :

- Le bâtisseur se tient sur la case de la porte. La maison s'élève autour de lui, dans la première orientation qui tient.
- Il faut :
  - un sol praticable ;
  - aucune construction (une parcelle cède la place) ;
  - personne sur les murs ;
  - une allée libre d'une case tout autour.
- Ce qui poussait dessous est défriché pour de bon.
- Les colonies placent leurs maisons en rangées autour du camp (le plan du village, [06](06-ia.md)).
- Une colonie compte ses lits. Elle garde 15 % de lits d'avance : une naissance demande toujours un lit libre.

**Dormir**. L'individu choisit un **lit libre** en vue :

- dans une maison à deux lits, le premier arrivé prend celui du fond ;
- sinon, il va vers le lit de sa colonie le plus proche ;
- sinon, il dort dehors.

Deux dormeurs n'occupent jamais le même lit. Celui qui se réveille au fond de la maison passe en échangeant sa place avec le dormeur de l'entrée, sans le réveiller.

**La nuit est faite pour dormir**. La nuit, tout individu dort, sauf :

- le garde de veille ;
- celui qui fuit ;
- celui qui va d'abord boire ou manger ;
- celui que la soif ou la faim tenaille (85).

Reposé, il ne se lève qu'au petit jour.

**Une case par individu**. Deux individus ne se tiennent jamais sur la même case : ils se contournent ([06](06-ia.md), « Se contourner »). Une naissance demande une case libre à côté du parent.

**Repas réguliers**. Boire, manger et cueillir se font jusqu'au bout, sans s'interrompre pour une autre envie. La santé dépend de repas réguliers :

- elle ne remonte que si le dernier repas date de moins d'un jour ;
- après 1,5 jour sans repas, elle baisse de 30 par jour, même si la faim n'est pas encore critique.

## Vieillissement et mort

- Mort quand les PV atteignent 0.
- **Vieillesse** (J6) : chaque individu reçoit à la naissance une durée de vie tirée entre 54 et 66 jours (`agent.lifespanDays`, flux aléatoire du cycle de vie) ; il meurt de vieillesse en l'atteignant (« Mort de l'individu #n, de vieillesse »). Sans vieillesse, le savoir ne se perdait jamais vraiment : il fallait que les générations passent pour que les livres servent. Pas encore : perte progressive de vitesse et de mémoire avec l'âge.
- À la mort, la mémoire est perdue — sauf ce qui a été écrit. Écart : l'inventaire disparaît avec l'individu, livres et cartes portés compris, au lieu de tomber au sol.

## Journal de décisions

Chaque individu conserve ses 50 dernières décisions : cycle, objectif retenu, trois meilleurs scores concurrents, plan calculé, résultat (succès, échec, interruption). Le journal sert à l'inspection par l'observateur et au débogage.
