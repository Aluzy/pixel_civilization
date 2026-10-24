# 08 — Interface d'observation

Le joueur observe sans intervenir. L'interface sert à comprendre ce qui se passe, et à ne jamais attendre.

## Caméra

- Déplacement libre : glisser à la souris ou au doigt, flèches ou ZQSD/WASD.
- Zoom de ×1 (1 case = 1 pixel écran) à ×16 (1 case = 16 pixels écran), à la molette ou au pincement.
- Rendu net, sans lissage (`pixelArt: true`).
- Option « suivre » : la caméra suit l'individu sélectionné.

## Contrôle du temps

L'observateur accélère librement ; le jeu le ramène à vitesse normale quand quelque chose d'intéressant se produit.

| Commande | Effet | Raccourci |
| --- | --- | --- |
| Pause | Arrête la simulation, l'inspection reste possible | Espace |
| Paliers | ×1, ×4, ×16, ×64, ×256, Max | 1 à 6 |
| Saut à l'événement | Pleine vitesse jusqu'au prochain événement marquant, puis ×1 | N |
| Jusqu'à l'aube | Pleine vitesse jusqu'à la prochaine aube | A |
| Jusqu'au jour… | Pleine vitesse jusqu'à un jour choisi | — |
| Accélération automatique | Option : +1 palier après 10 s réelles sans événement ; retour à ×1 à chaque événement | T |

- **Filtres d'alerte** : l'observateur choisit les types d'événements qui interrompent l'accélération (découverte, réplication, mort, attaque, âge sombre…).
- **Rendu allégé** : au-delà de ×64, l'écran se rafraîchit 10 fois par seconde sans interpolation ; en mode Max, seuls le tableau de bord et la chronique sont mis à jour.
- **Vitesse effective** : si la machine ne suit pas la vitesse demandée, l'interface affiche la vitesse réellement atteinte.

## Inspection

Clic sur un individu → panneau latéral :

- attributs, jauges (barres), inventaire ;
- objectif en cours et plan (liste d'actions, action courante surlignée) ;
- mémoire : liste des souvenirs par type, avec une barre de force ; clic sur un lieu → la caméra s'y rend ;
- journal de décisions (scores des objectifs concurrents) ;
- filiation (parent, réplications).

Clic sur un bâtiment → contenu (stock, livres et cartes d'une bibliothèque). Clic sur une case → biome, ressource, quantité.

## Calques

Activables séparément, superposés en semi-transparence : ressources connues de la colonie, danger, zones explorées, territoire et zones spécialisées, mémoire de l'individu sélectionné (ce qu'il croit savoir, comparé à la réalité).

## Tableau de bord

- Jour, heure, vitesse effective.
- Population, naissances et morts.
- Score d'harmonie et courbes de ses composantes.
- Recettes découvertes / connues / écrites / perdues.

## Chronique

Fil d'événements générés automatiquement, horodatés en jour et heure de jeu :

- « Jour 1 : premier pas. »
- « Jour 3 : découverte de l'établi. »
- « Jour 12 : première hache de cuivre. »
- « Jour 40 : la bibliothèque a brûlé ; 4 recettes ne sont plus écrites nulle part. »

Clic sur un événement → pause et caméra sur le lieu.

## Graine et partie

- Écran de départ : graine aléatoire ou saisie, bouton « Commencer ».
- La graine et la version du jeu sont toujours visibles dans un coin de l'écran.
- Sauvegarde : question ouverte (voir [12-risques](12-risques.md)).

## Accessibilité

- Palette vérifiée pour les daltonismes courants ; motifs par type aux zooms élevés.
- Taille du texte de l'interface réglable.
- Tous les contrôles accessibles au clavier.
