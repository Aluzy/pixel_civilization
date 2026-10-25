# 15 — Migration et colonies multiples

> Chantier préparé après le J7 (décision 0020). Rien n'est encore implémenté. Valeurs 🟡 à caler.

Aujourd'hui une seule colonie naît du premier pixel et ne se divise jamais (l'exploration est tenue en laisse à 40 cases du camp). Des pixels doivent pouvoir **partir fonder leur propre colonie**, qui vivra ensuite sa vie : son camp, son tableau noir, sa bibliothèque, ses métiers, ses relations avec les autres.

## Pourquoi partir

Un individu envisage l'**objectif Migrer** (niveau Harmonie) quand sa colonie lui paraît saturée, d'après ce qu'il en croit :

- pas de lit libre depuis longtemps, réserve de nourriture sous la cible, longs trajets vers les ressources (l'expérience apprise du coût des biens monte) ;
- harmonie basse ou point faible persistant ;
- danger appris autour du camp ([16](16-guerre-et-forteresses.md)) ;
- ses gènes : curiosité haute et sociabilité basse poussent au départ.

Il faut aussi un **lieu en vue** : un endroit remémoré (ou lu sur une carte) avec eau, nourriture et matériaux, à au moins 🟡 80 cases du camp, hors du territoire d'une autre colonie.

## Partir à plusieurs

- Le candidat inscrit au tableau noir un **projet d'expédition** (le lieu, le nombre de places 🟡 3 à 8). Les membres qui le lisent et partagent son jugement (même calcul, avec leurs propres croyances et gènes) s'inscrivent ; les liens d'affinité (fiches sociales du J5) comptent.
- L'expédition emporte des **provisions** (nourriture, matériaux d'un premier abri, outils) prélevées dans la réserve ou achetées ([14](14-economie.md)), et si possible une **copie de livre** : c'est ainsi que le savoir voyage.
- Le voyage est une marche groupée vers le lieu ; le groupe dort ensemble, se défend ensemble.

## Fonder

- Au lieu choisi, le premier abri bâti crée une **nouvelle colonie** (nouvel identifiant, camp, réserve, tableau noir vide, projets). Les migrants changent de colonie : leurs souvenirs, recettes et fiches restent les leurs.
- La nouvelle colonie a son propre point faible, son harmonie, ses projets ; sa bibliothèque se construit à partir des livres apportés.
- **Filiation** : chaque colonie retient sa colonie mère. Les liens de parenté pèsent sur les relations (voir plus bas).

## Les relations entre colonies

- Chaque colonie tient, pour chaque autre colonie qu'elle connaît, une **fiche de relation** (comme les fiches sociales, à l'échelle de la colonie, tenue au tableau noir) : rencontres, échanges, incidents (vol, mort d'un membre, passage armé sur le territoire), parenté.
- **Territoire** : le carré de l'harmonie (24 cases autour du camp) devient la zone revendiquée. Deux territoires qui se touchent créent des occasions de commerce et de conflit.
- **Commerce** : une **caravane** (un ou deux marchands) porte des biens d'un marché à l'autre quand l'écart de prix de référence le justifie ([14](14-economie.md)).
- **Conflit** : voir [16-guerre-et-forteresses](16-guerre-et-forteresses.md).

## Effets techniques

- Plusieurs colonies multiplient les camps à suivre : le gel des blocs lointains (déjà prévu dans [02-monde](02-monde.md)) devient indispensable. Les blocs autour de chaque camp restent actifs.
- Le tableau de bord montre une ligne par colonie (population, harmonie) et une carte des territoires (calque « territoires »).
- Couleurs : les individus restent noirs (pilier de lisibilité) ; le calque des territoires colore le sol, pas les pixels.

## Données à créer

- `data/balance.json` → `migration` : seuils de saturation, distance minimale, taille d'une expédition, provisions, durée maximale du voyage.

## Critère de sortie proposé (J11)

Sur la majorité des graines, au moins deux colonies existent au jour 150, la seconde fondée par une expédition partie de la première ; au moins un échange entre colonies (caravane ou troc) est observé ; la filiation et les relations sont visibles dans l'inspecteur.
