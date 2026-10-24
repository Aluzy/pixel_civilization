# 09 — Architecture technique

La simulation est entièrement séparée du rendu : elle tourne dans un Web Worker, et Phaser 4 ne fait qu'afficher, gérer la caméra et l'interface. Phaser 4 est sorti en version stable en 2026 (v4.1.0 en avril 2026, licence MIT), avec un moteur de rendu WebGL reconstruit et une API proche de Phaser 3.

## Pile

| Élément | Choix | Raison |
| --- | --- | --- |
| Langage | JavaScript (ES modules), typage JSDoc | Pas d'étape de compilation TypeScript, aide de l'éditeur conservée |
| Rendu | Phaser 4 (`phaser` sur npm) | Caméra, zoom, textures, scènes, entrées |
| Build | Vite | Démarrage instantané, build statique pour GitHub Pages, Web Workers natifs (`new Worker(new URL(...), { type: 'module' })`) |
| Simulation | Web Worker dédié | Rendu fluide quelle que soit la charge |
| Aléatoire | Générateur à graine (mulberry32 ou sfc32) | Parties reproductibles |
| Bruit | Simplex maison (`src/sim/world/noise.js`) | Biomes ; identique sur tous les moteurs JS et indépendant des mises à jour de dépendances (décision 0004) |
| Tests | Vitest | Logique de simulation testée sans navigateur |
| Qualité | ESLint + Prettier | Style homogène entre agents |

## Structure du dépôt

```
pixel_civilization/
├── CLAUDE.md
├── README.md
├── index.html
├── package.json
├── vite.config.js
├── data/
│   ├── world.json           # taille des blocs, champs de bruit, biomes, apparition
│   ├── resources.json       # ressources, couleurs, règles de placement
│   ├── recipes.json         # recettes et stations
│   ├── ai-goals.json        # objectifs, considérations, courbes
│   ├── ai-projects.json     # méthodes de décomposition des projets (HTN)
│   ├── genome.json          # gènes de décision, plages, mutation
│   └── balance.json         # toutes les constantes d'équilibrage
├── src/
│   ├── main.js              # configuration Phaser, création du Worker
│   ├── bridge/              # client du protocole Worker (côté rendu)
│   ├── scenes/              # BootScene, MenuScene, WorldScene, UIScene
│   ├── render/              # palette, couche des blocs (pool de textures), caméra, calques
│   ├── ui/                  # inspecteur, tableau de bord, chronique, contrôles du temps
│   ├── worker/              # hôte temps réel du Worker : cadence (scheduler), messages
│   └── sim/                 # tourne dans le Worker — aucun import de Phaser ni du DOM
│       ├── simulation.js    # classe Simulation : step(n), time(), hash()
│       ├── protocol.js      # types de messages Worker ↔ rendu
│       ├── core/            # rng, horloge de cycles, hash d'état, bus d'événements
│       ├── world/           # génération, blocs, régénération, menaces
│       ├── ecs/             # entités, composants (tableaux typés), registre
│       ├── systems/         # un fichier par système (voir ordre ci-dessous)
│       ├── ai/              # utility, goap, htn, imagination, influence, blackboard,
│       │                    # social-model, learning, genome, thinkers (Workers penseurs)
│       ├── knowledge/       # mémoire, cartes, livres, bibliothèques, transmission
│       ├── crafting/        # recettes, stations, découverte
│       └── harmony/         # score d'harmonie
├── tests/
│   ├── sim/                 # tests unitaires et de scénarios
│   └── determinism.test.js  # même graine → même hash d'état
├── tools/
│   └── headless-sim.js      # simulation sans rendu en ligne de commande
├── docs/
│   ├── design/
│   └── decisions/
└── .github/workflows/deploy.yml
```

## Modèle de données (ECS léger)

- **Entités** : entiers de 0 à `MAX_ENTITIES − 1`, avec une liste de recyclage des identifiants libres.
- **Composants** : un tableau typé par champ, indexé par entité (structure de tableaux).

```js
// src/sim/ecs/components.js (illustration)
export const Position = { x: new Int32Array(MAX), y: new Int32Array(MAX) };
export const Needs = { hunger: new Float32Array(MAX), thirst: new Float32Array(MAX), /* ... */ };
```

