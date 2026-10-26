# CLAUDE.md — Guide pour les agents

Ce fichier est lu en premier par tout agent qui travaille sur ce dépôt. Il fixe les règles non négociables, la méthode de travail et l'endroit où trouver chaque information.

## Le projet en bref

**Pixel Civilisation** est une simulation d'observation : un pixel noir autonome part seul dans un monde procédural et doit bâtir une civilisation harmonieuse. Le joueur ne contrôle rien ; il observe, accélère le temps et inspecte.

- 1 pixel = 1 unité. Le noir pur `#000000` est réservé aux individus.
- Les ressources sont des pixels de couleur ; la fabrication combine des couleurs sur des pixels de transformation (stations).
- Chaque individu a des besoins hiérarchisés, une mémoire limitée qui oublie, et découvre les recettes en essayant.
- Le rendu volontairement minimal laisse la puissance de calcul à l'**IA, qui est le cœur du jeu** : elle planifie à long terme, imagine des futurs possibles, se représente les autres, apprend de son expérience et évolue de génération en génération (niveaux 1 à 6 de `docs/design/06-ia.md`).
- Le savoir se transmet par la parole, l'imitation, les cartes et les livres rangés en bibliothèque.
- L'objectif de la colonie est un score d'harmonie mesurable.

La conception complète est dans [`docs/design/`](docs/design/README.md). **Lis le document du domaine concerné avant de coder.**

## Pile technique

- JavaScript moderne (ES modules), typage par **JSDoc** (pas de TypeScript).
- **Phaser 4** (paquet npm `phaser`) pour le rendu, la caméra et l'interface.
- **Vite** pour le développement et le build.
- **Vitest** pour les tests.
- Bruit simplex implémenté dans le projet (`src/sim/world/noise.js`) pour la génération du monde, sans dépendance (décision 0004).
- Déploiement sur **GitHub Pages** via GitHub Actions (voir `docs/design/10-deploiement.md`).

## Commandes

```bash
npm install          # installer les dépendances
npm run dev          # serveur de développement Vite
npm test             # tests Vitest (une fois)
npm run test:watch   # tests en continu
npm run build        # build de production dans dist/
npm run preview      # servir le build localement
npm run lint         # ESLint (vérifie aussi les interdits de src/sim)
npm run format       # Prettier
npm run sim -- --seed 42 --days 30   # simulation headless : rapport par jour, code de sortie 1 si l'individu meurt
npm run bench                        # mesure : 500 fondateurs pendant 100 jours, coût d'un cycle face au budget de ×16
```

Les interdits de `src/sim/` sont vérifiés deux fois : par ESLint (`eslint.config.js`) et par le test `tests/sim/purity.test.js`.

## Règles d'architecture (invariants)

Ces règles ne se négocient pas. Une modification qui en viole une doit être refusée ou corrigée.

