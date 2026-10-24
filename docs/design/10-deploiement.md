# 10 — Déploiement GitHub Pages

Chaque push sur `main` lance les tests, construit le projet avec Vite et le publie sur GitHub Pages via GitHub Actions.

## Mise en place (une fois)

1. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. Dans `vite.config.js`, définir la base sur le nom du dépôt :

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/pixel_civilization/',
  worker: { format: 'es' },
});
```

Sans la bonne `base`, les fichiers ne se chargent pas sur Pages.

3. Ajouter `.github/workflows/deploy.yml` :

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Vérifier au moment de l'implémentation que ces versions d'actions sont toujours les plus récentes.

4. Le jeu est publié à l'adresse `https://aluzy.github.io/pixel_civilization/`.

## État actuel

- Les workflows sont dans `.github/workflows/` (`deploy.yml`, `ci.yml`).
- Tant que `package-lock.json` n'est pas versionné, les workflows utilisent `npm install` ; dès qu'il l'est, ils passent automatiquement à `npm ci`. Versionner le fichier de verrouillage est recommandé pour des builds reproductibles.

## Intégration continue des pull requests

Un second workflow `ci.yml` exécute l'installation, `npm run lint`, `npm run format:check`, `npm test` et `npm run build` sur chaque pull request et chaque branche autre que `main`, sans déployer.

## Règles

- Le déploiement échoue si un test échoue : rien de cassé n'est publié.
- Le numéro de version (`package.json`) et le hash court du commit sont injectés au build (`define` de Vite) et affichés dans l'interface.
- Une étiquette git `vX.Y.0` marque la fin de chaque jalon (`v0.1.0` = J0, `v0.2.0` = J1…).
