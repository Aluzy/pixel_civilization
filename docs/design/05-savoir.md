# 05 — Mémoire et savoir

Le savoir existe à trois niveaux :

| Niveau | Support | Coût | Durée | Fiabilité |
| --- | --- | --- | --- | --- |
| Individuel | Mémoire | Nul | Volatile (oubli) | Croyances parfois périmées |
| Social | Parole, imitation | Nul | Volatile | Imprécise |
| Écrit | Cartes, livres, bibliothèques | Ressources et temps | Durable, mais destructible | Exacte à la date d'écriture |

## État au jalon J3

Implémenté dans `src/sim/agents/memory.js`, `perception.js`, `beliefs.js` et `systems/memory-system.js` ; constantes dans `data/balance.json` (`memory`).

- **Sujets** : l'eau et chaque ressource. À chaque perception, l'individu mémorise le lieu atteignable le plus proche de chaque sujet visible.
- **Capacité** : l'attribut Mémoire (20). Mémoire pleine : le nouveau lieu chasse le plus faible, s'il est plus faible que lui.
- **Saillance** (force initiale) : eau et nourriture 1, autres ressources 0,5.
- **Oubli** : `s(t) = s0 × e^(−(t − t0)/τ)`, τ initial 3 jours, oubli sous 0,1 (soit environ 7 jours sans revoir le lieu). L'exponentielle est calculée par `expNeg` (`src/sim/core/math.js`), identique sur tous les navigateurs (décision 0005). Balayage tous les 100 cycles.
- **Rafraîchissement** : revoir un lieu mémorisé (entièrement visible) le ramène au moins à sa saillance. Sa position reste celle du premier souvenir, pour éviter que deux souvenirs dérivent l'un sur l'autre.
- **Consolidation** : utiliser un lieu (boire, cueillir) le remet à 1 et multiplie τ par 1,5, dans la limite de 60 jours.
- **Souvenirs flous** (décision 0007) : un souvenir faible est rappelé à une position décalée, jusqu'à 12 cases pour un souvenir presque éteint. L'individu peut ainsi se rendre au mauvais endroit, ne rien y trouver et oublier le lieu (« ne retrouve pas »).
- **Lieux perdus** : les 8 derniers lieux oubliés sont gardés de côté. S'il revoit l'un d'eux encore valable, c'est une redécouverte.
- **Croyances fausses** : un lieu entièrement visible qui n'est plus valable est retiré (« se trompait »). Un buisson que l'individu vide lui-même est retiré sans bruit.
- **Chronique** : oubli, erreur, recherche sans savoir où, lieu introuvable, redécouverte, pour l'eau et la nourriture seulement, au plus une fois toutes les 600 cycles par type et par individu.

## État au jalon J4

- Recettes et échecs ont leur propre mémoire (`src/sim/crafting/recipe-book.js`), à côté des 20 emplacements de lieux : un emplacement par recette du catalogue et un anneau de 32 échecs (décision 0008). Même loi d'oubli : recettes τ = 10 jours, consolidées ×1,5 à chaque fabrication ; échecs τ = 5 jours. Une recette oubliée doit être redécouverte (événement « a oublié comment faire »).
- Les lieux comptent maintenant aussi les stations et constructions (force initiale 1, τ = 15 jours) et les dangers (prédateur vu : force 0,8, τ = 2 jours, jamais « corrigés » par la vue puisqu'un animal bouge).

## État au jalon J5

- **Transmission orale** (`src/sim/systems/social-system.js`) : tous les 40 cycles, un individu au repos (éveillé, inactif, en train de manger ou de boire) à côté d'un autre au repos échange avec lui une connaissance dans chaque sens. Une recette que l'autre ne connaît pas (tirée selon sa force), ou à défaut un lieu (tiré selon sa force, décalé de 0 à 3 cases). Tout entre en mémoire à force 0,5. Une recette a 10 % de chances d'être mal comprise : elle semble connue mais la fabrication échoue, gaspille la moitié des ingrédients et devient un échec retenu. La chronique annonce les recettes apprises et les erreurs.
- **Imitation** : quand une recette est réalisée, chaque individu éveillé qui voit la scène note la compétence du fabricant dans sa fiche et l'apprend avec une chance sur deux, à force 0,6 (il suffit d'être présent à la fin, pas pendant toute la fabrication).
- **Tableau noir** : au camp, au plus tous les 200 cycles, l'individu y inscrit les lieux dont il se souvient (sauf les dangers) et y lit les lieux des sujets dont il ne connaît aucun lieu (force 0,5). Les inscriptions de plus de 6 jours sont ignorées.
- Le camp de sa colonie et ses abris ne s'oublient pas : un membre sait toujours où est chez lui.

