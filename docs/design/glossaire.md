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
| Âge sombre | Période où un savoir écrit a été perdu | `darkAge` |
| Projet | But à long terme décomposé en sous-tâches (HTN) | `project` |
| Simulation mentale | Évaluation de futurs possibles sur un modèle issu des croyances | `imagination` |
| Fiche sociale | Ce qu'un individu croit savoir d'un autre | `socialModel` |
| Expérience apprise | Estimations révisées à partir des résultats des actions | `learned` |
| Génome | Gènes qui paramètrent la personnalité de décision, mutés à chaque réplication | `genome` |
| Budget de réflexion | Unités de travail de l'IA allouées par cycle | `thinkBudget` |
| Penseur | Worker secondaire qui calcule des décisions | `thinker` |
| Graine | Nombre qui détermine tout le monde et les tirages | `seed` |
| Bloc gelé | Bloc sans individu proche, non simulé en détail | `frozen` |
