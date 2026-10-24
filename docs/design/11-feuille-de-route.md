# 11 — Feuille de route

Le développement avance en huit jalons. Chacun produit une version jouable publiée sur GitHub Pages. **Un jalon n'est commencé que lorsque le précédent remplit son critère de sortie.**

## J0 — Socle (`v0.1.0`)

- Projet Vite + Phaser 4, scripts npm, ESLint, Prettier, Vitest.
- Squelette `src/` et `data/` conforme à [09-architecture](09-architecture.md).
- Worker vide qui répond à `init` et renvoie des `frame`.
- Générateur à graine, hash d'état, test de déterminisme (même trivial).
- Workflows `deploy.yml` et `ci.yml`.

**Sortie** : la page s'affiche sur `https://aluzy.github.io/pixel_civilization/` avec la graine et la version.

## J1 — Monde (`v0.2.0`)

- Génération procédurale par blocs : bruit, biomes, ressources en amas.
- `data/resources.json` avec la palette.
- Rendu des blocs en textures, caméra, zoom, chargement et déchargement des blocs selon la vue.
- Inspection d'une case.

**Sortie** : on se déplace dans un monde de 2 048 × 2 048 cases à 60 images par seconde ; deux chargements avec la même graine montrent le même monde.

## J2 — Survie (`v0.3.0`)

- ECS, ordre des systèmes, horloge de cycles, jour/nuit.
- Un individu : jauges faim/soif/fatigue, récolte à mains nues, manger, boire, dormir.
- Utility AI avec les objectifs de survie ; actions simples sans GOAP (déplacement en ligne droite puis A* sur la grille).
- Contrôle du temps : pause, paliers, saut à l'aube, saut à l'événement, vitesse effective.
- Panneau d'inspection minimal, simulation headless.

**Sortie** : le pixel survit seul 10 jours de simulation sans intervention, et l'observateur atteint le jour 10 en moins d'une minute réelle.

## J3 — Mémoire et exploration (`v0.4.0`)

- Perception, mémoire limitée, force et oubli, croyances fausses.
- Cartes d'influence personnelles, exploration de la frontière.
- Inspecteur : mémoire avec barres de force, calque « ce qu'il croit savoir ».

**Sortie** : on voit le pixel oublier un lieu, échouer à le retrouver, puis le redécouvrir par exploration.

## J4 — Fabrication (`v0.5.0`)

- Stations, `data/recipes.json`, fabrication, construction de l'abri.
- Découverte par l'essai avec heuristique de curiosité, souvenirs d'échec.
- Planificateur GOAP complet, avec cache.
- Menaces : prédateurs ; combat ; objectifs Sécurité et Équipement.

**Sortie** : sans aide, le pixel découvre l'établi, une arme, un outil et construit un abri avant le jour 5 sur au moins 8 graines sur 10.

## J5 — Réplication et colonie (`v0.6.0`)

- Conditions et coût de réplication, mutations, naissance sans mémoire.
- Tableau noir collectif, générateurs de tâches, réservations, rôles émergents.
- Transmission orale et imitation.
- Chronique et filtres d'alerte, accélération automatique.

**Sortie** : une colonie d'au moins 20 individus reste stable (pas d'extinction, pas d'explosion) pendant 30 jours sur 8 graines sur 10.

## J6 — Écrit (`v0.7.0`)

- Papier, encre, scriptorium, cartes, livres, bibliothèques.
- Lecture par les nouveaux nés, incendies, abandon, âge sombre.

**Sortie** : une recette survit à la mort de celui qui l'a découverte grâce à un livre, et une partie montre au moins un savoir perdu puis redécouvert.

## J7 — Harmonie et finitions (`v1.0.0`)

- Score d'harmonie et ses composantes, tâches qui ciblent la composante la plus faible, aménagement du territoire.
- Tableau de bord avec courbes, calques complets, accessibilité.
- Arbre technologique complet (four, fonderie, métaux), équilibrage via la simulation headless, optimisations.

**Sortie** : une partie de 100 jours avec 500 individus reste fluide à ×16 et produit une chronique lisible ; le score d'harmonie progresse sur la majorité des graines testées.

## Après la v1 (pistes)

Colonies multiples qui se rencontrent, vieillissement, saisons, agriculture, son, sauvegarde et partage de parties.
