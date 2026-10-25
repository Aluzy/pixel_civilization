# 11 — Feuille de route

Le développement avance en huit jalons. Chacun produit une version jouable publiée sur GitHub Pages. **Un jalon n'est commencé que lorsque le précédent remplit son critère de sortie.**

L'IA monte en niveau au fil des jalons (niveaux définis dans [06-ia](06-ia.md)) :

| Jalon | Niveau d'IA ajouté |
| --- | --- |
| J2 | 1 — Utility AI |
| J3–J4 | 2 — GOAP et cartes d'influence |
| J4–J5 | 3 — Projets à long terme et simulation mentale |
| J5 | 4 — Modèle des autres et coopération |
| J7 | 5 et 6 — Apprentissage par l'expérience, génome et évolution |

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

Réalisé : survie 10 jours sur 60 graines sur 60 (test automatique sur 10 graines), jour 10 atteint en ~5 s à ×256. Ajouts non prévus : une mémoire minimale des lieux d'eau et de nourriture (sans elle, l'individu ne retrouvait pas l'eau), la repousse des ressources, une chronique partielle et le suivi de l'individu par la caméra.

## J3 — Mémoire et exploration (`v0.4.0`)

- Perception, mémoire limitée, force et oubli, croyances fausses.
- Cartes d'influence personnelles, exploration de la frontière.
- Inspecteur : mémoire avec barres de force, calque « ce qu'il croit savoir ».

**Sortie** : on voit le pixel oublier un lieu, échouer à le retrouver, puis le redécouvrir par exploration.

Réalisé : mémoire à force et oubli, souvenirs flous, carte d'exploration personnelle, calque M. La séquence complète est rare quand la mémoire fonctionne bien (le pixel n'oublie que des lieux lointains) : 3 graines sur 150 en 40 jours. Graine de démonstration : **47** — il oublie le point d'eau (8, −7) au jour 11, le cherche au jour 19 d'après un souvenir flou, ne le trouve pas, puis le redécouvre le soir même. Depuis le J4, le comportement a changé ; au J5 c'est la graine **20** qui sert de test : l'individu #14 oublie le point d'eau (−12, 7) au jour 10, ne le retrouve pas au jour 14, puis le retrouve quelques instants plus tard. Survie 10 jours : 99 graines sur 100.

## J4 — Fabrication (`v0.5.0`)

- Stations, `data/recipes.json`, fabrication, construction de l'abri.
- Découverte par l'essai avec heuristique de curiosité, souvenirs d'échec.
- Planificateur GOAP complet, avec cache.
- Budget de réflexion en unités de travail.
- Premiers projets à long terme (HTN) pour l'individu seul : abri, outils.
- Menaces : prédateurs ; combat ; objectifs Sécurité et Équipement.

**Sortie** : sans aide, le pixel découvre l'établi, une arme, un outil et construit un abri avant le jour 5 sur au moins 8 graines sur 10.

Réalisé : 10 graines sur 10 (graines 1 à 10, test automatique), 28 sur 30 sur les graines 11 à 40, entre 2,4 et 4,7 jours. Stations et abri posés sur une couche « construction » des blocs, découverte par l'essai guidée par ce que l'individu sait déjà, GOAP à rebours avec cache partagé et budget de 300 nœuds, premier projet HTN « S'installer », prédateurs, combat et fuite. L'individu survit 10 jours sur 30 graines sur 30 et 20 jours sur 40 sur 40. Ajouts non prévus : les minerais exigent une pioche (sans quoi les matériaux à combiner étaient trop nombreux), les actions de travail et le sommeil ne sont plus interrompus par les réévaluations périodiques. Reporté : couleur des produits dérivée des ingrédients, feu de camp et cuisson, défense de l'abri remplacée par une protection complète (décisions 0008 à 0010).

## J5 — Réplication et colonie (`v0.6.0`)

- Conditions et coût de réplication, mutations, naissance sans mémoire.
- Tableau noir collectif, générateurs de tâches, réservations, rôles émergents.
- Transmission orale et imitation.
- Projets de colonie sur le tableau noir ; simulation mentale pour les décisions stratégiques (site du camp, expéditions, fuir ou combattre).
- Modèle des autres : fiches sociales, coopération, spécialisation par avantage comparatif.
- Workers penseurs (parallélisme multi-cœurs) avec test d'égalité de hash entre K = 1 et K = 4.
- Chronique et filtres d'alerte, accélération automatique.

**Sortie** : une colonie d'au moins 20 individus reste stable (pas d'extinction, pas d'explosion) pendant 30 jours sur 8 graines sur 10, et l'inspecteur montre au moins un comportement préparatoire (stock constitué pour un projet) et une coopération à plusieurs.

