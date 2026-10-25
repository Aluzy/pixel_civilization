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

Au J4, le panneau ajoute : le plan GOAP en cours (« réunir 3 fibres › bâtir Établi › fabriquer Lance », coût estimé et nœuds explorés) ou « recette inconnue, il expérimente » ; le projet et son étape courante (▶) ; les recettes connues avec leur force et le nombre d'échecs retenus ; le multiplicateur d'arme et les prédateurs tués. L'inventaire nomme les objets. Les mémoires de constructions et de dangers apparaissent dans la liste et dans le calque M (danger en magenta). Les constructions sont peintes dans leur couleur et l'inspection d'une case les nomme ; les prédateurs sont des pixels rouge sombre dessinés au-dessus de l'ombre de la nuit.

Au J5, le panneau ajoute la génération, la lignée (fondateur ou réplique de #n, nombre de répliques), le rôle émergent, la tâche collective en cours (« apporter 5 Bois pour « Abri n°7 » »), les trois liens les plus forts et le risque imaginé d'un combat. Sous l'horloge, un bloc **Colonie** montre la population, les naissances et les morts, les abris et les lits, la réserve, chaque projet avec ce qu'il a et ce qu'il lui faut, ses contributeurs et son bâtisseur, et les auteurs du dernier abri.

Au J6, le panneau ajoute l'âge sur l'espérance de vie (« 12/58 j »), le rôle « scribe », et pour chaque livre porté les recettes écrites (pour une carte, le nombre de lieux). Le bloc **Colonie** ajoute chaque bibliothèque (position, abandonnée ou non, documents et recettes rangés), le scribe, et le savoir collectif : recettes connues et écrites, savoir perdu, recettes sauvées par un livre, recettes retrouvées.

## Sur téléphone

Sur un écran tactile sans souris, ou dans une fenêtre de moins de 820 pixels de large, une interface pour le pouce (`src/ui/phone-hud.js`, une couche HTML au-dessus du canevas) remplace les panneaux de bureau ; `?hud=phone` ou `?hud=desktop` dans l'adresse force l'une ou l'autre (décision 0015). Elle ne fait que lire les images envoyées par le Worker et envoyer les mêmes commandes que le clavier.

- **Bandeau du haut** : jour et heure, vitesse (effective si la machine ne suit pas), « auto », population.
- **Barre du bas**, cibles d'au moins 44 pixels : pause ou reprise, palier plus lent, palier courant (le toucher revient à ×1), palier plus rapide (jusqu'à Max), Aube, Événement suivant, Auto ; puis quatre onglets.
- **Onglets** (feuille qui monte au-dessus de la barre, défilable, fermée par ✕ ou en retouchant l'onglet) :
  - *Colonie* : le bloc Colonie du bureau ;
  - *Chronique* : les 60 derniers événements du filtre, du plus récent au plus ancien, et les filtres en boutons (ils choisissent aussi ce qui coupe l'accélération automatique) ;
  - *Fiche* : l'individu touché (le panneau complet) avec Suivre, Mémoire (le calque « ce qu'il croit savoir ») et Lâcher, ou la case touchée ;
  - *Plus* : zoom − et +, recentrer sur le camp, graine courante et version, charger une graine ou en tirer une au hasard, et la liste de toutes les commandes.
- **Bandeau d'alerte** : un événement important (ceux du filtre « important ») s'affiche 4 secondes au-dessus de la barre ; le toucher ouvre la chronique.
- **Toucher** : un doigt sélectionne un individu à moins de 24 pixels écran (au lieu de 1,2 case), toucher un individu ouvre sa fiche, toucher une case ouvre la fiche de la case. Glisser déplace, pincer zoome.
- La caméra centre l'individu suivi (et le camp quand on recentre) dans la partie de l'écran que la feuille et les barres laissent visible.

## Calques

Au J7, seul le calque de mémoire de l'individu sélectionné existe (touche M). Les calques de colonie (ressources connues, danger, territoire) restent à faire.

Activables séparément, superposés en semi-transparence : ressources connues de la colonie, danger, zones explorées, territoire et zones spécialisées, mémoire de l'individu sélectionné (ce qu'il croit savoir, comparé à la réalité).

## Tableau de bord