## État au jalon J6

Implémenté dans `src/sim/knowledge/` (documents, écriture, lecture, journal du savoir), `src/sim/systems/knowledge-system.js` (abandon, incendies, savoir collectif) et `src/sim/agents/scribe-work.js` ; constantes dans `data/balance.json` (`writing`).

- **Documents** : un livre ou une carte est un objet porté (un bien de l'inventaire) qui a son propre contenu dans `DocumentStore` (256 documents au plus) : recettes écrites (et celles écrites fausses), auteur, date, et pour une carte jusqu'à 100 lieux datés. Fabriquer un livre ou une carte crée un document vierge porté par son fabricant. Un document porté par un individu qui meurt disparaît avec lui.
- **Le scribe** : une bibliothèque debout, le premier membre qui passe au camp avec quelque chose à écrire devient le scribe de la colonie (un seul à la fois, pour 6 jours, puis la plume se remet en jeu). Seul le scribe a l'objectif « Écrire ». Sans livre, il en fabrique un (planification GOAP, et découverte par l'essai s'il ne sait pas comment : il pense alors qu'un livre se fait avec des matériaux fabriqués). Avec un livre qui a de la place, il va à la bibliothèque y écrire, une recette toutes les 50 cycles, ce qu'il sait et que la bibliothèque n'a pas, d'après ce qu'il y a vu. Il range ensuite ses écrits dans la bibliothèque.
- **On écrit ce qu'on croit** : une recette mal comprise est écrite fausse. À la lecture, elle n'est fausse que si aucun document de la bibliothèque ne la donne juste.
- **Cartes** : une fois ses recettes écrites, le scribe dessine une carte quand la bibliothèque n'en a pas, ou seulement une de plus de 10 jours (d'après sa dernière visite) : il recopie ses lieux connus (sauf les dangers), 5 cycles par lieu, puis la range. Écart : une carte portée ne sert pas encore de mémoire d'appoint pour la planification ; elle se lit à la bibliothèque.
- **Lecture** : l'objectif « Lire » s'active quand l'individu n'est jamais allé à la bibliothèque, ou quand il y a vu des recettes qu'il ne sait pas ; il est plus fort pendant les 5 premiers jours de vie (les nouveaux nés y vont en priorité, une fois leurs besoins couverts). À la bibliothèque, il apprend une recette toutes les 20 cycles, à force 1, puis lit les cartes : chaque lieu d'un sujet dont il ne connaît aucun lieu entre en mémoire à force 0,8.
- **Bibliothèque** : un pixel brun (pas encore un gabarit de plusieurs pixels) qui garde au plus 50 documents. C'est un projet de colonie dès 6 membres, comme l'abri : matériaux réunis dans la réserve, puis un membre qui connaît la recette la bâtit au camp. Si personne ne la connaît, un membre curieux est chargé de la chercher par l'essai (un seul chercheur par projet, pour 6 jours).
- **Abandon** : une bibliothèque dont aucun membre ne s'est approché à moins de 12 cases depuis 3 jours est abandonnée ; ses documents sont hors de portée jusqu'au retour de quelqu'un.
- **Incendie** : chaque jour, chaque bibliothèque a 1 % de chances de brûler (tirage du flux des dangers naturels). Le bâtiment et tous ses documents disparaissent.
- **Savoir collectif** : tous les 100 cycles, la simulation compte les recettes connues juste par un vivant et celles écrites juste dans un document accessible (porté par un vivant, ou dans une bibliothèque debout et non abandonnée). Une recette déjà découverte qui n'est ni l'un ni l'autre est **perdue** (« Savoir perdu » dans la chronique) ; si elle revient (redécouverte, imitation, bibliothèque retrouvée), elle est **retrouvée**. Le journal du savoir (`KnowledgeLog`) note aussi qui a découvert chaque recette, quand il est mort, et la première lecture de cette recette après sa mort : la recette a été **sauvée par un livre**. Ce journal n'est qu'observé, aucune décision ne le lit.
- **Demander son chemin** : un individu assoiffé ou affamé (jauge au-dessus de 50) qui n'est pas au repos interpelle un individu éveillé à 6 cases au plus ; celui-ci lui indique son meilleur lieu d'eau ou de nourriture (décalé de 0 à 3 cases, force 0,5). Au repos, un individu dans le besoin entend ce lieu en premier.

## Mémoire individuelle

### Souvenirs

Chaque souvenir est un enregistrement typé :