Réalisé : 9 graines sur 10 (test automatique), avec 22 à 40 individus au jour 30 (la graine 10 en compte 18), aucune extinction et au plus 1 mort par graine. La population plafonne ensuite (42 à 70 individus vers les jours 50 à 60, sous le plafond de sécurité de 120). Sur 10 graines sur 10, des abris sont bâtis à plusieurs à partir d'une réserve remplie à l'avance, et le bloc Colonie le montre (matériaux réunis, contributeurs, bâtisseur). Ajouts : réplication régulée par les lits et la réserve, tableau noir des lieux, projets et tâches réservées, transmission orale et imitation, fiches sociales, rôles émergents, simulation mentale du combat, filtres de chronique et accélération automatique. Reporté : Workers penseurs et test K = 1 / K = 4 (décision 0012), simulation mentale du site du camp et des expéditions, spécialisation par avantage comparatif.

## J6 — Écrit (`v0.7.0`)

- Papier, encre, scriptorium, cartes, livres, bibliothèques.
- Lecture par les nouveaux nés, incendies, abandon, âge sombre.

**Sortie** : une recette survit à la mort de celui qui l'a découverte grâce à un livre, et une partie montre au moins un savoir perdu puis redécouvert.

Réalisé : la graine 8 montre les deux (test automatique) : l'établi est lu dans la bibliothèque au jour 59 après la mort de son découvreur, puis perdu au jour 83 (plus personne ne le sait, aucun livre à portée) et redécouvert par l'essai au jour 119. Sur 30 graines et 150 jours : une bibliothèque est bâtie dans 22 colonies (vers les jours 13 à 30), une recette est sauvée par un livre dans 17 (8 sur les graines 1 à 10), un savoir est perdu dans 26 et retrouvé dans 9 ; 15 parties voient au moins un incendie. Ajouts : documents à contenu propre (livres, cartes), un scribe par colonie, lecture prioritaire des nouveaux nés, cartes dessinées tous les 10 jours, abandon et incendie des bibliothèques, journal du savoir collectif, vieillesse (54 à 66 jours), un chercheur par projet sans recette connue, demander son chemin, essais guidés par la famille de recette (décisions 0013 et 0014). Les critères des jalons précédents tiennent : J4 sur 9 graines sur 10, J5 sur 8 graines sur 10. Reporté : bibliothèque en gabarit de plusieurs pixels, cartes consultées hors de la bibliothèque, copies de livres, déclin avec l'âge.

## J7 — Harmonie et finitions (`v1.0.0`)

- Score d'harmonie et ses composantes, tâches qui ciblent la composante la plus faible, aménagement du territoire.
- Tableau de bord avec courbes, calques complets, accessibilité.
- Arbre technologique complet (four, fonderie, métaux), équilibrage via la simulation headless, optimisations.
- Apprentissage par l'expérience (estimations bayésiennes simples, affichées dans l'inspecteur).
- Génome de décision hérité et muté ; graphiques de distribution des gènes.

**Sortie** : une partie de 100 jours avec 500 individus reste fluide à ×16 et produit une chronique lisible ; le score d'harmonie progresse sur la majorité des graines testées ; sur 100 jours, au moins un gène montre une dérive nette de sa moyenne dans la population.

Réalisé (en partie) :
- **Harmonie** : sur 10 graines et 100 jours, la moyenne des jours 91 à 100 dépasse celle des jours 11 à 20 sur 10 graines sur 10 (de 32 à 35 vers 38 à 69) ; test automatique sur 3 graines.
- **Génome** : sur les 10 mêmes parties, le gène qui a le plus dérivé s'écarte de 5,6 à 12,3 % de sa plage depuis le fondateur ; test automatique (au moins 5 %).
- **500 individus** : `npm run bench` fait vivre 500 fondateurs dans un monde aux baies abondantes (`data/bench.json`) pendant 100 jours ; un cycle coûte en moyenne 0,92 ms (pire jour 1,26 ms), loin des 6,25 ms qu'exige ×16 dans un navigateur ; la population reste à 484 jusqu'au jour 50, puis tombe vers 300 quand les fondateurs, nés le même jour, meurent de vieillesse. Une colonie née d'un seul pixel n'atteint pas 500 en 100 jours : elle compte 60 à 125 individus au jour 100, limitée par la réserve de nourriture d'avance qu'exige chaque naissance (décision 0011). Ce point du critère n'est donc vérifié que par la mesure, pas dans une partie ordinaire.
- **Ajouts** : score d'harmonie et ses cinq composantes, point faible au tableau noir et tâches qui le visent (champs, réserve, écrit), champs plantés près du camp, génome de 10 gènes hérité et muté, expérience apprise (danger des zones, coût réel des biens), inventeur, arbre technologique complet dans les données (four, brique, fonderie, lingots, outils et armes de cuivre et de fer), tableau de bord avec courbes (H, onglet Harmonie sur téléphone), outil de mesure (décisions 0016 à 0019).
- **Reporté** : découverte effective du four et des métaux (jamais observée en 120 à 160 jours sur 8 graines), calques de colonie, taille de texte réglable, coopération sur un grand bâtiment et spécialisation par avantage comparatif, coût réel des actions pour le GOAP.

## Après la v1 (pistes)

Colonies multiples qui se rencontrent, vieillissement, saisons, agriculture, livres de conseils (évolution culturelle), son, sauvegarde et partage de parties.
