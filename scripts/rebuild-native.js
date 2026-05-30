'use strict';
/**
 * Rebuild native addons from a repo on a UNC path (\\server\share\...).
 * npm/node-gyp spawn cmd.exe, which cannot use UNC as cwd — it falls back to
 * C:\Windows and breaks prebuild-install / node-gyp. We use `pushd` so cmd
 * maps the UNC to a temporary drive letter first.
 */
const { execSync } = require('child_process');
const path = require('path');

const root = process.env.npm_package_json
  ? path.dirname(process.env.npm_package_json)
  : path.resolve(__dirname, '..');

const pkgs = process.argv.slice(2).length ? process.argv.slice(2).join(' ') : 'better-sqlite3 sharp';

if (process.platform === 'win32') {
  const quoted = `"${String(root).replace(/"/g, '""')}"`;
  const inner = `pushd ${quoted} && npm rebuild ${pkgs} && popd`;
  execSync(inner, { stdio: 'inherit', shell: process.env.ComSpec || 'cmd.exe' });
} else {
  execSync(`npm rebuild ${pkgs}`, { cwd: root, stdio: 'inherit', shell: true });
}
