# 07 — Mesure de l'harmonie

L'harmonie est un score composite de 0 à 100, recalculé à chaque aube pour chaque colonie. Il sert d'objectif ultime au tableau noir collectif et de fil conducteur pour l'observateur.

## Composantes

| Composante | Mesure (chacune normalisée entre 0 et 1) | Poids |
| --- | --- | --- |
| Stabilité | 1 − (écart-type relatif de la population sur 10 jours) ; × 0 en cas de famine (un individu mort de faim dans les 3 derniers jours) | 25 % |
| Durabilité | Part des ressources renouvelables du territoire dont la régénération ≥ la consommation sur 5 jours | 25 % |
| Ordre spatial | Moyenne de : spécialisation des zones, inverse de la distance moyenne habitat–ressources clés, compacité des constructions | 20 % |
| Savoir | Savoir écrit / savoir découvert au total (le savoir perdu pénalise) | 15 % |
| Bien-être | 1 − (moyenne des jauges de besoins de tous les individus / 100) | 15 % |

```
H = 100 × Σ w_k × s_k
```

## Détails de l'ordre spatial

- **Territoire** : enveloppe des cellules d'influence à moins de 4 cellules d'un bâtiment de la colonie.
- **Spécialisation** : chaque cellule construite reçoit une catégorie (habitat, artisanat, stockage, savoir, culture). Score = 1 − entropie moyenne des catégories sur des fenêtres de 3 × 3 cellules (des zones homogènes donnent un score élevé).
- **Compacité** : surface construite / surface de l'enveloppe convexe des constructions.

## État au jalon J7

Implémenté dans `src/sim/colony/harmony.js` (mesure), `src/sim/colony/field.js` (champs), `src/sim/systems/harmony-system.js` et `src/sim/colony/history.js` (historique) ; constantes dans `data/balance.json` (`harmony`).

- **Quand** : chaque matin (à 06:00, quand un jour se termine), pour chaque colonie qui a un camp. Une ligne d'historique (harmonie de la première colonie, ses cinq composantes, population, moyenne et écart-type de chaque gène) est gardée pour le tableau de bord, 1 000 jours au plus.
- **Territoire** : un carré de 24 cases de rayon autour du camp (pas encore l'enveloppe des cellules d'influence).
- **Stabilité** : 1 − écart-type relatif de la population des 10 derniers matins ; 0 si un membre est mort de faim ou de soif dans les 3 derniers jours.
- **Durabilité** : sur 5 jours glissants, parmi les ressources renouvelables récoltées par les membres dans le territoire, la part dont la repousse (quantités revenues) a égalé la récolte ; 1 si rien n'a été récolté. Le bois (10 jours de repousse) la tire souvent vers le bas.
- **Ordre spatial** : moyenne de trois mesures. *Compacité* : constructions / cases couvertes par leur enveloppe convexe (chaîne monotone, aire comptée par le théorème de Pick). *Proximité* : 1 / (1 + distance moyenne des abris à l'eau et à la nourriture les plus proches du tableau noir / 10). *Spécialisation* : zones de 4 × 4 cases, catégorie par type de construction (habitat, artisanat, savoir) ; 1 − diversité de Gini–Simpson normalisée sur les fenêtres de 3 × 3 zones autour des zones construites. Écart : Gini–Simpson remplace l'entropie, qui demanderait un logarithme (décision 0005).
- **Savoir** : recettes écrites dans un document accessible / recettes jamais découvertes (une recette perdue n'est pas écrite).
- **Bien-être** : 1 − moyenne des quatre jauges (faim, soif, fatigue, curiosité) des membres / 100.
- **Point faible** : la composante la plus basse est inscrite au tableau noir ; les membres la lisent au camp. Effets :
  - stabilité ou bien-être : la réserve de nourriture visée augmente de 50 %, et les champs plantent des baies ;
  - durabilité ou ordre spatial : un **champ** plante la ressource renouvelable la plus surexploitée du territoire ;
  - savoir : les objectifs Écrire et Lire comptent 50 % de plus pour les membres qui l'ont lu.
- **Champs** (aménagement du territoire) : au plus un par jour, dès 4 membres. C'est un projet de colonie : 6 unités de la ressource réunies dans la réserve, puis un planteur (n'importe quel membre, pas de recette) les emporte. Il choisit, parmi les cases qu'il voit à 6 cases au plus du camp, celle qui a le plus de cases libres autour d'elle (plaine, forêt, marais ou berge, sans ressource ni construction), et y plante une source de 6 unités toutes les 2 unités, sur sa case et ses voisines : une zone cultivée groupée. Les champs nourrissent une population plus grande (60 à 125 individus au jour 100, contre 20 à 60 au J6).
- **Pas encore** : enveloppe des cellules d'influence, catégories « stockage » et « culture » dans la spécialisation, coopération à plusieurs sur un grand bâtiment, spécialisation par avantage comparatif, choix de qui imiter.

## Usage

- Les poids sont dans `data/balance.json` : les modifier change la « philosophie » de la civilisation.
- Le tableau noir crée des tâches qui ciblent la composante la plus faible.
- L'interface affiche le score et ses cinq composantes sous forme de courbes dans le temps.
