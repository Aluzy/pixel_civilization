import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SIM_DIR = new URL('../../src/sim/', import.meta.url).pathname;

// Mirrors the invariants in CLAUDE.md; ESLint enforces the same rules in the editor.
const FORBIDDEN = [
  { pattern: /Math\.random\s*\(/, reason: 'Math.random (use the seeded rng)' },
  { pattern: /Date\.now\s*\(/, reason: 'Date.now (use ticks)' },
  { pattern: /performance\.now\s*\(/, reason: 'performance.now (use ticks)' },
  { pattern: /new\s+Date\s*\(/, reason: 'new Date (use ticks)' },
  { pattern: /from\s+['"]phaser['"]/, reason: 'Phaser import' },
  { pattern: /\b(window|document)\./, reason: 'DOM access' },
  {
    pattern: /Math\.(exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|a?sinh?|a?cosh?|a?tanh?|atan2)\s*\(/,
    reason: 'transcendental Math function (ADR 0005)',
  },
  { pattern: /\*\*/, reason: 'the ** operator (ADR 0005)' },
];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listJs(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listJs(path);
    return path.endsWith('.js') ? [path] : [];
  });
}

/**
 * Removes comments so that documentation mentioning a forbidden API does not fail the check.
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('src/sim purity', () => {
  const files = listJs(SIM_DIR);

  it('contains simulation files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${relative(SIM_DIR, file)} uses no forbidden API`, () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      const violations = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map((f) => f.reason);
      expect(violations).toEqual([]);
    });
  }
});
