# 08 — Interface d'observation

Le joueur observe sans intervenir. L'interface sert à comprendre ce qui se passe, et à ne jamais attendre.

## Caméra

- Déplacement libre : glisser à la souris ou au doigt, flèches, ZQSD ou WASD (vitesse constante à l'écran quel que soit le zoom).
- Zoom par paliers ×1, ×2, ×3, ×4, ×6, ×8, ×12, ×16 (1 case = N pixels écran), à la molette (centré sur le curseur), au pincement ou avec + et −. Départ à ×8, centré sur l'individu.
- Un clic (sans glisser) inspecte une case : elle est encadrée et le panneau en haut à droite affiche coordonnées, biome, ressource, quantité et altitude.
- Rendu net, sans lissage (`pixelArt: true`).
- Option « suivre » : la caméra suit l'individu sélectionné.

## Contrôle du temps

L'observateur accélère librement ; le jeu le ramène à vitesse normale quand quelque chose d'intéressant se produit.

Touches d'observation : F suivre l'individu, M calque de sa mémoire, Échap désélectionner.

| Commande | Effet | Raccourci |
| --- | --- | --- |
| Pause | Arrête la simulation, l'inspection reste possible | Espace |
| Paliers | ×1, ×4, ×16, ×64, ×256, Max | 1 à 6 |
| Saut à l'événement | Pleine vitesse jusqu'au prochain événement marquant, puis ×1 | N |
| Jusqu'à l'aube | Pleine vitesse jusqu'à la prochaine aube | L |
| Jusqu'au jour… | Pleine vitesse jusqu'à un jour choisi | — |
| Accélération automatique | Option : +1 palier après 10 s réelles sans événement ; retour à ×1 à chaque événement | T |

- **Filtres d'alerte** : l'observateur choisit les types d'événements qui interrompent l'accélération (découverte, réplication, mort, attaque, âge sombre…).
- **Rendu allégé** : au-delà de ×64, l'écran se rafraîchit 10 fois par seconde sans interpolation ; en mode Max, seuls le tableau de bord et la chronique sont mis à jour.
- **Vitesse effective** : si la machine ne suit pas la vitesse demandée, l'interface affiche la vitesse réellement atteinte.

Le raccourci « jusqu'à l'aube » est L (lever du jour) et non A, déjà utilisé pour déplacer la caméra (WASD).

## Inspection

Implémenté au J2 et au J3 : un clic à moins de 1,2 case d'un individu le sélectionne (sinon la case est inspectée). Au J3, le panneau liste aussi la mémoire (« Mémoire 12/20 ») et ses 5 lieux les plus forts avec une barre de force et la date de dernière observation. La touche M affiche le calque « ce qu'il croit savoir » : les zones explorées (plus claires quand elles sont récentes) et un carré par lieu mémorisé, dans la couleur de sa ressource (bleu clair pour l'eau), d'autant plus net que le souvenir est fort. Le panneau montre PV, faim, soif, fatigue et curiosité en barres, l'objectif et l'action en cours, ce qu'il porte, le nombre de lieux connus, et ses 4 dernières décisions avec les trois meilleurs objectifs et leurs scores. F fait suivre l'individu par la caméra, Échap désélectionne.

Clic sur un individu → panneau latéral (cible complète) :

- attributs, jauges (barres), inventaire ;
- objectif en cours et plan (liste d'actions, action courante surlignée) ;
- mémoire : liste des souvenirs par type, avec une barre de force ; clic sur un lieu → la caméra s'y rend ;
- journal de décisions (scores des objectifs concurrents) ;
- projet à long terme en cours et sa décomposition ; options imaginées par la simulation mentale et leur valeur ;
- fiches sur les autres individus (compétences, intention présumée, fiabilité, affinité) ;
- estimations apprises (« forêt nord dangereuse : 7 attaques en 20 passages ») ;
- génome de décision, comparé à la moyenne de la population ;
- filiation (parent, réplications).

Clic sur un bâtiment → contenu (stock, livres et cartes d'une bibliothèque). Clic sur une case → biome, ressource, quantité.

## Calques

Activables séparément, superposés en semi-transparence : ressources connues de la colonie, danger, zones explorées, territoire et zones spécialisées, mémoire de l'individu sélectionné (ce qu'il croit savoir, comparé à la réalité).

## Tableau de bord

- Jour, heure, vitesse effective.
- Population, naissances et morts.
- Score d'harmonie et courbes de ses composantes.
- Recettes découvertes / connues / écrites / perdues.
- Évolution du génome : distribution de chaque gène dans la population au fil des jours.

## Chronique

Au J2, la chronique affiche les 6 derniers événements en bas à gauche : premier pas, première gorgée d'eau, premier repas, premier sommeil, santé critique, mort. Au J3 elle en montre 8 et ajoute les événements de mémoire : lieu oublié, croyance fausse, recherche sans savoir où, lieu introuvable, lieu redécouvert.

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
