# 0026 — Le village : maisons à lits, une case par individu, nuits, repas, sentiers, grande enceinte

- **Date** : 2026-10-26
- **Statut** : acceptée
- **Documents concernés** : `docs/design/02-monde.md`, `03-individu.md`, `04-fabrication.md`, `06-ia.md`, `08-interface.md`, `09-architecture.md`, `11-feuille-de-route.md`, `13-agriculture-cuisine.md`, `15-colonies-et-migration.md`, `16-guerre-et-forteresses.md`, glossaire

## Contexte

Mise à jour majeure demandée entre le J12 et le J13 :

- un abri est un cercle de murs : 8 cases autour d'une place, moins une pour la porte ;
- un abri qui fait dormir deux individus a deux places ;
- deux individus ne se superposent pas : ils se contournent ;
- l'enceinte doit accueillir toutes les habitations, elle est donc bien plus grande ;
- les individus modifient durablement leur environnement ;
- une baie récoltée ne repousse pas avant 3 jours ;
- les individus dorment la nuit, et les gardes peuvent veiller du haut des tours ;
- il faut manger régulièrement pour garder une bonne santé.

Jusqu'ici, un abri était une case de 4 lits que tous partageaient, et plusieurs individus pouvaient occuper la même case.

## Décision

**Maison** (`src/sim/colony/house.js`, `data/recipes.json`) :

- L'abri a une **emprise** : un rectangle dont le bord est fait de **murs d'abri** et d'une **porte d'abri**, et dont chaque case intérieure est un **lit** (une place).
  - 3 × 3 : 8 cases, 7 murs et la porte, 1 lit.
  - L'abri des colonies fait 4 × 3 : 9 murs, la porte, 2 lits.
- Les murs arrêtent tout le monde. La porte laisse passer les individus, pas les prédateurs.
- Le bâtisseur se tient sur la case de la porte. La maison s'élève autour de lui dans la première des quatre orientations qui tient.
  - Il faut de la terre praticable, aucune construction (une parcelle cède la place) et personne sur les murs.
  - Il faut aussi une allée libre d'une case tout autour, et rien sur l'anneau d'une enceinte.
- Ce qui poussait sous la maison est défriché et ne repousse plus.
- Une colonie compte ses **lits** (et non plus « 4 lits par abri »).
  - Elle ouvre des projets d'abri pour garder 15 % de lits d'avance.
  - Elle en mène 1 à la fois, plus 1 par tranche de 15 membres.
- Coût : 8 bois, 4 fibres, 2 pierres.
- **Plan du village** : la colonie place ses maisons en rangées autour du camp.
  - Une maison et son allée occupent 5 × 4 cases, la porte au sud.
  - La place la plus proche du camp vient d'abord, hors du cœur du camp (2 cases).
  - S'il y a une enceinte, les maisons vont à l'intérieur.
  - Quand les rangées sont pleines, une maison va là où elle tient.
- Un individu seul (le fondateur, une expédition) choisit sa porte dans ce qu'il voit, à 4 cases environ de ce qu'il a bâti ou de l'eau.
- Le camp d'une colonie est la case devant la porte de sa première maison.
- La maison se retient par ses lits : murs et porte n'entrent pas dans la mémoire, sinon ils chassaient le souvenir de l'eau.

**Dormir** :

- Un individu dort sur un **lit libre** en vue. Dans une maison à deux lits, le premier prend le lit du fond.
- Sinon il va vers le lit de sa colonie le plus proche hors de vue, à 80 cases au plus.
- Sinon il dort dehors.
- Un dormeur ne s'écarte pas de son lit. Un individu coincé au fond de la maison échange sa place avec lui, sans le réveiller.
- **La nuit est faite pour dormir** : la nuit, tout individu dort.
  - Font exception le garde de veille, celui qui fuit, et celui qui va boire ou manger d'abord.
  - Celui que la soif ou la faim tenaille (85) est aussi réveillé.
  - Reposé, il ne se lève qu'à la fin de la nuit.
- Le garde veille du haut de la **tour libre la plus proche**. Il y voit plus loin et frappe mieux.

**Une case par individu** (`src/sim/world/chunk.js`, `chunk-store.js`, `agents/actions.js`, `agents/navigation.js`) :

- Chaque case connaît l'individu qui s'y tient. C'est une couche dérivée des positions : ni hachée ni sauvegardée.
- Pas à pas :
  - L'individu qui trouve la case suivante occupée attend.
  - Si l'autre veut sa case (face à face, dans une porte ou une allée), ils se croisent : les deux pas ont lieu ensemble.
  - Après 3 cycles d'attente, celui qui se tient dans le chemin s'écarte d'une case. Cela vaut pour celui qui ne fait rien, et pour quiconque se tient dans un passage (porte d'enceinte, porte d'abri). Celui qui travaille sur sa case (cueillir, boire, récolter) ne s'écarte pas.
  - Après 6 cycles, le marcheur replanifie.
