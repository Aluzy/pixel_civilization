# 0019 — Mesurer la fluidité à 500 individus avec plusieurs fondateurs

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/11-feuille-de-route.md`, `docs/design/09-architecture.md`, `data/bench.json`

## Contexte

Le critère du J7 parle d'une partie de 100 jours avec 500 individus. Une colonie née d'un seul pixel en compte 60 à 125 au jour 100 : chaque naissance demande une réserve de nourriture d'avance proportionnelle aux membres (décision 0011). Atteindre 500 demanderait de changer cet équilibre, qui évite les famines.

## Décision

- Le constructeur de la simulation accepte `founders` (1 par défaut) : des fondateurs supplémentaires autour du point de départ. Ce n'est pas une commande du joueur : seul l'outil de mesure s'en sert.
- `npm run bench` (`tools/bench.js`) fait vivre 500 fondateurs pendant 100 jours dans un monde où les baies sont plus abondantes (`data/bench.json`), et compare le coût d'un cycle au budget de ×16 (6,25 ms).

## Conséquences

- Mesure : 0,92 ms par cycle en moyenne, 1,26 ms le pire jour, avec 484 individus jusqu'au jour 50 puis environ 300 (les fondateurs meurent de vieillesse ensemble).
- La fluidité à 500 est vérifiée par la mesure, pas encore dans une partie ordinaire.