| Type | Contenu | Exemple |
| --- | --- | --- |
| `place` | Position, ressource, quantité estimée, cycle d'observation | Baies, (412, −88), ~15, cycle 3 600 |
| `recipe` | Identifiant de recette | `stone_axe` |
| `failure` | Station + ingrédients d'un essai raté | Four : baies + eau |
| `danger` | Position, type de menace, cycle | Prédateur, (430, −70), cycle 4 900 |
| `station` | Position et type d'une station ou d'un bâtiment | Bibliothèque, (400, −60) |

### Force et oubli

- Chaque souvenir a une **force** `s` entre 0 et 1.
- Elle décroît à chaque cycle selon une courbe exponentielle (Ebbinghaus) :

  `s(t) = s0 × exp(−(t − t0) / τ)`

  où `τ` dépend du type (`balance.json`). Valeurs de départ : lieux 3 jours, dangers 2 jours, échecs 5 jours, recettes 10 jours, stations 15 jours.
- Chaque **utilisation** (aller au lieu, réaliser la recette) remet `s` à 1 et multiplie `τ` de ce souvenir par 1,5 (consolidation).
- Sous le seuil 0,1, le souvenir est **oublié** (supprimé).
- Mémoire pleine : le nouveau souvenir remplace celui de plus faible force, sauf si le nouveau est encore plus faible.
- Pour des raisons de performance, la décroissance n'est pas calculée à chaque cycle : la force est évaluée à la demande à partir de `s0`, `t0` et `τ`, et un balayage d'oubli s'exécute tous les 100 cycles.

### Croyances fausses

Un souvenir de lieu peut être périmé (ressource épuisée). L'individu agit sur sa croyance ; en arrivant sur place il perçoit la réalité, corrige ou supprime le souvenir, et replanifie.

## Cartes

- Fabriquées au scriptorium (papier + encre).
- Une carte stocke jusqu'à **100** souvenirs de type `place`, `danger` ou `station`, avec leur cycle d'observation.
- Écrire une entrée : 5 cycles. Lire une carte entière : 2 cycles par entrée.
- Une carte se porte (1 emplacement d'inventaire) ou se range dans une bibliothèque.
- Un individu qui porte une carte peut la consulter n'importe où : les entrées de la carte comptent comme des souvenirs de force 0,8 pour la planification, sans occuper sa mémoire.
- Une carte vieillit : chaque entrée garde sa date ; l'IA tient compte de l'âge de l'information.

## Livres

- Fabriqués au scriptorium (papier ×3 + encre).
- Un livre stocke jusqu'à **10** recettes.
- Écrire une recette : 50 cycles. Lire une recette : 20 cycles ; elle entre en mémoire à force 1.
- Un individu ne peut écrire que ce qu'il sait. Une recette fausse (transmise oralement avec erreur) peut être écrite : les livres peuvent contenir des erreurs.

## Livres de conseils (après J7)

- Un individu expérimenté peut écrire une partie de son **expérience apprise** (voir [06-ia](06-ia.md), couche 7) : zones dangereuses ou fructueuses, coûts réels des actions.
- Un lecteur intègre ces estimations à force réduite, comme un a priori qu'il corrigera par sa propre expérience.
- Ils permettent une évolution culturelle plus rapide que l'évolution génétique.

## Bibliothèques

- Bâtiment composé (gabarit de pixels bruns et blanc cassé) qui contient jusqu'à 50 cartes et livres.
- Les réplications fraîchement nées y vont en priorité dès que leurs besoins de survie sont couverts.
- Un individu y dépose spontanément ce qu'il a écrit et y recopie les cartes à jour.
- Une bibliothèque peut **brûler** (incendie) ou être **abandonnée** (plus personne à proximité). Son contenu est alors perdu ou inaccessible.
- Conséquence possible : un **âge sombre**, où la colonie doit redécouvrir des recettes perdues. La chronique le signale.

## Transmission orale

- Deux individus adjacents et au repos peuvent échanger : chacun transmet un souvenir tiré au hasard, pondéré par sa force.
- Un lieu transmis est décalé de 0 à 3 cases. Une recette transmise a 10 % de chances d'être remplacée par une recette voisine erronée (qui échouera à l'usage et deviendra un échec).
- Un souvenir reçu oralement entre en mémoire à force 0,5.

## Savoir collectif (pour le score d'harmonie)

- **Savoir connu** : ensemble des recettes connues par au moins un individu vivant.
- **Savoir écrit** : ensemble des recettes présentes dans au moins un livre accessible.
- **Savoir perdu** : recettes déjà découvertes une fois, aujourd'hui ni connues ni écrites.
