# 0015 — Interface pour téléphone en HTML au-dessus du canevas

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/08-interface.md`

## Contexte

L'interface d'observation reposait sur le clavier (Espace, 1 à 6, L, N, T, C, F, M, Échap) et sur des textes Phaser placés aux quatre coins. Sur un téléphone, aucune de ces commandes n'était accessible, les panneaux se chevauchaient et un individu (quelques pixels) était presque impossible à toucher.

## Décision

- Sur écran tactile sans souris ou fenêtre étroite (moins de 820 pixels), une couche HTML au-dessus du canevas remplace les panneaux Phaser : bandeau du haut, barre du bas pour le temps, feuille à onglets (Colonie, Chronique, Fiche, Plus), bandeau d'alerte. `?hud=phone|desktop` force le choix.
- Pas de framework : du DOM et du CSS écrits à la main, dans `src/ui/phone-hud.js`. La logique testable (choix de l'interface, paliers de vitesse, textes courts) est dans `src/ui/hud-model.js`.
- Les commandes passent par les mêmes voies que le clavier : le client du Worker pour le temps, des événements de jeu (`hud-command`) pour la caméra et la sélection.
- Un doigt sélectionne dans un rayon de 24 pixels écran ; la caméra centre dans la zone visible au-dessus de la feuille.

## Conséquences

- Tout ce que le clavier permet est faisable au doigt, plus le changement de graine.
- Le HTML de l'interface reste hors de `src/sim/` et n'agit jamais sur la simulation.
- Deux interfaces à entretenir : une nouvelle commande doit être ajoutée au clavier et à la barre du téléphone (et à la liste `PHONE_COMMANDS`).
