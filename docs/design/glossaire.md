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
| Rôle | Activité dominante d'un individu, déduite de ses habitudes | `role` |
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
| Meute | Groupe de prédateurs partis d'une même tanière (vision v2) | `pack` |
| Expédition | Groupe qui quitte sa colonie pour en fonder une autre (vision v2) | `expedition` |
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
