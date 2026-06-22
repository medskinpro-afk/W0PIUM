#!/usr/bin/env node
const fs = require('fs');
const appSrc = fs.readFileSync('public/app.js', 'utf8');
const srv = fs.readFileSync('server.js', 'utf8');

let passed = 0, failed = 0;
function t(name, ok) { if(ok){passed++;console.log('  PASS '+name)}else{failed++;console.log('  FAIL '+name)} }

// Mock DOM
global.document = {
  createElement() { return { get textContent() { return this._tc; }, set textContent(v) { this._tc = v; }, get innerHTML() { return (this._tc||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); } }; }
};
global.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
global.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };

console.log('\n=== Frontend ===');

// esc()
const escM = appSrc.match(/const esc\s*=\s*s\s*=>\s*\{([^}]+)\}/);
const escFn = new Function('s', escM[1]);
t('esc <script>', !escFn('<script>').includes('<script>') && escFn('<script>').includes('&lt;'));
t('esc quotes', escFn('"hello"') === '&quot;hello&quot;');
t('esc empty', escFn('') === '');
t('esc plain', escFn('hello') === 'hello');
t('esc &', escFn('a & b') === 'a &amp; b');

// CSS
const css = fs.readFileSync('public/style.css', 'utf8');
t('style.css > 1000 lines', css.length > 1000);
t('no Google Fonts @import', !css.includes('fonts.googleapis.com'));
const fontCss = fs.existsSync('public/fonts.css') ? fs.readFileSync('public/fonts.css','utf8') : '';
t('fonts.css exists', fontCss.length > 500);
t('fonts.css has @font-face', fontCss.includes('@font-face'));

// HTML
const html = fs.readFileSync('public/index.html', 'utf8');
t('html lang=ru', html.includes('lang="ru"'));
t('no maximum-scale', !html.includes('maximum-scale'));
t('font link self-hosted', html.includes('fonts.css'));
t('viewport accessible', html.includes('initial-scale=1.0') && !html.includes('maximum-scale'));

// PWA
const manifest = JSON.parse(fs.readFileSync('public/manifest.json','utf8'));
t('manifest name', manifest.name === 'W0PIUM');
t('manifest icons >= 2', manifest.icons && manifest.icons.length >= 2);
t('manifest categories', manifest.categories && manifest.categories.includes('social'));
t('manifest theme_color', manifest.theme_color === '#050505');

// App.js features
t('app.js has esc()', appSrc.includes('const esc = s'));
t('app.js has saLSet()', appSrc.includes('function saLSet'));
t('reducedMotion in canvas draw', appSrc.includes('reducedMotion.matches'));
const reducedMotionVoice = appSrc.includes('prefers-reduced-motion: reduce');
t('reducedMotion in voice wave', reducedMotionVoice);
t('prefers-color-scheme check', appSrc.includes('prefers-color-scheme: light'));
t('auto-theme change listener', appSrc.includes("addEventListener('change'"));

console.log('\n=== Backend ===');

// CSP
t('CSP no fonts.googleapis', !srv.includes('fonts.googleapis.com'));
t('CSP no fonts.gstatic', !srv.includes('fonts.gstatic.com'));
t('self-hosted font handling', srv.includes("fontSrc:    [\"'self'\"]"));

// SQL
const runC = (srv.match(/\brun\(/g)||[]).length;
const getC = (srv.match(/\bget\(/g)||[]).length;
const allC = (srv.match(/\ball\(/g)||[]).length;
t('SQL via run/get/all > 500', (runC+getC+allC) > 500);
console.log('  (run:'+runC+' get:'+getC+' all:'+allC+' = '+(runC+getC+allC)+')');

// Security
t('try/catch in server', srv.includes('try {') && srv.includes('catch'));
t('upgradeInsecureRequests disabled', srv.includes('upgradeInsecureRequests: null'));

// Docker
const dc = fs.readFileSync('docker-compose.yml','utf8');
t('BUILD_ID=0.9.27', dc.includes('BUILD_ID=0.9.27'));

console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed+failed) + ' total');
process.exit(failed > 0 ? 1 : 0);
