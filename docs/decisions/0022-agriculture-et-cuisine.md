# 0022 — Agriculture et cuisine : blé, parcelles, cuisiniers

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/13-agriculture-cuisine.md`, `02-monde.md`, `03-individu.md`, `04-fabrication.md`, `06-ia.md`, `07-harmonie.md`, `08-interface.md`, `09-architecture.md`, `11-feuille-de-route.md`, glossaire

## Contexte

Le J9 doit faire découvrir l'agriculture par l'essai, nourrir la colonie de ses cultures, faire cuisiner des plats plus nourrissants que leurs ingrédients, et laisser une colonie ordinaire dépasser 300 individus. Au J8, une colonie plafonnait entre 45 et 107 individus, limitée par la cueillette.

## Décision

- **Une culture, le blé.** Il pousse à l'état sauvage, donne parfois une graine à la récolte, se sème (recette « une graine seule, à mains nues »), puis pousse d'un stade par jour arrosé (3 stades) et donne 40 grains. Le grain se mange cru une fois rapporté (6) ; on ne le broute pas sur place, pour ne pas changer la cueillette d'avant l'agriculture.
- **L'indice remplace l'observation des graines tombées.** Il n'y a pas d'objet posé au sol : trouver une graine dans du blé sauvage fait deviner (25 %) qu'elle se sème, ce qui oriente les essais.
- **Pas de jarre.** Les parcelles doivent avoir de l'eau à moins de 4 cases ; arroser une parcelle arrose ses voisines. Cela récompense les champs groupés et garde la charge de travail raisonnable (un arrosage par jour et par plant aurait occupé toute la colonie).
- **Travaux des champs au tableau noir** : récolter, arroser, semer, tracer, glaner, pris un à un, au camp ou aux champs le jour même. Pas de métier d'agriculteur payé avant l'économie (J10).
- **Cuisine simplifiée** : farine à la main (pas de meule), feu de camp, pain, tarte aux baies, viande grillée ; nutrition d'un plat = 1,3 × ses ingrédients. Des cuisiniers en poste préparent des tournées de 5. Pas d'huile, de pressoir, de four de cuisine, ni de péremption (reportés).
- **Chercher l'usage d'un bien.** Un cuisinier qui voit en réserve une nourriture ou une production dont il ne connaît aucun usage l'essaie seul d'abord, puis avec un autre ingrédient. Il préfère une station dont il ne sait rien, et cherche aussi des stations. Les aliments n'entrent pas dans les autres essais.
- **Masques par ingrédient.** Les recettes et les essais désignent leurs ingrédients par un bit par ingrédient au lieu d'un bit par bien. Le catalogue dépasse les 30 biens que permettait l'ancien codage.
- **Réserve en portions.** Une portion vaut 12 de nutrition, quelle que soit la nourriture. La réplication coûte 6 portions de n'importe quelle nourriture (et 3 fibres, sans baies).
- **Logement.** Un abri passe à 4 lits. Une colonie mène plusieurs projets d'abri à la fois, un de plus par 30 membres, et dispose de 8 emplacements de projet.
- **Croissance bornée par les champs.** À partir de 40 membres, il n'y a pas de naissance tant que la colonie a moins d'une parcelle pour deux membres, ni tant que la réserve baisse depuis trois jours, sauf s'il reste 12 portions par membre.
- **Récoltes des champs.** La moisson d'une parcelle ne compte plus comme une surexploitation dans la durabilité de l'harmonie : elle est ressemée.
- **Famine relative.** La stabilité de l'harmonie ne tombe plus à 0 au premier mort de faim ou de soif. Il faut plus de 2 % des membres morts de faim ou de soif en 3 jours : dans une colonie de 300, une mort isolée n'est pas une famine.
- **Essais d'écriture.** Une matière brute dans une combinaison compte contre elle quand l'individu cherche de quoi écrire. Avec les nouvelles recettes connues, la familiarité des matériaux bruts éclipsait le papier et l'encre.
- **Stations à essayer.** Une station connue mais pas bâtie n'est bâtie « pour voir » qu'en essai libre, ou quand l'individu cherche un objet sans aucune station sous la main. On ne bâtit plus un feu de camp en cherchant un abri ou un livre.
- **Ordre des systèmes.** `farmSystem` s'insère juste après `worldSystem`.
- **Critère de sortie précisé.** « Une colonie ordinaire dépasse 300 » devient « une colonie qui cultive avant le jour 30 dépasse 300 individus avant le jour 100 ». Une colonie qui découvre l'agriculture tard n'a pas le temps de grandir.

## Conséquences

- Mesures (10 graines, 100 jours) :
  - Agriculture découverte avant le jour 60 dans 7 colonies (jours 9 à 51), au jour 69 dans une, jamais dans deux.
  - Aux jours 91 à 100, plus de la moitié de la nourriture vient des cultures dans 7 colonies (0,73 à 0,93), et un plat est mangé chaque jour dans les mêmes 7.
  - Les 5 colonies qui cultivent avant le jour 30 atteignent 302 à 408 individus.
  - L'harmonie progresse sur les graines 1 à 3.
- Les graines de démonstration changent encore (J3 : graine 25, suivie 30 jours ; J6 : graines 5 et 30).
- Valeurs de `data/balance.json` :
  - Nouvelles sections `agriculture` et `cooking`.
  - `crafting.trial` : `hintBonus`, `focusExtra`, `unknownStationBonus`.
  - `replication` : `cost` sans baies, `costFood`, `reservePerMember`, `reserveMembers`, `plotsPerMember`.
  - `colony` : `bedsPerShelter` 4, `membersPerShelterProject`, `projectSlots` 8.
  - `harmony.famineShare`.
- Reporté :
  - autres cultures ;
  - jarre, meule, pressoir et huile ;
  - péremption par lots ;
  - moral ;
  - ravageurs et clôtures ;
  - métier d'agriculteur.
