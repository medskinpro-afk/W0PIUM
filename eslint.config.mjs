import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  // ── Server (Node.js CJS) ────────────────────────────────────────────────
  {
    files: ['server.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  // ── Frontend (browser; all scripts under public/ except service worker) ─
  // Many functions are only referenced from HTML (onclick="…"). ESLint cannot see
  // those as "used", so no-unused-vars is off here (same idea as the old app.js-only block).
  {
    files: ['public/**/*.js'],
    ignores: ['public/service-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      eqeqeq: 'off',
      'no-var': 'warn',
    },
  },
  // ── Service Worker ─────────────────────────────────────────────────────
  {
    files: ['public/service-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // ── Playwright tests ───────────────────────────────────────────────────
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // ── Node tooling scripts ───────────────────────────────────────────────
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // ── Playwright config ──────────────────────────────────────────────────
  {
    files: ['playwright.config.js', 'playwright.prod.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['vite.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { 'no-unused-vars': 'off' },
  },
  {
    files: ['postcss.config.js', 'tailwind.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { 'no-unused-vars': 'off' },
  },
  // ── Global ignores ──────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'seed-users.js',
      'playwright-report/**',
      'test-results/**',
    ],
  },
];