Au J7 (`src/ui/dashboard.js`) : la touche **H** ouvre un panneau à droite (l'onglet « Harmonie » sur téléphone) avec trois graphiques au fil des jours : l'harmonie (0 à 100, trait épais) et ses cinq composantes (0 à 1), la population, et pour chaque gène sa moyenne (trait) et sa dispersion (bande d'un écart-type), la valeur du fondateur en pointillés. Une phrase résume l'harmonie (« Harmonie 62 (J61 : 55) · point faible : savoir 0,00 ») et la plus forte dérive du génome. Couleurs d'Okabe et Ito (lisibles par les daltoniens), chaque graphique a une description textuelle pour les lecteurs d'écran. Le bloc Colonie ajoute l'harmonie et ses composantes, le point faible visé, les champs et les plants, et l'inventeur ; le panneau de l'individu ajoute son génome et ce qu'il a appris ; le bandeau du haut affiche l'harmonie. La chronique annonce les champs plantés.

Cible :

- Jour, heure, vitesse effective.
- Population, naissances et morts.
- Score d'harmonie et courbes de ses composantes.
- Recettes découvertes / connues / écrites / perdues.
- Évolution du génome : distribution de chaque gène dans la population au fil des jours.

## Chronique

Au J2, la chronique affiche les 6 derniers événements en bas à gauche : premier pas, première gorgée d'eau, premier repas, premier sommeil, santé critique, mort. Au J3 elle en montre 8 et ajoute les événements de mémoire : lieu oublié, croyance fausse, recherche sans savoir où, lieu introuvable, lieu redécouvert. Au J4 : recette découverte ou oubliée, objet fabriqué, construction bâtie, première nuit à l'abri, projet achevé, attaque d'un prédateur, prédateur tué. Au J5 : naissance d'une réplique, recette apprise de vive voix ou en regardant faire, recette mal comprise, première contribution à la réserve, abri bâti par la colonie avec le nombre de contributeurs. La touche **C** fait défiler trois filtres (tout, important, colonie) ; la touche **T** active l'accélération automatique (`src/worker/auto-speed.js`) : un palier de plus après 10 s réelles sans alerte, retour à ×1 dès qu'un événement du filtre courant survient (les événements importants quand le filtre est « tout »). Choisir une vitesse ou mettre en pause la désactive. Au J6 : recette écrite ou apprise dans un livre, bibliothèque qui brûle ou qui est abandonnée, savoir perdu ou retrouvé, mort de vieillesse ; un quatrième filtre « savoir » (touche C) réunit découvertes, transmissions, erreurs, oublis, écriture, lecture, incendies, abandons et savoir perdu ou retrouvé. Incendie et savoir perdu ou retrouvé sont aussi des événements importants. Au J8 : prise de garde, abri isolé forcé par une meute, tanière détruite, mort tuée par un prédateur ; un cinquième filtre « danger » réunit attaques, prédateurs tués, morts, santé critique, tanières détruites, abris forcés et gardes (abri forcé et tanière détruite sont importants). Le panneau de l'individu affiche sa jauge de Peur, sa compétence de combat, son armure et son rôle de garde ; le bloc Colonie, ses gardes. Au J9 : première parcelle, première moisson et premier plat de la colonie (filtres « important » et « colonie ») ; le bloc Colonie ajoute les parcelles, les moissons, la part de la nourriture venue des cultures la veille, les plats mangés et les cuisiniers ; le journal de l'individu nomme le travail aux champs et la cuisine ; un blé mûr se voit sur sa parcelle. Au J10 : premier membre de chaque métier (filtres « important », « colonie » et « économie »), première vente et premier achat de chaque bien au comptoir, l'achat nommant celui qui l'avait apporté (« Premier achat de pain au comptoir, par l'individu #22 : il venait de l'individu #34 ») ; un sixième filtre « économie » réunit métiers, ventes, achats, premières contributions, moisson et premier plat. Le panneau de l'individu ajoute ses écus, son métier et depuis quand, le revenu qu'il attend de chaque métier (« vécu » s'il l'a exercé) et ses derniers échanges ; son rôle devient son métier. Le bloc Colonie ajoute le comptoir (caisse, écus frappés, rations données), les membres par métier et les prix d'achat et de vente de chaque bien avec son stock. Au J11 : expédition annoncée, colonie fondée (importante) et première caravane de chaque route (importante) ; le bloc Colonie montre la colonie de l'individu sélectionné (la première sinon) avec la liste des colonies, sa filiation, son expédition ou son éclaireur et une ligne par colonie connue (parenté, camp, rencontres, caravanes) ; le panneau de l'individu nomme sa colonie (si ce n'est pas la première) et sa caravane ; le journal nomme la migration et la caravane ; recentrer sur le camp vise le camp de la colonie affichée. Au J12 : enceinte décidée et enceinte fermée (filtres « important », « colonie » et « danger »), salle du trésor, enceinte et tour achevées ; le bloc Colonie montre le trésor (écus, or, pierres précieuses, valeur), l'enceinte (pans bâtis, jour de fermeture, porte, tour, intrusions de prédateurs) et le danger ressenti au camp ; murs, porte, tour et salle du trésor se voient sur la carte avec leur couleur.

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

Au J7 : palette d'Okabe et Ito pour les courbes, descriptions textuelles des graphiques, commandes au doigt sur téléphone. Pas encore : motifs par type, taille du texte réglable, navigation complète au clavier dans les panneaux.

- Palette vérifiée pour les daltonismes courants ; motifs par type aux zooms élevés.
- Taille du texte de l'interface réglable.
- Tous les contrôles accessibles au clavier.
