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
