#!/usr/bin/env node
/**
 * Runs ESLint from repo root. Use this as the npm "lint" script so Windows
 * UNC project paths work (cmd.exe used by npx/.cmd shims rejects UNC cwd).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
process.chdir(root);

const eslintJs = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const r = spawnSync(process.execPath, [eslintJs, '.'], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
