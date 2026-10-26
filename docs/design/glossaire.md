# Glossaire

| Terme | Définition | Identifiant dans le code |
| --- | --- | --- |
| Individu | Pixel noir autonome | `agent` |
| Cycle | Pas de simulation (10 par seconde à ×1) | `tick` |
| Jour | 1 200 cycles | `day` |
| Bloc | Portion de 64 × 64 cases du monde | `chunk` |
| Case | Une cellule de la grille du monde | `tile` |
| Ressource | Matière récoltable représentée par une couleur | `resource` |
| Station | Pixel de transformation qui permet des recettes | `station` |
| Recette | Combinaison station + ingrédients → produit | `recipe` |
| Bien | Ressource ou objet qui peut être porté, avec un identifiant commun | `good` |
| Objet | Bien fabriqué (arme, outil), actif tant qu'il est porté | `item` |
| Construction | Station ou abri posé sur la couche `structure` d'un bloc | `structure` |
| Essai | Tentative station + ensemble de matériaux pour découvrir une recette | `trial` |
| Échec | Essai raté retenu en mémoire pour ne pas le refaire | `failure` |
| Prédateur | Menace qui chasse les individus hors abri | `threat` |
| Réserve | Biens déposés au camp d'une colonie | `stock` |
| Tâche | Part d'un projet de colonie (« apporter 5 bois ») | `task` |
| Réservation | Engagement d'un individu sur une tâche, libéré au bout de 2 jours | `reserved` |
| Réplique | Individu né de la réplication d'un autre | `child` |
| Rôle | Activité dominante d'un individu : son métier, sinon déduite de ses habitudes | `role` |
| Jauge | Niveau d'un besoin, de 0 (satisfait) à 100 (critique) | `need` |
| Souvenir | Élément de mémoire typé, avec une force | `memory` |
| Force (d'un souvenir) | Valeur de 0 à 1 qui décroît avec le temps | `strength` |
| Croyance | Ce que l'individu tient pour vrai, éventuellement périmé | `belief` |
| Objectif | But choisi par l'Utility AI | `goal` |
| Plan | Séquence d'actions produite par le GOAP | `plan` |
| Carte d'influence | Grille basse résolution de valeurs spatiales | `influenceMap` |
| Tableau noir | Mémoire partagée de la colonie, consultée au camp | `blackboard` |
| Colonie | Ensemble d'individus partageant un tableau noir | `colony` |
| Chronique | Fil d'événements marquants affiché à l'observateur | `chronicle` |
| Harmonie | Score composite de 0 à 100 | `harmony` |
| Âge sombre | Période où un savoir a été perdu : ni connu juste par un vivant, ni écrit dans un document accessible | `lostMask` |
| Document | Livre ou carte, objet porté ou rangé avec son propre contenu | `document` |
| Bibliothèque | Construction qui garde jusqu'à 50 documents de la colonie | `library` |
| Scribe | Membre chargé d'écrire pour la colonie (un à la fois) | `scribe` |
| Chercheur | Membre chargé de trouver par l'essai la recette d'un projet que personne ne connaît | `researcher` |
| Famille (de recette) | « structure » ou « item: » + type d'objet ; guide la ressemblance dans le choix des essais | `family` |
| Savoir sauvé par un livre | Recette lue après la mort de celui qui l'a découverte | `savedByBook` |
| Durée de vie | Âge auquel un individu meurt de vieillesse | `lifespan` |
| Point faible | Composante d'harmonie la plus basse, inscrite au tableau noir, que les tâches visent | `focus` |
| Champ | Sources d'une ressource renouvelable plantées ensemble près du camp | `field` |
| Inventeur | Membre chargé d'essayer librement de nouvelles combinaisons (un à la fois) | `inventor` |
| Fondateurs | Individus présents au départ : un seul en partie, plusieurs pour les mesures | `founders` |
| Parcelle | Pixel de terre labourée qui porte un plant (vision v2) | `plot` |
| Plant | Culture sur une parcelle, qui gagne un stade par jour arrosé (vision v2) | `crop` |
| Plat | Aliment cuisiné, nourrit 1,3 fois ses ingrédients (vision v2) | `dish` |
| Métier | Activité choisie par avantage comparatif, pour plusieurs jours (vision v2) | `job` |
| Écu | Monnaie, fondue à partir de l'or (vision v2) | `coin` |
| Comptoir | Acheteur et vendeur de la colonie au marché, à prix à coefficient (vision v2) | `counter` |
| Trésor | Or, écus, pierres précieuses et objets rares gardés par la colonie (vision v2) | `treasury` |
| Enceinte | Mur fermé avec porte autour du trésor et des abris (vision v2) | `wall` |
| Meute | Groupe de prédateurs partis d'une même tanière (J8) | `pack` |
| Tanière | Construction des prédateurs près d'une colonie, d'où part sa meute ; destructible (J8) | `den` |
| Peur | Jauge de 0 à 100 nourrie par le danger vécu ou vu, qui porte l'objectif Se cacher (J8) | `fear` |
| Compétence de combat | Expérience de 0 à 1 apprise à chaque coup, multiplie attaque et défense jusqu'à ×1,5 (J8) | `combatSkill` |
| Garde | Membre en poste qui veille la nuit et chasse les tanières connues (J8) | `guards` |
| Carcasse | Ressource laissée par un prédateur tué ; pourrit, donne une peau (J8) | `carcass` |
| Parcelle | Construction où pousse un plant semé ; arrosée chaque jour, elle donne du blé (J9) | `plot` |
| Graine | Bien trouvé en récoltant du blé, qui se sème (J9) | `seed` |
| Portion | Unité de nourriture de la réserve : 12 de nutrition, quel que soit l'aliment (J9) | `portion` |
| Cuisinier | Membre en poste qui transforme la réserve en farine et en plats (J9) ; au J10, les postes cherchent ce qui se cuisine, meuniers et boulangers font les fournées | `cooks` |
| Indice | Ce qu'un individu a deviné d'un bien (une graine se sème), qui oriente ses essais (J9) | `hint` |
| Comptoir | Marché d'une colonie au camp : achète ce qu'on apporte à la réserve, vend ce qu'on y prend pour soi (J10) | `colony.price`, `market.js` |
| Écu | Monnaie de compte d'une colonie, frappée par son comptoir pour garder 200 écus par membre (J10) | `coins` |
| Prix de référence | Prix d'un bien au comptoir : sa valeur de base fois sa rareté, revu chaque matin (J10) | `price` |
| Ration | Nourriture donnée par la colonie à un membre qui ne peut pas la payer (J10) | `rations` |
| Métier | Activité choisie pour plusieurs jours par le revenu qu'on en attend (agriculteur, meunier, boulanger, cueilleur, bûcheron, mineur) ; garde, inventeur et scribe sont des postes (J10) | `job` |
| Carnet d'essais | Essais ratés des chercheurs d'une colonie, transmis d'un inventeur à l'autre (J10) | `notebook` |
| Idée | Usage deviné d'un bien qu'un chercheur vient de fabriquer, essayé en priorité (J10) | `ideaStation`, `ideaMask` |
| Demande | Ressource qu'un chercheur demande au comptoir : son prix monte, les mineurs l'apportent (J10) | `demand` |
| Expédition | Groupe qui quitte sa colonie pour en fonder une autre ; menée par l'éclaireur qui a trouvé le site (J11) | `expState`, `expMembers` |
| Éclaireur | Membre qui cherche loin du camp un site pour une nouvelle colonie (J11) | `scout` |
| Colonie mère, colonie fille | Filiation : la colonie d'où est partie l'expédition qui a fondé une autre (J11) | `parent` |
| Fiche de relation | Ce qu'une colonie sait d'une autre : camp, parenté, rencontres, caravanes, prix (J11) | `relKnown`, `relTrades`… |
| Caravane | Voyage d'un marchand qui porte des biens d'un comptoir de colonie à l'autre (J11) | `caravanTo` |
| Marchand | Métier qui mène les caravanes (J11) | `merchant` |
| Salle du trésor | Construction de la colonie qui garde ses écus, son or et ses pierres précieuses (J12) | `treasury`, `hasTreasure` |
| Danger ressenti | Jours récents avec une attaque près du camp, qui s'effacent (×0,8 par jour) (J12) | `danger` |
| Enceinte | Anneau rectangulaire de palissade autour de la salle du trésor et de toutes les maisons, avec une porte par côté et une tour à côté de chaque porte (J12, décision 0026) | `encState`, `encX0`… |
| Porte | Pan de l'enceinte que les individus franchissent, pas les prédateurs (J12) | `gate` |
| Intrusion | Entrée d'un prédateur dans une enceinte fermée (attendu : aucune) (J12) | `breaches` |
| Raid | Troupe envoyée par une colonie piller une autre (vision v2) | `raid` |
| Projet | But à long terme décomposé en sous-tâches (HTN) | `project` |
| Simulation mentale | Évaluation de futurs possibles sur un modèle issu des croyances | `imagination` |
| Fiche sociale | Ce qu'un individu croit savoir d'un autre | `socialModel` |
| Expérience apprise | Estimations révisées à partir des résultats des actions (danger des zones, coût des biens) | `experience` |
| Génome | Gènes qui paramètrent la personnalité de décision, mutés à chaque réplication | `genome` |
| Budget de réflexion | Unités de travail de l'IA allouées par cycle | `thinkBudget` |
| Penseur | Worker secondaire qui calcule des décisions | `thinker` |
| Graine | Nombre qui détermine tout le monde et les tirages | `seed` |
| Bloc gelé | Bloc sans individu proche, non simulé en détail | `frozen` |
| Maison | Abri de plusieurs cases : un anneau de murs d'abri, une porte d'abri, un lit par case intérieure (décision 0026) | `house.js`, `footprint` |
| Lit | Case intérieure d'une maison : une place pour un dormeur ; une colonie compte ses lits | `bedX`, `bedY` |
| Plan du village | Rangées de maisons séparées par des allées, autour du camp, dans l'enceinte s'il y en a une | `planHouse` |
| Sentier | Case foulée 60 fois, devenue pour de bon plus rapide à parcourir | `wear`, `trails` |
| Occupant | L'individu qui se tient sur une case : deux individus ne partagent jamais une case | `occupant` |
| Canal | Case creusée depuis l'eau, où l'eau coule : on y boit, on y patauge, il irrigue les parcelles voisines ; les prédateurs ne le traversent pas (décision 0027) | `canal`, `canal.js` |
| Ouvrage | Projet de colonie fait d'une liste de cases à poser (pavé, mur de pierre, arbre, nouveau sol), posées une à une par n'importe quel membre (décision 0028) | `ProjectKind.WORKS`, `works.js` |
| Place, rues | Carré pavé au camp et pavés le long des quatre axes qui passent par lui | `plaza`, `streets` |
| Édifice | Bâtiment public de 3 × 3 aux coins de la place : temple, grenier, marché, monument | `edifice` |
| Beauté | Sixième composante de l'harmonie : pavage, pierre, édifices, arbres, fontaine | `Component.BEAUTY` |
| Poisson | Ressource renouvelable de l'eau peu profonde, prise depuis la berge | `fish` |
| Ponton | Ouvrage avancé sur l'eau, qu'on marche comme la terre | `pier` |
| Barque | Outil de pêche ; qui la porte avance sur l'eau | `boat` |
| Navire | Construction à quai ; les voyages de sa colonie avancent sur l'eau | `ship` |
| Outre-mer | Colonie fondée par une expédition qui a traversé l'eau | `overseas` |
| Tablette | Support d'écrit en argile, 3 recettes | `tablet` |
| Grande bibliothèque | Bibliothèque de pierre de 3 × 3 qui ne brûle pas | `great_library` |
| Maître | Membre qui enseigne une recette qu'il maîtrise, à l'école | `teacher` |
| Lassitude | Perte d'attrait d'un objectif dont les essais échouent | `weary` |
| Relais | Colonie fondée près d'une route, plus près des autres | `relay` |
| Halte | Arrêt d'une caravane chez une troisième colonie sur son chemin | `halt` |
| Quartier | Stations du même type proches, qui travaillent plus vite | `quarters` |
