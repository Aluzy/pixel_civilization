import js from '@eslint/js';
import globals from 'globals';

// Determinism and separation rules from CLAUDE.md, enforced on src/sim/.
const SIM_RESTRICTIONS = {
  'no-restricted-imports': [
    'error',
    {
      paths: [{ name: 'phaser', message: 'src/sim must not depend on the renderer.' }],
      patterns: [
        {
          group: ['**/render/**', '**/scenes/**', '**/ui/**', '**/bridge/**', '**/worker/**'],
          message: 'src/sim must not import rendering or host code.',
        },
      ],
    },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: 'No DOM in src/sim.' },
    { name: 'document', message: 'No DOM in src/sim.' },
    { name: 'performance', message: 'Use ticks, never real time, in src/sim.' },
    { name: 'setTimeout', message: 'Real-time scheduling belongs to src/worker.' },
    { name: 'setInterval', message: 'Real-time scheduling belongs to src/worker.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded rng (src/sim/core/rng.js).' },
    { object: 'Date', property: 'now', message: 'Use ticks, never real time, in src/sim.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date']",
      message: 'Use ticks, never real time, in src/sim.',
    },
  ],
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly' },
    },
  },
  {
    files: ['src/worker/**/*.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
  {
    files: ['src/sim/**/*.js'],
    // Only platform-neutral globals: no DOM, no timers, no clocks.
    languageOptions: { globals: { TextEncoder: 'readonly' } },
    rules: SIM_RESTRICTIONS,
  },
  {
    files: ['tests/**/*.js', 'tools/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
