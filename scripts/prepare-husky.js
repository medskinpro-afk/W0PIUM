#!/usr/bin/env node
/**
 * Runs husky only when .git exists (e.g. full clone). Network/checked-out trees
 * without .git should not fail npm install on "fatal: not in a git directory".
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(root, '.git'))) {
  process.exit(0);
}

const bin = path.join(root, 'node_modules', 'husky', 'bin.js');
if (!fs.existsSync(bin)) {
  process.exit(0);
}

const r = spawnSync(process.execPath, [bin], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
