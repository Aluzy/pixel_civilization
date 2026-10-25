# 14 — Économie, métiers et richesses

> Chantier préparé après le J7 (décision 0020), implémenté en partie au J10 (décision 0023) : voir « Ce que fait le J10 » à la fin, qui prime sur les valeurs de départ 🟡 des sections précédentes.

Aujourd'hui tout ce qui est rapporté au camp est commun (la réserve), et les rôles ne sont que des habitudes affichées. L'économie ajoute la **propriété**, l'**échange** et des **métiers** choisis par intérêt : un pixel peut être agriculteur pendant qu'un autre lui achète sa récolte pour la transformer en plats plus nourrissants.

## Principes

1. **Croyances, pas omniscience** : chaque individu estime la valeur des biens d'après ce qu'il a vu (prix affichés au marché, échanges auxquels il a assisté, ce qu'il a lui-même dépensé). Il n'existe pas de « prix du monde ».
2. **Valeurs entières**, comme dans Ferme Familiale.
3. **La colonie mange d'abord** : la réserve commune reste (nourriture d'avance, matériaux des projets). Le marché s'ajoute, il ne la remplace pas.
4. **Tout est explicable** : chaque achat ou vente s'écrit au journal (« vend 6 blés à #12 pour 6 écus : il en offrait plus que ce que vaut mon blé pour moi »).

## Propriété