- Les données de taille variable (mémoire, inventaire, plan, journal) vivent dans des structures dédiées indexées par entité, à capacité fixe et réutilisées (pas d'allocation dans la boucle chaude).
- **Monde** : `Map<chunkKey, Chunk>` avec `chunkKey = cx * 73856093 ^ cy * 19349663` ou une chaîne `"cx,cy"` si les collisions posent problème ; chaque `Chunk` contient ses `Uint8Array`, un drapeau `dirty` et le cycle de dernière simulation.

## Ordre des systèmes dans un cycle

L'ordre est fixe et documenté ; le modifier exige une décision dans `docs/decisions/`.

1. `timeSystem` — avance l'horloge, gère jour/nuit.
2. `worldSystem` — régénération, propagation du feu, intempéries, activation et gel des blocs.
3. `threatSystem` — déplacement des prédateurs.
4. `needsSystem` — évolution des jauges.
5. `perceptionSystem` — perception de chaque individu.
6. `memorySystem` — mise à jour et oubli (balayage tous les 100 cycles).
7. `decisionSystem` — Utility AI et GOAP, étalés et sur interruption.
8. `actionSystem` — exécution des actions (mouvement, récolte, fabrication, construction, lecture, écriture), puis mise à jour de l'expérience apprise à la fin de chaque action.
9. `combatSystem` — résolution des combats.
10. `socialSystem` — transmission orale, imitation, tableau noir.
11. `lifecycleSystem` — réplication (héritage et mutation des attributs et du génome), mort.
12. `harmonySystem` — à chaque aube.
13. `eventSystem` — collecte des événements pour la chronique et le rendu.

## Aléatoire et déterminisme

- `createRng(seed)` retourne un générateur ; chaque sous-système dérive son propre flux (`rng.fork('world')`, `rng.fork('ai')`…) pour qu'un changement dans un système n'altère pas les tirages des autres.
- Les individus sont toujours parcourus par identifiant croissant.
- `hashState(state)` produit un hash (FNV-1a) des composants et blocs actifs ; le test de déterminisme compare deux exécutions.

## Protocole Worker ↔ rendu

Messages typés, objets simples ; les gros volumes passent en `ArrayBuffer` transférables.

| Sens | Type | Contenu |
| --- | --- | --- |
| Rendu → Worker | `init` | graine, version des données |
| Rendu → Worker | `setSpeed` | palier ou `max` |
| Rendu → Worker | `pause` / `resume` | — |
| Rendu → Worker | `skipTo` | `{ until: 'event' \| 'dawn' \| { day } }` |
| Rendu → Worker | `viewport` | rectangle visible en cases `{ x0, y0, x1, y1 }` |
| Rendu → Worker | `inspect` | identifiant d'entité ou position |
| Worker → Rendu | `frame` | cycle, positions des individus visibles (transférable), blocs modifiés dans la vue |
| Worker → Rendu | `chunk` | `cx`, `cy` et copies transférables des tableaux biome, ressource, quantité, altitude |
| Worker → Rendu | `stats` | tableau de bord, vitesse effective |
| Worker → Rendu | `events` | nouveaux événements de chronique |
| Worker → Rendu | `inspection` | détail d'une entité ou d'une case |

Le Worker n'envoie que ce qui intersecte le `viewport` plus une marge (`CHUNK_SEND_MARGIN` = 1 bloc), du plus proche au plus lointain, dans un budget de 6 ms par tranche (`src/worker/chunk-streamer.js`). Le rendu garde les blocs à moins de `CHUNK_KEEP_MARGIN` = 2 blocs de la vue et libère les autres ; le Worker oublie les mêmes, car les deux côtés utilisent la même fonction `chunksInRect`. Aucun message de déchargement n'est donc nécessaire. L'inspection d'une case lit la copie locale du bloc côté rendu, sans aller-retour.

## Cadence et vitesse

La cadence en temps réel vit dans `src/worker/` (`scheduler.js`, `sim-worker.js`), en dehors de `src/sim/` : c'est le seul endroit côté Worker où l'horloge réelle est lue. `src/sim/` ne connaît que les cycles (décision 0003).


- Pas fixe : 10 cycles par seconde à ×1.
- Le Worker exécute `vitesse × 10` cycles par seconde réelle, en lots, et mesure son temps de calcul. S'il ne tient pas, il plafonne et rapporte la vitesse effective.
- Mode Max : le Worker enchaîne les cycles et n'envoie `frame` que 10 fois par seconde.
- Saut à l'événement : le Worker tourne en mode Max jusqu'à ce que `eventSystem` émette un événement correspondant aux filtres, puis repasse à ×1.
- Rendu à 60 images par seconde, positions interpolées entre deux `frame` à ×1 et ×4.

## Budget de calcul de l'IA

Le rendu minimal tourne sur la carte graphique et coûte peu ; la simulation tourne sur le processeur. La puissance disponible pour l'IA se partage entre trois termes :

**nombre d'individus × intelligence par individu × vitesse d'accélération**

### Règles

- **L'intelligence ne dépend jamais de la vitesse ni de la machine.** Le budget de réflexion d'un cycle est exprimé en unités de travail (nœuds de recherche, tirages simulés) et fixé par `balance.json` et la population, pas par le temps réel. Une machine lente donne une vitesse effective plus faible, jamais des décisions différentes : c'est la condition du déterminisme.
- **Dégradation douce avec la population** : au-delà d'un seuil (ex. 200 individus), l'horizon et le nombre de tirages de la simulation mentale diminuent par paliers définis dans `balance.json`.
- **Répartition par importance** : les décisions courantes coûtent peu, les décisions stratégiques sont rares et mises en file d'attente (voir [06-ia](06-ia.md), « Budget de réflexion »).
- **Objectif de performance** : 500 individus à ×1 en moins de 4 ms par cycle (valeur actuelle de `CLAUDE.md`), mesuré par la simulation headless et suivi dans la CI.

### Parallélisme sur plusieurs cœurs (à partir de J5)

- Un Worker **coordinateur** possède l'état. Il délègue la phase de décision à K Workers **penseurs** (K = nombre de cœurs − 2, au plus 6).
- Chaque cycle de décision : le coordinateur envoie un instantané en lecture seule des données utiles (croyances, jauges, tableau noir) ; chaque penseur traite une tranche fixe d'individus (par identifiant) et renvoie des décisions ; le coordinateur les applique **dans l'ordre des identifiants**. Le résultat est identique quel que soit K, ce que vérifie un test (K = 1 et K = 4 donnent le même hash).
- Chaque individu a son propre flux aléatoire dérivé de `(graine, identifiant, cycle)`, pour que le tirage ne dépende pas du penseur qui le traite.
- GitHub Pages n'envoie pas les en-têtes COOP/COEP nécessaires à `SharedArrayBuffer`. Par défaut, les instantanés passent donc par des `ArrayBuffer` transférables. Si la copie devient le goulot d'étranglement, on évaluera un service worker qui ajoute ces en-têtes (technique `coi-serviceworker`) ; cela fera l'objet d'une décision dans `docs/decisions/`.

### Carte graphique (WebGPU, optionnel)

- Les calculs flottants sur GPU ne sont pas garantis identiques d'une carte à l'autre. Le GPU n'est donc utilisé que pour ce qui **n'influence pas** la simulation (calques d'affichage, visualisations), ou pour des calculs en entiers vérifiés identiques au résultat CPU.
- Toute décision d'IA reste calculée sur le processeur.

## Rendu Phaser

- `WorldScene` : une texture canevas 64 × 64 par bloc visible (`ChunkLayer`), peinte via une table de couleurs, mise à jour uniquement à la réception d'un bloc. Les textures libérées retournent dans un pool et sont réutilisées.
- Voile jour/nuit : un rectangle semi-transparent qui suit la vue, sous les individus (qui restent visibles la nuit).
- Couche des individus et des menaces : dessinée à chaque image (un `Graphics` ou une texture dynamique), au-dessus des blocs.
- `UIScene` : interface en superposition, indépendante du zoom de la caméra.
- Calques : textures basse résolution (une cellule d'influence = 1 pixel de texture, mise à l'échelle ×8).

## Simulation headless

`tools/headless-sim.js` importe `src/sim/` directement dans Node (sans Worker) pour simuler N jours à vitesse maximale et afficher un résumé (population, harmonie, recettes). Il sert à l'équilibrage et aux tests de non-régression.
