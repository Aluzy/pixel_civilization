# 12 — Risques et questions ouvertes

## Risques

| Risque | Conséquence | Parade |
| --- | --- | --- |
| Coût de calcul de l'IA avec des centaines d'individus | Simulation lente, vitesse effective basse | Décisions étalées sur 10 cycles, GOAP plafonné, plans mis en cache et partagés, blocs gelés |
| Comportements dégénérés (boucles, inaction, oscillation) | Simulation sans intérêt | Inertie des objectifs, détection de blocage (même plan échoué 3 fois → pénalité), journal de décisions, tests de scénarios |
| Croissance exponentielle de la population | Saturation de la machine | Coût de réplication, ressources finies, délai minimal, plafond technique de sécurité |
| Extinction précoce | Partie terminée en quelques minutes | Équilibrage des premières heures via la simulation headless sur 100 graines |
| Explosion combinatoire de la découverte | Pixel qui expérimente sans fin | Heuristique de curiosité, coût réel des essais, mémoire des échecs |
| IA trop gourmande pour la vitesse visée | Accélération plafonnée, observateur qui attend | Budget en unités de travail, dégradation douce de la simulation mentale avec la population, Workers penseurs, mesure continue dans la CI |
| Parallélisme non déterministe | Parties impossibles à reproduire | Application des décisions dans l'ordre des identifiants, flux aléatoire par individu, test K = 1 contre K = 4 |
| Évolution qui converge vers une stratégie dégénérée (ex. ne jamais explorer) | Civilisation figée | Plages bornées des gènes, pression du milieu (épuisement local), observation des distributions de gènes |
| Apprentissage qui s'emballe | Comportements absurdes | Mises à jour bornées, vitesse d'apprentissage limitée par le génome, réinitialisation à la naissance |
| Perte de déterminisme | Bugs impossibles à reproduire | Règles strictes de `CLAUDE.md`, test de hash d'état dans la CI |
| Équilibrage de nombreuses constantes | Monde trop facile ou trop dur | Tout dans `balance.json`, simulation headless avec rapports |
| Mémoire du navigateur sur un monde immense | Plantage | Gel et déchargement des blocs lointains, pool de textures |
| Évolution de l'API de Phaser 4 | Code cassé lors d'une mise à jour | Version épinglée dans `package.json`, rendu isolé dans `src/render/` et `src/scenes/` |

## Questions ouvertes

- [ ] Les individus vieillissent-ils et meurent-ils de vieillesse ? (proposition : oui, 60 jours)
- [ ] Plusieurs colonies indépendantes peuvent-elles naître (individu qui s'éloigne trop longtemps) et se rencontrer ?
- [ ] Sauvegarde de partie : `localStorage`, fichier téléchargeable, ou simple graine + cycle (rejeu déterministe) ?
- [ ] Valeurs exactes : durée du jour, constantes d'oubli, coût de réplication.
- [ ] Agriculture : les individus peuvent-ils planter des baies ou de la fibre pour améliorer la durabilité ?
- [ ] Faut-il une limite au monde (île) pour concentrer l'action ?
- [ ] Quel est le bon compromis par défaut entre population maximale et profondeur de réflexion ?
- [ ] Faut-il activer `SharedArrayBuffer` via un service worker sur GitHub Pages ?

Chaque question tranchée donne lieu à une décision dans `docs/decisions/` et à la mise à jour du document concerné.
