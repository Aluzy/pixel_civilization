# 0024 — Migration et colonies : éclaireur, expédition, fondation, caravanes

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/15-colonies-et-migration.md`, `06-ia.md`, `08-interface.md`, `09-architecture.md`, `11-feuille-de-route.md`, `14-economie.md`, glossaire

## Contexte

Le J11 doit faire naître de nouvelles colonies par des expéditions parties d'une première colonie, tenir des relations entre colonies et faire voyager des biens entre elles. Critère de sortie : sur la majorité des graines, au moins deux colonies au jour 150, la seconde fondée par une expédition, et au moins un échange entre colonies.

Les membres d'une colonie ne connaissent presque rien au-delà de 40 à 55 cases de leur camp (laisse d'exploration), et une exploration au hasard de la frontière couvre mal un anneau lointain.

## Décision

**Partir** (`src/sim/colony/migration.js`, `src/sim/agents/migrate-work.js`, objectif **Migrer**, harmonie, 0,75, pesé par la curiosité).

- **Pression de la foule** : de 0 à 100 membres (tels que lus au tableau noir) à 1 à 250, × (1 + 0,5 × (curiosité − sociabilité)).
- **Éclaireur** : quand la colonie peut envoyer une expédition (15 jours après la dernière, moins de 16 colonies), le premier membre au camp dont la pression dépasse 0,3 devient éclaireur, pour 20 jours au plus.
  - Il prend des provisions, va de point en point d'un anneau de 56 à 90 cases autour du camp, sans laisse, et dort où il se trouve.
  - Il retient un site quand il voit de l'eau, de la nourriture vue ou remémorée à 10 cases, loin de 56 cases au moins de tout camp qu'il connaît.
- **Expédition** : l'éclaireur la mène. Elle n'est affichée au tableau noir qu'à son retour au camp.
  - Pendant 2 jours, un membre au camp dont la pression dépasse 0,2 s'inscrit (8 au plus). Il apprend l'eau du site et quitte ses postes, ses tâches et son travail aux champs.
  - Avec 4 membres au moins, l'expédition part ; sinon elle est abandonnée au bout de 4 jours.
  - **Provisions**, prises à la réserve sans payer :
    - 6 portions de nourriture par membre ;
    - pour le chef, les matériaux d'un abri ;
    - si la réserve a de quoi faire un livre, une copie du livre le plus riche de la bibliothèque.
  - Le groupe marche vers le site et dort où il se trouve ; le voyage dure 8 jours au plus.
- **Fondation** : sur le site, qui sait bâtir un abri le bâtit, avec ce qu'il porte ou ce qu'il récolte là.
  - Cet abri crée une colonie : nouvel identifiant, camp, comptoir aux prix de base, colonie mère retenue.
  - Les membres de l'expédition changent de colonie et gardent leur savoir et leurs écus.
- **Une jeune colonie cherche ce qu'elle ignore** : un projet qui attend depuis 2 jours laisse un membre partir chercher un matériau dont il ne connaît aucun gisement (la pierre près d'un nouveau camp), avec un score × 0,4.

**Les relations** (fiche par colonie connue, au tableau noir) :

- Une fiche dit si l'autre colonie est connue, où est son camp, si elle est parente, et compte les rencontres et les caravanes. Elle garde aussi les prix de son comptoir rapportés et leur date.
- À la fondation :
  - la mère et la fille se connaissent ;
  - les fondateurs savent les prix de la mère, et la mère sait qu'un comptoir neuf ouvre aux prix de base.
- Deux membres de colonies différentes qui se parlent comptent une rencontre.

**Les caravanes** (métier **marchand**, objectif **Commercer**, efficacité, 0,6, pesé par la curiosité) :

- Un membre peut être marchand si sa colonie connaît une autre colonie et ses prix.
- Il estime ce qu'une caravane rapporte par jour : (prix d'achat là-bas − prix de vente ici) × sa charge × 480 / (2 × distance × 3 + 300) cycles.
- Le meilleur bien est acheté au comptoir de sa colonie et vendu à celui de l'autre. Là-bas, il achète ce que sa colonie paie mieux. Au retour, il vend et affiche les prix vus.
- Deux caravanes au plus par route.
- La première caravane d'une route est un événement.

**Plafond de population** : 500 au lieu de 600, sous les 512 places des individus. Avec deux colonies, la population totale dépassait les places.

## Conséquences

- Mesures (10 graines, 150 jours) : voir la feuille de route ([11](../design/11-feuille-de-route.md), J11).
- Une colonie qui reste petite (moins de 100 membres) ne part pas. Un éclaireur peut ne jamais trouver de site.
- Pas de groupe soudé pendant le voyage : chacun marche, mange et dort de son côté, et certains meurent en route.
- La graine de démonstration du J3 change (27).
- Valeurs de `data/balance.json` :
  - nouvelle section `migration` ;
  - `economy` : `ticksPerTile`, `tripOverhead`, `caravans` ;
  - `colony` : `prospectFactor`, `prospectDays`, et `maxPopulation` 600 → 500.
- Reporté :
  - gel des blocs lointains ;
  - calque des territoires ;
  - tableau de bord par colonie (le bloc Colonie montre la colonie de l'individu sélectionné et la liste des colonies) ;
  - incidents entre colonies ;
  - troc direct entre individus de colonies différentes.
