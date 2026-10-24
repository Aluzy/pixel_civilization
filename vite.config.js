import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Short commit hash shown in the UI to make bug reports reproducible.
 * @returns {string}
 */
function readCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // GitHub Pages serves the site under the repository name.
  base: '/pixel_civilization/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(readCommit()),
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    // Phaser is large by nature; keep the warning meaningful for our own code.
    chunkSizeWarningLimit: 2500,
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