1. **Simulation et rendu sont séparés.** Tout le code de simulation vit dans `src/sim/` et tourne dans un Web Worker, cadencé en temps réel par `src/worker/` (seul endroit côté Worker qui lit l'horloge réelle). `src/sim/` n'importe **jamais** Phaser, le DOM, `window` ou `document`. Le rendu (`src/render/`, `src/scenes/`, `src/ui/`) ne modifie jamais l'état de simulation : il envoie des messages au Worker.
2. **Déterminisme total.** Une même graine et une même séquence de cycles produisent exactement le même monde.
   - Interdits dans `src/sim/` : `Math.random()`, `Date.now()`, `performance.now()`, `new Date()`, l'ordre d'itération d'objets non garanti pour une logique décisionnelle.
   - Tout aléatoire passe par le générateur à graine `src/sim/core/rng.js` (un flux par sous-système, et un flux par individu).
   - Pas de fonctions mathématiques au résultat variable selon le navigateur : `Math.exp`, `Math.pow`, `Math.log`, trigonométrie, `**` (décision 0005). `+`, `×`, `/`, `floor`, `round`, `sqrt` sont sûrs ; pour une exponentielle, utiliser `expNeg` de `src/sim/core/math.js`.
   - Le temps de jeu se compte **en cycles** (`tick`), jamais en millisecondes réelles.
   - La vitesse (×1, ×64, Max) ne change que le nombre de cycles exécutés par seconde réelle, jamais la logique d'un cycle.
3. **Données plutôt que code.** Ressources, couleurs, recettes, stations, constantes d'équilibrage sont dans `data/*.json`. Aucun nombre magique d'équilibrage dans le code : il est lu depuis `data/balance.json`.
4. **ECS léger.** Entités = identifiants entiers. Composants = tableaux typés (`Float32Array`, `Uint16Array`…) indexés par entité. Systèmes = fonctions pures `(state, ctx) => void` exécutées dans un ordre fixe (voir `docs/design/09-architecture.md`).
5. **Croyances, pas omniscience.** Un individu ne décide qu'à partir de ce qu'il perçoit et de sa mémoire. Le code d'IA ne lit jamais directement la grille du monde au-delà du rayon de perception.
6. **Explicabilité.** Toute décision d'IA écrit une entrée courte dans le journal de l'individu (objectif choisi, scores concurrents, plan). Tout ce que l'IA apprend (estimations, génome) est lisible et affichable dans l'inspecteur.
7. **Budget de réflexion déterministe.** La quantité de calcul de l'IA se mesure en unités de travail (nœuds explorés, tirages simulés) fixées par `balance.json` et la population, jamais en millisecondes. Une machine lente ralentit la vitesse effective, jamais la qualité des décisions. En parallèle (Workers penseurs), les décisions sont appliquées dans l'ordre des identifiants, avec un flux aléatoire par individu.
8. **Performance.** Pas d'allocation d'objets dans les boucles chaudes de simulation (réutiliser les tampons). Budget : 500 individus à ×1 en moins de 4 ms par cycle sur un portable moyen.

## Conventions de code

- Code, identifiants, noms de fichiers et messages de commit : **anglais**.
- Documentation de conception (`docs/`) : **français**.
- Commentaires : anglais, courts, pour expliquer le *pourquoi*.
- Un module = une responsabilité. Fichiers en `kebab-case.js`, classes en `PascalCase`, fonctions et variables en `camelCase`, constantes en `UPPER_SNAKE_CASE`.
- Exports nommés uniquement (pas d'`export default`), sauf configuration Phaser.
- Chaque fonction publique a un commentaire JSDoc avec les types.
- Formatage : Prettier (largeur 100, guillemets simples, point-virgule). Lint : ESLint config recommandée.

## Méthode de travail

Le développement suit les jalons de [`docs/design/11-feuille-de-route.md`](docs/design/11-feuille-de-route.md). Ne commence jamais un jalon avant que le précédent remplisse son critère de sortie.

Pour chaque tâche :

1. Lis le document de conception du domaine et ce fichier.
2. Écris d'abord les tests de la logique de simulation (Vitest, sans navigateur).
3. Implémente le plus petit changement qui fait passer les tests.
4. Vérifie : `npm test` et `npm run build` passent ; pas d'import interdit dans `src/sim/`.
5. Si la conception est ambiguë ou doit changer, mets à jour le document de `docs/design/` **dans le même commit** et note la décision dans `docs/decisions/` (format ADR, voir le modèle).
6. Commits courts et thématiques, au format Conventional Commits : `feat(sim): add memory decay`, `fix(render): chunk texture leak`, `docs(design): clarify replication cost`.
7. Une branche par jalon ou fonctionnalité (`milestone/j2-survie`, `feat/goap-planner`), fusionnée dans `main` par pull request.

## Définition de « terminé »

- Les tests passent, y compris un test de déterminisme : deux simulations avec la même graine sur N cycles donnent un état identique (hash de l'état).
- Le build Vite passe et le jeu se lance sans erreur dans la console.
- Les nouvelles constantes sont dans `data/balance.json`.
- La documentation de conception reflète ce qui a été implémenté.
- Le critère de sortie du jalon est vérifiable par un humain dans la version déployée.

## Carte de la documentation

| Sujet | Fichier |
| --- | --- |
| Vision, piliers, hors périmètre | `docs/design/01-vision.md` |
| Monde, biomes, ressources, jour/nuit, menaces (données : `data/world.json`, `data/resources.json`) | `docs/design/02-monde.md` |
| Individu, attributs, besoins, réplication | `docs/design/03-individu.md` |
| Fabrication par la couleur, stations, découverte | `docs/design/04-fabrication.md` |
| Mémoire, oubli, cartes, livres, bibliothèques | `docs/design/05-savoir.md` |
| Moteur comportemental (niveaux d'IA, Utility AI, GOAP, HTN, simulation mentale, modèle des autres, apprentissage, génome) | `docs/design/06-ia.md` |
| Score d'harmonie | `docs/design/07-harmonie.md` |
| Interface d'observation et contrôle du temps | `docs/design/08-interface.md` |
| Architecture, ECS, Worker, rendu, protocole | `docs/design/09-architecture.md` |
| Déploiement GitHub Pages | `docs/design/10-deploiement.md` |
| Jalons et critères de sortie | `docs/design/11-feuille-de-route.md` |
| Risques et questions ouvertes | `docs/design/12-risques.md` |
| Agriculture, cuisine (vision v2) | `docs/design/13-agriculture-cuisine.md` |
| Économie, métiers, richesses (vision v2) | `docs/design/14-economie.md` |
| Migration, colonies multiples (vision v2) | `docs/design/15-colonies-et-migration.md` |
| Menaces, combattants, forteresses, conflits (vision v2) | `docs/design/16-guerre-et-forteresses.md` |
| Architecture : plan de ville, édifices, paysage, grands travaux, beauté | `docs/design/17-architecture.md` |
| Expansion et commerce : pêche, savoir durable, routes et relais, quartiers, navires et îles | `docs/design/18-expansion-et-commerce.md` |
| Glossaire | `docs/design/glossaire.md` |

## Ce qu'il ne faut pas faire

- Ajouter TypeScript, un framework d'interface (React, Vue) ou un moteur physique.
- Introduire un réseau de neurones ou un modèle entraîné hors de la partie. L'apprentissage **pendant** la partie est voulu (expérience, évolution du génome), mais par des mécanismes symboliques, bornés et affichables.
- Simplifier l'IA pour gagner des images par seconde : on gagne du calcul ailleurs (rendu, gel des blocs, parallélisme), pas sur l'intelligence.
- Utiliser le GPU pour un calcul qui influence les décisions (résultats flottants non garantis identiques d'une machine à l'autre).
- Donner au joueur un moyen d'agir sur la simulation (il n'est qu'observateur ; seuls le temps, la caméra, l'inspection et la graine sont contrôlables).
- Scénariser des événements : tout doit émerger des règles.
- Modifier `data/balance.json` sans expliquer la raison dans le message de commit.
