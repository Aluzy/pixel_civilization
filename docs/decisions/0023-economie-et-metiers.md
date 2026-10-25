# 0023 — Économie et métiers : comptoir, écus, métiers par le revenu, arbre technologique atteignable

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/14-economie.md`, `04-fabrication.md`, `06-ia.md`, `08-interface.md`, `09-architecture.md`, `11-feuille-de-route.md`, glossaire

## Contexte

Le J10 doit rendre l'arbre technologique atteignable (four, fonderie, pioche de cuivre dans une partie ordinaire), introduire la propriété, la monnaie, un marché à prix de référence, et des métiers choisis par avantage comparatif. Critère de sortie : au jour 100 d'une partie ordinaire, au moins 4 métiers coexistent, la chaîne agriculteur → meunier ou boulanger → acheteur de pain est visible, les prix suivent la rareté.

Au J9, le four n'avait jamais été découvert : l'inventeur n'inventait que quand il était curieux, oubliait ses échecs (32 places, 5 jours), changeait tous les 12 jours, bâtissait ses stations n'importe où et allait chercher ses matériaux au loin.

## Décision

**Le comptoir.**

- Chaque colonie a un comptoir au camp. Ce que l'on apporte à la réserve (tâches, récoltes, cuisine, ventes libres) lui est vendu au prix d'achat, partie entière du prix de référence.
- Ce que l'on y prend pour soi (sa nourriture, les ingrédients de son métier) est payé au prix de vente : 1,2 × le prix de référence, arrondi au-dessus.
- Ce qui sert à la colonie est pris sans payer : matériaux d'un bâtiment, graines des champs, essais.
- **Pas de carnet d'offres et de demandes entre individus, pas de troc** pour l'instant. Tout passe par le comptoir, qui achète et revend comme le comptoir de Ferme Familiale. La « demande » existe sous une forme : un chercheur demande au comptoir le matériau qui lui manque.

**Le prix de référence.**

- Au départ, chaque bien vaut un prix de base (`economy` dans `data/balance.json`) :
  - une nourriture, ce qu'elle nourrit et le plaisir d'un plat ;
  - un matériau, le temps de sa récolte ;
  - un bien fabriqué, ses ingrédients et le temps de le faire ;
  - un sous-produit (graine, peau), ce que vaut sa source.
- Chaque matin, le prix fait un pas (30 %) vers base × rareté.
- La rareté est √((3 jours d'usage + besoins des projets + demandes + 1) / (stock + 1)), bornée entre 0,2 et 8. L'usage est la moyenne glissante de ce qui sort de la réserve chaque jour.
- Pas de coefficient qui bouge à chaque unité : l'écart fixe de 1,2 entre achat et vente en tient lieu.

**Les écus.**

- Une monnaie de compte de la colonie.
- Le comptoir ne paie qu'avec sa caisse : vide, il prend encore ce qu'on apporte, sans payer.
- Chaque matin, il frappe ce qui manque pour que la colonie (caisse et membres) détienne 200 écus par membre. Les écus ne sont jamais détruits.
- **Pas d'or** : il vient au J12 avec les trésors. Le fondateur part avec 30 écus.

**La propriété.**

- Les écus d'un individu sont à lui. À sa mort, ils vont à ses enfants vivants, à parts égales, sinon au comptoir.
- Une réplique reçoit 30 % des écus de son parent.
- **Pas de coffre personnel** : les biens portés restent perdus à la mort, comme avant.

**La nourriture.**

- Un individu affamé achète la nourriture qui lui en donne le plus pour ses écus : nutrition × (1 + 0,1 × plaisir), divisée par le prix.
- Ce qu'il ne peut pas payer, la colonie le lui donne : la nourriture la moins chère pour ce qu'elle nourrit (une ration). La colonie nourrit d'abord ses membres.

**Les métiers** (`data/jobs.json`).

- Métiers choisis : agriculteur, meunier, boulanger, cueilleur, bûcheron, mineur.
- Postes donnés par la colonie, payés 20 écus par jour : garde, inventeur, scribe.
- À partir de 12 membres, un membre au camp choisit le métier qu'il sait faire et qui lui promet le plus :
  - pour un métier qu'il a exercé, ce qu'il y a gagné, net de ses achats d'ingrédients, en moyenne glissante de ses jours ;
  - pour un autre, une estimation tirée des prix vus au comptoir et du coût appris d'une unité.
- Le choix est pesé par un gène (prévoyance pour l'agriculteur, sociabilité pour le meunier et le boulanger, curiosité pour le cueilleur).
- Il garde son métier 3 jours, n'en change que pour 20 % de plus, et une réplique fait le métier de son parent ses 5 premiers jours (apprentissage).
- Le métier pèse les objectifs : le sien × 1,3, ceux des autres métiers × 0,7.
- Le meunier et le boulanger cuisinent sans poste. Ils achètent leurs ingrédients et ne font que ce qui rapporte.
- Les postes de cuisine restent pour la recherche de ce qui se cuisine.
- Sans tâche, un cueilleur, un bûcheron ou un mineur récolte ce que le comptoir paie le mieux pour son travail et le vend. Il fabrique la pioche qu'il sait faire, et cherche un matériau que la colonie demande sans en connaître de gisement.

**L'arbre technologique.**

- **Le carnet d'essais de la colonie** : les essais ratés de ses chercheurs (inventeur, cuisiniers), sans oubli, transmis d'un inventeur au suivant. 2 048 entrées.
- **L'objectif Inventer** (savoir, 0,55, pesé par la curiosité) : l'inventeur cherche hors des moments où il est curieux.
- **Programme de l'inventeur** :
  - chaque matériau seul à une station qu'il n'a jamais vu servir (un four neuf) ;
  - puis une fois sur deux, ce que l'on peut faire d'un matériau qu'aucune recette connue n'utilise (seul, puis avec un autre, puis deux ; le malus par ingrédient en plus passe à 3) ;
  - sinon, il essaie librement. Le bonus de nouveauté ne compte plus qu'une fois par combinaison : une combinaison de trois matériaux nouveaux ne vaut pas mieux qu'un matériau nouveau avec deux familiers.
- **Les idées** : un chercheur qui fabrique un matériau nouveau pour lui, bâtit une station dont il ne connaît aucune recette, ou y essaie un matériau seul, a une chance sur deux d'avoir l'idée d'un de leurs usages. Il n'en a l'idée que s'il peut en réunir les ingrédients ; l'idée est oubliée au bout de 3 jours ou une fois sue. Elle reçoit le bonus d'indice (+3). C'est la règle des graines du J9, étendue aux chercheurs.
- **Les stations d'une colonie se bâtissent au camp.**
- **La réserve fournit l'inventeur** : au camp, il prend les matériaux de la station qu'il sait faire et n'a pas vue bâtie (et ceux de leurs ingrédients), ainsi que 3 unités de chaque matériau qui lui manque.
- **Les projets prennent le stock libre** à chaque passage du système de colonie : ce que le comptoir a acheté hors tâche sert aux bâtiments.

**Ordre des systèmes** : `economySystem` s'insère juste après `farmSystem`. Chaque matin, il fait les prix, le revenu observé, les métiers comptés, la monnaie frappée et les salaires.

## Conséquences

- Mesures (10 graines, 100 jours) : voir la feuille de route ([11](../design/11-feuille-de-route.md), J10).
- Le critère de sortie est vérifié sur les colonies qui cultivent (celles qui deviennent des colonies ordinaires) : les trois petites colonies qui ne cultivent pas à temps ont 4 métiers, sans meunier ni boulanger.
- Les graines de démonstration changent encore (J3 : graine 1 ; J6 : graines 1 et 30).
- Le volume d'événements dépasse 500 par jour dans une grande colonie : les tests lisent le journal du savoir ou les événements au fil des jours, pas le journal en fin de partie.
- Valeurs de `data/balance.json` :
  - nouvelle section `economy` ;
  - `crafting` : `inspiration`, `ideaDays`, `trial.focusExtra` (1 → 3) ;
  - `colony` : `notebookSize`, `inventorSample`, `inventorFocus`.
- Reporté :
  - or et pierres précieuses (J12) ;
  - coffre personnel et héritage des biens ;
  - troc, carnet d'offres et de demandes entre individus ;
  - prospérité dans l'harmonie ;
  - péremption ;
  - lingot de fer et outils de fer (rares) ;
  - courbes de prix au tableau de bord.
