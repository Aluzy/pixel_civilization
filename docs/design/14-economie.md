# 14 — Économie, métiers et richesses

> Chantier préparé après le J7 (décision 0020). Rien n'est encore implémenté. Valeurs 🟡 à caler.

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