- L'inventaire d'un individu est à lui. Les biens déposés pour une tâche collective deviennent communs (comme aujourd'hui).
- Nouveau : un individu peut **stocker** chez lui (son abri compte comme coffre personnel, capacité 🟡 30 unités). Les héritages vont à ses répliques vivantes, sinon à la réserve commune.
- Le **trésor** de la colonie (or, pierres précieuses, objets rares) est un stock commun particulier, gardé dans une construction dédiée ([16-guerre-et-forteresses](16-guerre-et-forteresses.md)).

## Richesses : or et pierres précieuses

| Ressource 🟡 | Où | Outil | Usage |
| --- | --- | --- | --- |
| Or (pépites) | filons rares en montagne | pioche de cuivre | monnaie (écus), objets de prestige |
| Pierres précieuses (rouge, vert, bleu) | grottes et montagnes, très rares | pioche de cuivre | prestige, trésor, échanges de grande valeur |

- **Prérequis** : la fonderie et la pioche de cuivre doivent être atteignables dans une partie ordinaire, ce qui n'est pas encore le cas au J7 (le four n'a jamais été découvert). Rendre l'arbre technologique atteignable est la première tâche du J10.
- **Écu** : 1 pépite d'or fondue à la fonderie = 10 écus 🟡. L'écu est un bien portable sans autre usage : c'est la monnaie. Avant l'or, les échanges se font **en troc**.
- Les pierres précieuses n'ont pas de nutrition ni d'usage de fabrication : leur valeur vient seulement de ce que les autres en offrent, et du **prestige** (une composante d'harmonie possible, voir plus bas).
- **Au J12** (décision 0025) : l'or et les pierres précieuses s'extraient à la pioche de pierre ; leur prix de base est une valeur fixe (40 et 80 écus) ; le mineur les vend ; le comptoir les paie avec les écus qu'il a au-delà de 100 par membre ; ils sont gardés dans la salle du trésor avec les écus du comptoir ([16](16-guerre-et-forteresses.md), « Ce que fait le J12 »). La fonte en écus et le prestige restent à faire.

## Le marché

- **Construction « marché »** (étal de bois au camp). Un individu à l'étal peut poser une **offre** (« je vends 6 blés à 1 écu pièce ») ou une **demande** (« j'achète du pain jusqu'à 4 écus »). Les offres sont un petit carnet par colonie, lu et écrit au camp comme le tableau noir.
- **Appariement** : tous les 100 cycles, dans l'ordre des identifiants (déterminisme), une offre et une demande compatibles s'échangent au prix de l'offre la plus ancienne. Les biens et les écus passent d'un inventaire à l'autre (ou du coffre personnel s'il est au camp).
- **Prix de référence** affichés : pour chaque bien, la moyenne des derniers échanges. Règle inspirée de Ferme Familiale pour le marché de la colonie (le « comptoir », qui achète et vend sans contrepartie quand personne d'autre ne le fait) : prix d'achat = prix de vente × coefficient ; chaque unité achetée au comptoir ajoute 0,1 au coefficient, chaque unité vendue en retire 0,1, sans descendre sous 1,2 🟡. Le comptoir puise et verse dans la réserve commune : c'est ainsi que la colonie entière « achète » le surplus de ses agriculteurs.
- **Troc** avant l'or : deux individus au repos peuvent échanger directement des biens qu'ils estiment de valeur égale (comme la transmission orale, mais avec des biens).

## Métiers

- Un **métier** est un choix explicite (agriculteur, meunier, boulanger, cuisinier, mineur, forgeron, bâtisseur, scribe, soldat…), pris pour plusieurs jours, avec une inertie (on n'en change pas sur un coup de tête).
- **Avantage comparatif** : chaque individu estime, pour chaque métier qu'il sait faire, son **revenu attendu par jour** = (prix de référence du produit × ce qu'il en produit par jour d'après son expérience) − coût des intrants. L'expérience apprise du J7 (coût réel par unité) en est la base. Il choisit le meilleur, pondéré par ses gènes (un pixel sociable préfère les métiers de service, un pixel curieux l'invention).
- **Exemple visé** : #4 cultive du blé (rapide, il a appris que le blé lui coûte peu), le vend 1 écu ; #9 l'achète, le moud et cuit du pain qu'il vend 8 écus ; #4 achète du pain parce qu'un pain le nourrit plus que 6 blés crus. Les deux y gagnent : c'est l'économie.
- Les **besoins** restent prioritaires : un boulanger affamé mange avant de travailler, et achète s'il n'a rien.
- L'**héritage du métier** : une réplique commence avec la préférence de son parent pour ses premiers jours (apprentissage), puis choisit seule.

## Ce que l'économie apporte au reste

- **Agriculture** ([13](13-agriculture-cuisine.md)) : l'agriculteur vend, le cuisinier transforme.
- **Guerre** ([16](16-guerre-et-forteresses.md)) : les soldats sont payés par la colonie (le comptoir), le trésor attire les pillards.
- **Colonies** ([15](15-colonies-et-migration.md)) : le commerce entre colonies, les caravanes.
- **Harmonie** : nouvelle composante possible **prospérité** (richesse moyenne et inégalités : un indice de Gini sur les écus, calculable sans logarithme).

## Données à créer

- `data/resources.json` : or, pierres précieuses ; `data/recipes.json` : écu (fonderie), marché, étal.
- `data/jobs.json` : métiers (recettes ou ressources produites, stations, intrants).
- `data/balance.json` → `economy` : coefficient plancher, pas du coefficient, intervalle d'appariement, inertie d'un métier, taille du coffre personnel.

## Critère de sortie proposé (J10)

Dans une partie ordinaire, au moins 4 métiers coexistent au jour 100 ; la chaîne agriculteur → meunier ou boulanger → acheteur de pain est observable dans la chronique et l'inspecteur ; le prix de référence d'un bien monte quand il se raréfie et baisse quand il abonde.

## Ce que fait le J10

Implémenté au J10 (décision 0023). Là où il s'écarte des sections précédentes, c'est ce qui suit qui vaut.

**Arbre technologique rendu atteignable** (`src/sim/crafting/notebook.js`, `src/sim/agents/behaviors.js`, `work.js`) :

- **Carnet d'essais de la colonie** : les essais ratés de ses chercheurs (l'inventeur, les cuisiniers), sans oubli, passent d'un inventeur au suivant (2 048 entrées, les plus anciennes chassées d'abord).
- **Objectif Inventer** (savoir, 0,55, pesé par la curiosité) pour l'inventeur, qui ne cherche plus seulement quand il est curieux. Payé 20 écus par jour.
- **Programme de l'inventeur**, après les outils qui ouvrent des matériaux :
  1. chaque matériau seul à une station qu'il n'a jamais vue servir (il n'y connaît aucune recette et n'a vu personne en faire) ;
  2. une fois sur deux, ce que l'on peut faire d'un matériau qu'aucune recette connue n'utilise, le plus facile à avoir d'abord : seul, puis avec un autre, puis avec deux (−3 par ingrédient en plus) ;
  3. sinon, essai libre : une combinaison avec au moins un matériau nouveau vaut +1,5, une seule fois.
- **Idées** : un chercheur qui fabrique un matériau nouveau pour lui (une brique), bâtit une station dont il ne sait rien (une fonderie) ou y essaie un matériau seul a une chance sur deux d'avoir l'idée d'un de leurs usages. L'idée ne porte que sur un usage dont il peut réunir les ingrédients ; elle vaut +3 à l'essai et s'oublie au bout de 3 jours ou une fois sue.
- **Stations au camp** : un membre bâtit les stations au camp, où tous les voient (le four de l'inventeur n'est plus perdu au loin).
- **La réserve fournit l'inventeur** : au camp, il prend ce que demande la station qu'il sait faire et n'a pas vue bâtie, et pour un ingrédient fabriqué que la réserve n'a pas, ce qu'il faut pour le faire (l'argile des briques). Il prend aussi 3 unités de chaque matériau qui lui manque.
- **Demandes** : un chercheur à qui il manque une ressource la demande au comptoir (12 unités) ; le prix monte, les mineurs l'apportent, au besoin en cherchant un gisement.

**Le comptoir** (`src/sim/economy/market.js`, `prices.js`) :

