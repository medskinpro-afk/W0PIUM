const fs = require('node:fs/promises');
const path = require('node:path');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

async function copyPublic() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.cp(publicDir, distDir, {
    recursive: true,
    filter: src => !src.endsWith(path.join('public', 'style.css')),
  });
}

async function buildCss() {
  const cssPath = path.join(publicDir, 'style.css');
  const css = await fs.readFile(cssPath, 'utf8');
  const result = await postcss([
    tailwindcss(path.join(root, 'tailwind.config.js')),
    autoprefixer,
  ]).process(css, {
    from: cssPath,
    to: path.join(distDir, 'style.css'),
  });
  await fs.writeFile(path.join(distDir, 'style.css'), result.css);
  if (result.map) await fs.writeFile(path.join(distDir, 'style.css.map'), result.map.toString());
}

async function main() {
  await copyPublic();
  await buildCss();
  console.log(`Built static app in ${path.relative(root, distDir)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
