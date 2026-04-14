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
  // ── Frontend SPA (browser globals, vanilla JS) ─────────────────────────
  {
    files: ['public/app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      // app.js intentionally uses many globals — relax undef/unused
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'always'],
      'no-var': 'warn',
    },
  },
  // ── Frontend utilities (IIFE modules, window globals) ──────────────────
  {
    files: ['public/utils/*.js', 'public/hooks/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  // ── Service Worker (ServiceWorkerGlobalScope) ───────────────────────────
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
  // ── Vite / PostCSS config files ─────────────────────────────────────────
  {
    files: ['vite.config.mjs', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  // ── Global ignores ──────────────────────────────────────────────────────
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