- Ce qui est apporté à la réserve est acheté au prix d'achat, partie entière du prix de référence. Cela vaut pour une tâche, une récolte, une fournée ou une vente libre.
- Ce qu'un membre prend pour lui est vendu au prix de vente : 1,2 × le prix de référence, arrondi au-dessus.
- Ce qui sert à la colonie est pris sans payer : matériaux d'un bâtiment, graines des champs, échantillons d'essai.
- **Prix de base** :
  - nourriture : ½ écu par point de nutrition, plus 2 écus par point de plaisir ;
  - ressource : 0,2 écu par cycle de récolte ;
  - bien fabriqué : ses ingrédients plus 0,2 écu par cycle de fabrication, au moins sa valeur nourrissante ;
  - sous-produit (graine, peau) : la valeur de sa source.

  Exemples : blé 3, baies 6, bois 6, pierre 8, farine 15, pain 36.
- **Prix de référence** :
  - chaque matin, il fait 30 % du chemin vers base × rareté ;
  - rareté = √((3 × usage quotidien + besoins des projets + demandes + 1) / (stock + 1)), entre 0,2 et 8 ;
  - l'usage est la moyenne glissante (pas 0,3) de ce qui sort de la réserve chaque jour.
- **Écus** : le comptoir ne paie qu'avec sa caisse. Chaque matin, il frappe ce qui manque pour que la colonie détienne 200 écus par membre. Le fondateur part avec 30 écus.
- **Manger** :
  - un membre affamé achète au comptoir la nourriture qui lui donne le plus pour ses écus : nutrition × (1 + 0,1 × plaisir) / prix ;
  - ce qu'il ne peut pas payer, la colonie le lui donne, sous forme de la nourriture la moins chère pour ce qu'elle nourrit (une ration) ;
  - les riches mangent du pain, les pauvres du grain.
- **Propriété** :
  - les écus d'un mort vont à ses enfants vivants (à parts égales), sinon au comptoir ;
  - une réplique reçoit 30 % des écus de son parent.
- **Chronique** : la première vente et le premier achat de chaque bien au comptoir sont des événements. L'achat nomme le dernier vendeur : « Premier achat de pain au comptoir, par l'individu #22 : il venait de l'individu #34 ».

**Métiers** (`data/jobs.json`, `src/sim/economy/jobs.js`) :

| Métier | Ce qu'il fait | Il faut savoir | Gène qui y pousse |
| --- | --- | --- | --- |
| Agriculteur | Cultiver (vend grain et graines) | semer | prévoyance |
| Meunier | Cuisiner : farine | la farine | sociabilité |
| Boulanger | Cuisiner : pain, tarte, viande grillée | un de ces plats | sociabilité |
| Cueilleur | Tâches et ventes : baies, fibre | — | curiosité |
| Bûcheron | Tâches et ventes : bois | — | — |
| Mineur | Tâches et ventes : pierre, argile, charbon, cuivre, fer | — | — |
| Garde, inventeur, scribe | postes donnés par la colonie (20 écus par jour) | — | — |

- À partir de 12 membres, au camp, un membre choisit le métier qu'il sait faire et dont il attend le plus par jour :
  - d'un métier exercé, ce qu'il y a gagné, net de ses achats d'ingrédients (moyenne glissante, pas 0,3) ;
  - d'un autre, une estimation tirée des prix vus au comptoir et de son coût appris par unité. Pour la cuisine, la marge d'une tournée × 480 cycles de travail / (durée + 20).
- Le revenu attendu est multiplié par 1 + 0,4 × (gène − 0,5).
- **Inertie** : il garde son métier au moins 3 jours et n'en change que pour 20 % de plus, ou s'il ne sait plus le faire.
- **Apprentissage** : une réplique fait le métier de son parent ses 5 premiers jours.
- **Effets** :
  - le métier multiplie l'objectif de son travail par 1,3 et ceux des autres métiers par 0,7 ;
  - un poste de cuisine de recherche compte comme un métier ;
  - le choix d'une tâche collective double le score des biens de son métier ;
  - le meunier et le boulanger cuisinent sans poste, à la marge la plus grande qu'ils peuvent payer. S'ils ne gagnent rien, ils ne cuisinent pas ;
  - les postes de cuisine ne servent plus qu'à chercher ce qui se cuisine ;
  - sans tâche, un cueilleur, un bûcheron ou un mineur récolte le bien de son métier qui paie le mieux son travail et le vend au comptoir. Il fabrique d'abord la pioche qu'il sait faire.
- **Inspecteur** :
  - écus et métier ;
  - revenu attendu de chaque métier (« vécu » s'il l'a exercé) ;
  - derniers échanges ;
  - au bloc Colonie : caisse du comptoir, écus frappés, rations, membres par métier, prix d'achat et de vente de chaque bien.
- **Chronique** : le premier membre de chaque métier est un événement (filtres « important », « colonie » et nouveau filtre « économie »).

**Mesures** (10 graines, 100 jours) : voir la feuille de route ([11](11-feuille-de-route.md), J10).

**Reporté** : or et pierres précieuses (J12), coffre personnel et héritage des biens, troc et carnet d'offres et de demandes entre individus, prospérité dans l'harmonie, péremption, courbes de prix au tableau de bord.

**Au J11** ([15](15-colonies-et-migration.md), décision 0024) : un septième métier choisi, **marchand**, fait voyager des biens d'un comptoir de colonie à l'autre (caravanes), quand sa colonie en connaît une autre et ses prix.