- Recherche de chemin :
  - Une case où quelqu'un marche coûte 3 de plus.
  - Une case où quelqu'un se tient coûte 9 de plus. On peut y passer, mais elle n'est jamais une destination.
  - Un dormeur dans un lit est infranchissable, sauf pour qui est déjà dans la maison.
- Quand tous les bords d'eau (ou tous les buissons) en vue sont occupés, l'individu attend son tour au lieu de croire son souvenir faux.
- Celui qu'un dormeur enferme attend sans oublier ce qu'il sait.
- Une naissance demande une case libre à côté du parent.

**Repas et santé** :

- Boire, manger et cueillir vont jusqu'au bout. Ces actions ne sont plus reconsidérées toutes les 10 cycles : un repas se prend en entier, et l'individu ne repart plus avec la moitié de sa soif.
- On boit deux fois plus vite (4 par cycle) : les berges du camp ne restent plus encombrées.
- La santé ne remonte que si le dernier repas date de moins d'un jour.
- Après 1,5 jour sans repas, elle baisse de 30 par jour, même sans faim critique.
- Un membre qui ne connaît ni eau ni nourriture rentre au camp lire le tableau noir avant d'errer.

**Baies** : 3 jours de repousse (au lieu de 2).

**Terre transformée** :

- Les cases les plus foulées deviennent des **sentiers**, pour de bon : 60 passages suffisent.
  - On y marche 1,25 fois plus vite, et la recherche de chemin les préfère.
  - Ils se voient sur la carte, en plus terreux.
- Une ressource renouvelable ne repousse pas sous une construction (maison, mur).

**Grande enceinte** (`src/sim/colony/fortress.js`) :

- L'enceinte entoure :
  - la salle du trésor ;
  - les stations et bibliothèques à 12 cases du trésor ;
  - **toutes les maisons** de la colonie.
- Elle est agrandie d'un côté à la fois, jusqu'à loger les maisons de 80 membres, sans dépasser 64 cases de côté.
- **Une tour à côté de chaque porte**, bâties une à une après la fermeture.
- Les parcelles se font **hors les murs**, à 20 cases au plus de l'enceinte (du camp tant qu'il n'y en a pas).
- Une parcelle déjà dans l'enceinte cède la place à une maison.

**Migration** : l'expédition est pensée dès 30 membres (au lieu de 100), et pleinement à 70 (au lieu de 250). Un village enclos loge 60 à 100 individus : au-delà, une colonie essaime.

**Naissances** :

- la réserve freine les naissances dès 20 membres (au lieu de 40) ;
- elle doit tenir 2 portions par membre (au lieu de 1) ;
- « nourri » veut dire une faim sous 40 (au lieu de 30) pendant 600 cycles, sinon un repas pris en entier ne laissait presque jamais le temps de l'être.
- Sans ces freins, la population dépassait ce que la terre nourrit (les baies repoussent moins vite), et la famine faisait abandonner l'arrosage des champs.
- Une colonie renonce aux projets d'abri pas encore commencés quand elle a de nouveau assez de lits.

**Un individu au repos se repose de nouveau la question** de ce qu'il fait, toutes les 10 cycles.

- Avant, une action « se reposer » durait tant que l'objectif ne changeait pas.
- Un individu qui n'avait pas trouvé de bord d'eau libre restait planté jusqu'à mourir de soif.

## Conséquences

- La population croît plus vite au début, mais plafonne plus bas :
  - deux lits par maison ;
  - une nuit entière de sommeil ;
  - une enceinte qui borne le village.
  - L'essaimage en tient compte. Mesures : feuille de route ([11](../design/11-feuille-de-route.md), « Le village »).
- Le calcul augmente : chaque décision lit l'occupation des cases, et les individus au repos décident plus souvent.
- Les graines de démonstration des tests changent, car le monde évolue autrement.
- Valeurs de `data/balance.json` :
  - `actions.waitTicks` (6) et `actions.crowdCost` (3) ;
  - `needs.mealDays` (1), `needs.fastDays` (1,5) et `needs.fastDamagePerDay` (30) ;
  - `colony.houseCore` (2), `colony.houseRange` (30) et `colony.bedMargin` (0,15) ;
  - `colony.membersPerShelterProject` passe de 30 à 15 ;
  - `colony.bedsPerShelter` est supprimé : les lits viennent de l'emprise ;
  - `trails` (60 passages, ×1,25) ;
  - `fortress.maxSide` passe de 40 à 64 ;
  - `fortress.homesFor` (80) ;
  - `fortress.towerGuards` est supprimé (inutilisé) ;
  - `migration.minMembers` passe à 30 et `migration.fullMembers` à 70 ;
  - `actions.drinkPerTick` passe de 2 à 4 ;
  - `replication.fedBelow` passe de 30 à 40 ;
  - `replication.pantryPerMember` passe de 1 à 2 ;
  - `replication.reserveMembers` passe de 40 à 20.
- Reporté :
  - agrandir une enceinte pleine ;
  - les maisons de tailles diverses selon le nombre de dormeurs ;
  - l'usure des sentiers abandonnés ;
  - l'occupation des cases par les prédateurs.
