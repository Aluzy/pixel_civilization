# 03 — L'individu

Un individu est un pixel noir avec des attributs, des jauges de besoins, un inventaire, une mémoire (voir [05-savoir](05-savoir.md)) et un journal de décisions.

## Attributs

| Attribut | Rôle | Départ |
| --- | --- | --- |
| Points de vie (PV) | Mort à 0. Régénération lente si nourri et reposé | 100 |
| Force | Capacité de port de l'inventaire, vitesse de récolte | 10 |
| Vitesse | Cases parcourues par seconde à ×1 | 2 |
| Attaque | Dégâts de base, multipliés par l'arme | 5 |
| Défense | Réduction des dégâts, augmentée par l'équipement et l'abri | 2 |
| Perception | Rayon de vision en cases (÷2 la nuit) | 8 |
| Mémoire | Nombre d'emplacements de souvenirs | 20 |

Formules de base :

- Capacité d'inventaire = Force × 2 unités.
- Dégâts reçus = max(1, attaque de l'adversaire × multiplicateur d'arme − défense totale).
- Temps de récolte d'une unité = base de la ressource ÷ (1 + Force / 20) ÷ multiplicateur d'outil.

## Jauges de besoins

Chaque jauge va de 0 (satisfait) à 100 (critique) et évolue à chaque cycle.

| Jauge | Monte avec | Descend avec | Conséquence à 100 |
| --- | --- | --- | --- |
| Faim | Le temps, l'effort | Manger | Perte de PV |
| Soif | Le temps, la chaleur | Boire | Perte de PV rapide |
| Fatigue | Le temps éveillé, l'effort | Dormir (mieux dans un abri) | Vitesse et perception réduites, puis sommeil forcé |
| Insécurité | Danger perçu, nuit hors abri, PV bas | Abri, armes, compagnie | Fuite prioritaire |
| Curiosité | Le temps passé sans nouveauté | Explorer, expérimenter | Aucune ; pousse à explorer |

### Valeurs actuelles (J2, `data/balance.json`)

| Paramètre | Valeur |
| --- | --- |
| Faim | +50 par jour |
| Soif | +100 par jour |
| Fatigue | +80 par jour éveillé, −400 par jour de sommeil |
| Curiosité | +120 par jour éveillé hors exploration, −300 par jour d'exploration |
| Effort (déplacement, cueillette) | faim, soif et fatigue montent ×1,3 |
| Besoin critique (faim ou soif à 100) | −150 PV par jour et par besoin critique |
| Régénération | +40 PV par jour si faim et soif < 60 |
| Réveil | quand la fatigue descend à 5 |
| Épuisement | fatigue à 100 : l'individu s'endort, quel que soit son objectif |

Le premier individu commence avec toutes ses jauges à 30. En J2, il dort là où il se trouve : l'abri et les dangers nocturnes arrivent au J4.

## Pyramide des besoins

Un niveau ne compte pleinement que si les niveaux inférieurs sont satisfaits. Le moteur de décision ([06-ia](06-ia.md)) applique un facteur qui écrase les objectifs d'un niveau tant qu'un niveau inférieur est en souffrance.

1. **Survie** : manger, boire, dormir.
2. **Sécurité** : construire et entretenir un abri ; fuir le danger.
3. **Équipement** : armes et protections pour explorer sereinement.
4. **Efficacité** : outils pour extraire plus vite et accéder à de nouvelles ressources.
5. **Savoir** : expérimenter, cartographier, écrire, lire.
6. **Harmonie** : aménager le territoire, spécialiser les zones, transmettre.

## Réplication

Un individu peut se répliquer quand **toutes** ces conditions sont réunies :

- sa faim est restée inférieure à 30 sur les 600 derniers cycles ;
- il n'a perdu aucun PV depuis 2 jours ;
- il possède un abri ou réside dans un abri de la colonie ;
- il dispose du coût de réplication dans son inventaire (ex. 10 baies, 5 fibres) ;
- au moins 300 cycles (30 s à ×1) se sont écoulés depuis sa dernière réplication.

Se répliquer est une **décision** évaluée par le moteur d'IA (niveau Harmonie de la pyramide, avec un bonus quand la colonie manque de bras), pas un automatisme.

### Héritage

- La réplication apparaît sur une case libre adjacente.
- Elle hérite des **attributs** du parent avec une mutation de ±5 % par attribut (tirage via le générateur à graine).
- Elle hérite du **génome de décision** du parent (curiosité, aversion au risque, prévoyance…), lui aussi muté de ±5 % par gène (voir [06-ia](06-ia.md), couche 8). C'est le support de l'évolution des stratégies sur les générations.
- Elle naît **sans mémoire** ni expérience apprise : aucun lieu, aucune recette, aucune estimation. Elle doit tout apprendre (exploration, imitation, parole, livres).
- Ses jauges démarrent à 30.

## Actions de survie (J2)

| Action | Effet |
| --- | --- |
| Boire | Debout à côté d'une case d'eau : −2 de soif par cycle, jusqu'à 0 |
| Cueillir | Sur une case de baies : une unité toutes les `harvestTicks / (1 + Force / 20)` cycles. Elle est mangée si la faim dépasse la moitié de sa valeur nutritive (12 pour les baies), sinon mise en réserve jusqu'à 6 unités |
| Manger | Consomme une unité portée tous les 2 cycles, jusqu'à une faim de 5 |
| Dormir | Sur place ; la fatigue baisse, l'individu se réveille à 5 |
| Se déplacer | Le long d'un chemin calculé dans le champ de vision ; vitesse × facteur du biome (`speed` dans `data/world.json`) |

Une case de ressource vidée disparaît ; si la ressource est renouvelable, elle repousse au même endroit après `regrowTicks` cycles (baies : 2 jours).

## Vieillissement et mort

- Mort quand les PV atteignent 0.
- Question ouverte : vieillissement et mort naturelle (voir [12-risques](12-risques.md)). Valeur proposée : espérance de vie de 60 jours, avec perte progressive de vitesse et de mémoire après 45 jours.
- À la mort, l'inventaire tombe au sol et la mémoire est perdue — sauf ce qui a été écrit.

## Journal de décisions

Chaque individu conserve ses 50 dernières décisions : cycle, objectif retenu, trois meilleurs scores concurrents, plan calculé, résultat (succès, échec, interruption). Le journal sert à l'inspection par l'observateur et au débogage.
