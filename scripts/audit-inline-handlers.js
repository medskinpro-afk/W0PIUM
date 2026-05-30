const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  path.join(ROOT, 'public', 'index.html'),
  path.join(ROOT, 'public', 'app.js'),
  path.join(ROOT, 'public', 'pages', 'chat.js'),
  path.join(ROOT, 'public', 'pages', 'drops.js'),
];

const INLINE_RE = /\son[a-z]+\s*=\s*["'][^"']*["']/g;
let total = 0;

for (const file of TARGETS) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const matches = [...text.matchAll(INLINE_RE)];
  if (!matches.length) continue;
  total += matches.length;
  console.log(`\n${path.relative(ROOT, file)}: ${matches.length}`);
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!INLINE_RE.test(lines[i])) continue;
    INLINE_RE.lastIndex = 0;
    console.log(`  L${i + 1}: ${lines[i].trim()}`);
  }
}

if (!total) {
  console.log('No inline DOM event handlers found.');
} else {
  console.log(`\nTotal inline handlers: ${total}`);
  process.exitCode = 1;
}
