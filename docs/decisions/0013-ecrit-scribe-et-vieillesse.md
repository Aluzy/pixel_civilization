# 0013 — L'écrit : un scribe, des documents, la vieillesse et un journal du savoir

- **Date** : 2026-10-25
- **Statut** : acceptée
- **Documents concernés** : `docs/design/05-savoir.md`, `docs/design/03-individu.md`, `docs/design/06-ia.md`, `docs/design/09-architecture.md`, `docs/design/12-risques.md`, `data/balance.json`, `data/ai-goals.json`

## Contexte

Le J6 demande qu'une recette survive à la mort de celui qui l'a découverte grâce à un livre, et qu'une partie montre un savoir perdu puis redécouvert. Trois obstacles :

- Sans vieillesse, les individus ne mouraient presque pas : aucun savoir ne disparaissait, aucun livre n'était nécessaire.
- Quand tous les membres pouvaient choisir « Écrire », la colonie entière partait fabriquer papier, encre et livres, et mourait de faim. De même quand tous les curieux cherchaient la recette d'un projet.
- « Perdu » et « sauvé par un livre » ne se voient pas dans l'état d'un individu : il faut les mesurer à l'échelle de la colonie.

## Décision

- Chaque individu reçoit à la naissance une **durée de vie** (54 à 66 jours) et meurt de vieillesse en l'atteignant. Ce qu'il porte disparaît avec lui.
- Un livre ou une carte est un **document** : un bien dans l'inventaire, plus un contenu dans `DocumentStore` (état hashé).
- **Un seul scribe** par colonie, pour 6 jours : le premier membre qui passe au camp avec quelque chose à écrire alors qu'une bibliothèque est debout. Seul lui a l'objectif « Écrire ». De même, **un seul chercheur** par projet sans recette connue, pour 6 jours.
- On écrit ce qu'on croit : une recette fausse est écrite fausse ; à la lecture, elle n'est fausse que si aucun document de la bibliothèque ne la donne juste.
- Un nouveau système, `knowledgeSystem`, placé en dernier dans le cycle (après `colonySystem`), gère tous les 100 cycles l'abandon et l'incendie des bibliothèques et compte le savoir collectif : connu juste par un vivant, écrit juste dans un document accessible, perdu, retrouvé.
- Le **journal du savoir** (`KnowledgeLog`) note découvreur, mort du découvreur, première lecture après cette mort (« sauvé par un livre »), pertes et retours. Il est observé (chronique, panneau Colonie, tests), jamais lu par une décision.
- Un individu assoiffé ou affamé qui n'est pas au repos **demande son chemin** à un voisin éveillé à 6 cases au plus. Avec la vieillesse et l'écrit, un nouveau né pouvait mourir de soif à quelques cases d'un parent qui savait où boire.

## Conséquences

- Sur 10 graines, la plupart des colonies bâtissent une bibliothèque vers les jours 13 à 25, puis écrivent et lisent ; les recettes y survivent à leurs découvreurs. Des incendies, des abandons et des recettes fausses produisent des savoirs perdus, parfois retrouvés.
- Une colonie peut perdre un savoir sans le savoir : beaucoup de membres croient connaître une recette fausse. C'est voulu.
- Pas encore : déclin des capacités avec l'âge, copies de livres, cartes consultées hors de la bibliothèque, bibliothèque en gabarit de plusieurs pixels, documents qui tombent au sol à la mort.
