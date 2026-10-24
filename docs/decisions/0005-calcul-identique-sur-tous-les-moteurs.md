# 0005 — Calcul identique sur tous les moteurs JavaScript

- **Date** : 2026-10-24
- **Statut** : acceptée
- **Documents concernés** : `CLAUDE.md`, `docs/design/06-ia.md`, `eslint.config.js`, `tests/sim/purity.test.js`

## Contexte

Le déterminisme exige qu'une graine donne le même résultat sur Chrome, Firefox et Safari. La norme ECMAScript garantit le résultat exact des opérations `+`, `-`, `×`, `/`, `Math.floor`, `Math.round`, `Math.sqrt`, `Math.abs`, `Math.min`, `Math.max`, mais pas celui de `Math.exp`, `Math.pow`, `Math.log`, `Math.sin` et des autres fonctions transcendantes, ni de l'opérateur `**` (équivalent à `Math.pow`). Une différence d'un bit suffit à faire diverger une partie.

## Décision

Dans `src/sim/`, ces fonctions et l'opérateur `**` sont interdits. Les courbes de réponse de l'IA utilisent des formes polynomiales (linéaire, puissance entière par multiplications, smoothstep) à la place de la logistique. ESLint et le test de pureté le vérifient.

## Conséquences

- Les parties restent reproductibles d'un navigateur à l'autre.
- Les distances se comparent au carré ; une racine carrée reste permise quand la vraie distance est nécessaire.

## Complément (J3)

L'oubli suit une exponentielle (courbe d'Ebbinghaus). `src/sim/core/math.js` fournit `expNeg(x)` = e^(−x), calculée par réduction de l'argument puis série de Taylor, avec uniquement `+`, `-`, `×`, `/` : même résultat au bit près sur tous les moteurs, écart relatif à `Math.exp` inférieur à 10⁻¹² (testé).
