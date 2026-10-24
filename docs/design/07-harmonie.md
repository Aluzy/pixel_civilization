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

## Usage

- Les poids sont dans `data/balance.json` : les modifier change la « philosophie » de la civilisation.
- Le tableau noir crée des tâches qui ciblent la composante la plus faible.
- L'interface affiche le score et ses cinq composantes sous forme de courbes dans le temps.
