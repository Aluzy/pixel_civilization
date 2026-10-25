# 0016 — Harmonie mesurée chaque matin, point faible au tableau noir, champs

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/07-harmonie.md`, `docs/design/09-architecture.md`, `data/balance.json`

## Contexte

Le J7 demande un score d'harmonie mesurable et des tâches qui visent sa composante la plus faible. La conception laissait ouverts le moment du calcul, le territoire, le calcul de la spécialisation (une entropie demande un logarithme, interdit par la décision 0005) et ce que la colonie fait de son point faible. Par ailleurs la nourriture plafonnait la population vers 40 à 60 individus.

## Décision

- Un nouveau système, `harmonySystem`, placé en dernier dans le cycle, calcule chaque matin l'harmonie de chaque colonie et ajoute une ligne d'historique (dans l'état, hashée) pour le tableau de bord.
- Territoire : un carré de 24 cases de rayon autour du camp. Spécialisation : diversité de Gini–Simpson au lieu de l'entropie.
- La composante la plus basse est inscrite au tableau noir ; les membres la lisent au camp. Stabilité ou bien-être : réserve visée +50 % et champs de baies ; durabilité ou ordre spatial : champ de la ressource la plus surexploitée ; savoir : Écrire et Lire +50 %.
- Champ : projet de colonie (au plus un par jour, dès 4 membres), 6 unités réunies, plantées par n'importe quel membre en sources groupées près du camp. C'est le premier aménagement du territoire.

## Conséquences

- L'harmonie progresse sur les 10 graines mesurées (100 jours). Les champs doublent à peu près la population au jour 100.
- La mesure de durabilité reste souvent basse à cause du bois (10 jours de repousse) ; les champs de bois y répondent.
- Le score n'est jamais lu par les décisions individuelles, seulement le point faible, et par le tableau noir comme une croyance.
