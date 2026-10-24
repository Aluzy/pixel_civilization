# 0007 — Souvenirs flous et mémoire qui suit le regard

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `docs/design/05-savoir.md`, `docs/design/11-feuille-de-route.md`, `data/balance.json`

## Contexte

Le critère de sortie du J3 demande de voir le pixel oublier un lieu, échouer à le retrouver, puis le redécouvrir. Avec une mémoire qui oublie seulement par effacement, un lieu est soit connu exactement, soit inconnu : l'individu ne peut jamais « se tromper d'endroit ». Par ailleurs, une première version ne rafraîchissait que le lieu le plus proche de chaque type : le point d'eau du camp, bien visible, pouvait être oublié puis aussitôt « redécouvert » en boucle.

## Décision

- Un souvenir faible est rappelé à une position décalée, d'autant plus que sa force est basse (jusqu'à `memory.maxBlur` = 12 cases), dans une direction fixe pour ce souvenir tant qu'il n'est pas rafraîchi. Arrivé à l'endroit rappelé sans rien y voir, l'individu conclut qu'il ne retrouve pas le lieu et l'oublie.
- Tout lieu mémorisé entièrement visible et encore valable est rafraîchi, et la position d'un souvenir ne bouge plus quand on le revoit.

## Conséquences

- Plus de boucle oubli/redécouverte du camp ; plus de doublons de souvenirs.
- La séquence oubli → lieu introuvable → redécouverte émerge sans script, mais rarement (3 graines sur 150 en 40 jours), car un individu seul vit dans un petit territoire qu'il revoit sans cesse. La graine 47 sert de démonstration et de test.
- Avec plusieurs individus (J5) et la transmission orale, les souvenirs approximatifs prendront plus de place.
