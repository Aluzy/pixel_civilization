# 01 — Vision

## Résumé

Pixel Civilisation est une simulation d'observation. Un pixel noir autonome naît seul dans un monde procédural immense et doit bâtir une civilisation harmonieuse. Le joueur ne contrôle rien : il regarde, accélère le temps, zoome, inspecte et comprend.

**Promesse** : voir émerger une histoire (famines, découvertes, âges d'or, oublis) à partir de règles simples et lisibles au pixel près.

## Piliers

1. **Lisibilité absolue** — 1 pixel = 1 unité. Tout ce qui existe se voit ; rien n'est caché derrière une interface.
2. **Autonomie crédible** — chaque décision d'un pixel s'explique (« il a faim, il se souvient de baies à 40 cases au nord »).
3. **Le calcul va à l'intelligence** — le rendu minimal en pixels est un choix assumé : la puissance de calcul est réservée à l'IA des individus, qui planifie à long terme, anticipe, comprend les autres, apprend et évolue.
4. **Le savoir est fragile** — la connaissance s'acquiert par l'essai, s'oublie, se transmet par écrit et peut se perdre.
5. **Émergence plutôt que script** — aucun événement scénarisé ; les histoires naissent des interactions entre besoins, mémoire et environnement.
6. **Harmonie mesurable** — l'objectif final est un score calculé, visible par l'observateur.
7. **Le temps de l'observateur est précieux** — il peut toujours accélérer, et le jeu le ramène à vitesse normale quand quelque chose d'intéressant se produit.
8. **Un monde qui résiste** (vision v2) — le danger est réel : des prédateurs en meute tuent, des colonies rivales pillent. La sécurité devient un besoin, la défense un métier, la forteresse une réponse.
9. **Des sociétés qui se différencient** (vision v2) — l'agriculture se découvre, la cuisine transforme, les métiers se choisissent par intérêt, les richesses s'amassent, des colonies naissent par migration et vivent leur propre histoire, en paix ou en guerre.

## Le rôle du joueur

Le joueur est un observateur. Il peut :

- choisir ou saisir la graine du monde ;
- déplacer la caméra et zoomer ;
- régler la vitesse du temps, mettre en pause, sauter au prochain événement ;
- inspecter un individu, un bâtiment, une case ;
- afficher des calques d'information.

Il ne peut **jamais** modifier la simulation.

## Hors périmètre (version 1)

- Multijoueur.
- Toute intervention du joueur sur le monde ou les individus.
- ~~Combat entre colonies rivales (à reconsidérer après J7).~~ Entré dans la vision v2 (décision 0020, [16-guerre-et-forteresses](16-guerre-et-forteresses.md)) : les colonies peuvent s'affronter, toujours par émergence, jamais sur ordre du joueur.
- Réseaux de neurones et modèles entraînés hors de la partie. L'IA apprend pendant la partie (expérience, évolution), mais par des mécanismes symboliques et affichables (voir [06-ia](06-ia.md)).
- Son et musique (à reconsidérer après J7).
