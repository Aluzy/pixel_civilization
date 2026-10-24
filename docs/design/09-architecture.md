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
| Bruit | `simplex-noise` | Biomes |
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
│   ├── resources.json       # ressources, couleurs, biomes
│   ├── recipes.json         # recettes et stations
│   ├── ai-goals.json        # objectifs, considérations, courbes
│   └── balance.json         # toutes les constantes d'équilibrage
├── src/
│   ├── main.js              # configuration Phaser, création du Worker
│   ├── bridge/              # client du protocole Worker (côté rendu)
│   ├── scenes/              # BootScene, MenuScene, WorldScene, UIScene
│   ├── render/              # textures de blocs, couche des individus, calques
│   ├── ui/                  # inspecteur, tableau de bord, chronique, contrôles du temps
│   └── sim/                 # tourne dans le Worker — aucun import de Phaser ni du DOM
│       ├── worker.js        # point d'entrée du Worker, boucle de cycles
│       ├── core/            # rng, horloge de cycles, hash d'état, bus d'événements
│       ├── world/           # génération, blocs, régénération, menaces
│       ├── ecs/             # entités, composants (tableaux typés), registre
│       ├── systems/         # un fichier par système (voir ordre ci-dessous)
│       ├── ai/              # utility, goap, influence, blackboard, tasks
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
8. `actionSystem` — exécution des actions (mouvement, récolte, fabrication, construction, lecture, écriture).
9. `combatSystem` — résolution des combats.
10. `socialSystem` — transmission orale, imitation, tableau noir.
11. `lifecycleSystem` — réplication, mort.
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
| Rendu → Worker | `viewport` | rectangle visible en cases, zoom |
| Rendu → Worker | `inspect` | identifiant d'entité ou position |
| Worker → Rendu | `frame` | cycle, positions des individus visibles (transférable), blocs modifiés dans la vue |
| Worker → Rendu | `chunk` | `cx`, `cy`, tampon de cases (transférable) |
| Worker → Rendu | `stats` | tableau de bord, vitesse effective |
| Worker → Rendu | `events` | nouveaux événements de chronique |
| Worker → Rendu | `inspection` | détail d'une entité ou d'une case |

Le Worker n'envoie que ce qui intersecte le `viewport` (plus une marge d'un bloc).

## Cadence et vitesse

- Pas fixe : 10 cycles par seconde à ×1.
- Le Worker exécute `vitesse × 10` cycles par seconde réelle, en lots, et mesure son temps de calcul. S'il ne tient pas, il plafonne et rapporte la vitesse effective.
- Mode Max : le Worker enchaîne les cycles et n'envoie `frame` que 10 fois par seconde.
- Saut à l'événement : le Worker tourne en mode Max jusqu'à ce que `eventSystem` émette un événement correspondant aux filtres, puis repasse à ×1.
- Rendu à 60 images par seconde, positions interpolées entre deux `frame` à ×1 et ×4.

## Rendu Phaser

- `WorldScene` : une texture 64 × 64 par bloc visible, mise à jour uniquement à la réception d'un bloc modifié. Pool de textures réutilisées.
- Couche des individus et des menaces : dessinée à chaque image (un `Graphics` ou une texture dynamique), au-dessus des blocs.
- `UIScene` : interface en superposition, indépendante du zoom de la caméra.
- Calques : textures basse résolution (une cellule d'influence = 1 pixel de texture, mise à l'échelle ×8).

## Simulation headless

`tools/headless-sim.js` importe `src/sim/` directement dans Node (sans Worker) pour simuler N jours à vitesse maximale et afficher un résumé (population, harmonie, recettes). Il sert à l'équilibrage et aux tests de non-régression.
