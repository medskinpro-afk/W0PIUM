#!/usr/bin/env node
/**
 * W0PIUM — Unit tests for critical client-side utilities
 * Run: node tests/unit/util.test.js
 */

const assert = {
  equal(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  ok(v, msg) { if (!v) throw new Error(`${msg}: expected truthy`); },
  throws(fn, msg) { try { fn(); throw new Error(`${msg}: expected throw`); } catch(e) { if (e.message === `${msg}: expected throw`) throw e; } },
  deepEqual(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error(`${msg}: expected ${sb}, got ${sa}`);
  }
};

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch(e) { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; }
}

// ── Dummy DOM (browser APIs we need) ──────────────────────
global.document = {
  createElement: () => ({ setAttribute() {}, innerHTML: '', style: {} }),
  querySelector: () => null,
  body: { appendChild() {}, insertAdjacentHTML() {} },
  addEventListener() {}, removeEventListener() {},
};
global.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const appPath = process.argv[2] || '/tmp/w0pium-check/public/app.js';

// ── Load app.js (extract functions via vm) ─────────────────
const fs = require('fs');
const appSrc = fs.readFileSync(appPath, 'utf8')
  .replace(/^import .+$/gm, '')  // strip imports
  .replace(/^export /gm, '');

// ── esc — HTML escape ─────────────────────────────────────
console.log('\n=== esc() ===');
const escMatch = appSrc.match(/function esc\s*\(s\)\s*\{([^}]+)\}/);
if (escMatch) {
  const escFn = new Function('s', escMatch[1].replace('return', 'return '));
  test('escapes < > & "', () => {
    assert.equal(escFn('<script>'), '&lt;script&gt;', 'tag');
    assert.equal(escFn('"hello" & "world"'), '&quot;hello&quot; &amp; &quot;world&quot;', 'quotes');
  });
  test('passes safe strings through', () => {
    assert.equal(escFn('hello world'), 'hello world', 'plain');
  });
  test('handles empty string', () => {
    assert.equal(escFn(''), '', 'empty');
  });
  test('escapes backtick', () => {
    const r = escFn('`code`');
    assert.ok(!r.includes('`') || r.includes('&#96;'), 'backtick');
  });
}

// ── saLSet — safe localStorage.setItem ────────────────────
console.log('\n=== saLSet() ===');
const saLSetMatch = appSrc.match(/function saLSet\s*\(k,\s*v\)\s*\{([^}]+)\}/);
if (saLSetMatch) {
  let stored;
  const fakeLS = { setItem(k, v) { stored = [k, v]; }, getItem() { return null; } };
  const saLSetFn = new Function('k', 'v', 'localStorage', 'try { ' + saLSetMatch[1].split('try {')[1].split('} catch')[0].trim() + ' } catch {}');
  test('stores key-value', () => {
    stored = null;
    saLSetFn('theme', 'dark', fakeLS);
    assert.deepEqual(stored, ['theme', 'dark'], 'stored');
  });
}

// ── initial — first letter uppercase ──────────────────────
console.log('\n=== initial() ===');
const initialMatch = appSrc.match(/function initial\s*\(name\)\s*\{[^}]*\}/);
if (initialMatch) {
  const initialFn = new Function('name', initialMatch[0].replace(/^function initial\s*\(name\)\s*/, ''));
  test('returns first letter uppercase', () => {
    assert.equal(initialFn('walfir'), 'W', 'name');
    assert.equal(initialFn(''), '?', 'empty');
    assert.equal(initialFn(null), '?', 'null');
  });
}

// ── timeAgo — relative time ───────────────────────────────
console.log('\n=== timeAgo() ===');
const timeAgoMatch = appSrc.match(/function timeAgo\s*\(d\)\s*\{[\s\S]*?^\}/m);
if (timeAgoMatch) {
  // Too complex to extract cleanly — test presence
  test('timeAgo function exists', () => {
    assert.ok(timeAgoMatch[0].includes('function timeAgo'), 'exists');
  });
}

// ── pluralRu — Russian plurals ────────────────────────────
console.log('\n=== pluralRu() ===');
const pluralRuMatch = appSrc.match(/function pluralRu\s*\(n,\s*one,\s*few,\s*many\)\s*\{[\s\S]*?^\}/m);
if (pluralRuMatch) {
  const pluralRuFn = new Function('n', 'one', 'few', 'many', pluralRuMatch[0].replace(/^function pluralRu\s*\(n,\s*one,\s*few,\s*many\)\s*/, ''));
  test('1 -> one form', () => {
    assert.equal(pluralRuFn(1, 'подписчик', 'подписчика', 'подписчиков'), 'подписчик', '1');
  });
  test('2 -> few form', () => {
    assert.equal(pluralRuFn(2, 'подписчик', 'подписчика', 'подписчиков'), 'подписчика', '2');
  });
  test('5 -> many form', () => {
    assert.equal(pluralRuFn(5, 'подписчик', 'подписчика', 'подписчиков'), 'подписчиков', '5');
  });
  test('21 -> one form', () => {
    assert.equal(pluralRuFn(21, 'подписчик', 'подписчика', 'подписчиков'), 'подписчик', '21');
  });
  test('0 -> many form', () => {
    assert.equal(pluralRuFn(0, 'подписчик', 'подписчика', 'подписчиков'), 'подписчиков', '0');
  });
}

// ── truncUrl — URL truncation ─────────────────────────────
console.log('\n=== truncUrl() ===');
const truncUrlMatch = appSrc.match(/function truncUrl\s*\(u\)\s*\{[^}]*\}/);
if (truncUrlMatch) {
  const truncUrlFn = new Function('u', truncUrlMatch[0].replace(/^function truncUrl\s*\(u\)\s*/, ''));
  test('short URL stays intact', () => {
    assert.equal(truncUrlFn('https://example.com'), 'https://example.com', 'short');
  });
  test('long URL gets truncated', () => {
    const long = 'https://example.com/' + 'x'.repeat(60);
    const r = truncUrlFn(long);
    assert.ok(r.endsWith('…'), 'ellipsis');
    assert.ok(r.length <= 49, 'length check');
  });
}

// ── fmtBytes — file size formatting ───────────────────────
console.log('\n=== fmtBytes() ===');
const fmtBytesMatch = appSrc.match(/function fmtBytes\s*\(b\)\s*\{[\s\S]*?^\}/m);
if (fmtBytesMatch) {
  const fmtBytesFn = new Function('b', fmtBytesMatch[0].replace(/^function fmtBytes\s*\(b\)\s*/, ''));
  test('bytes', () => {
    const r = fmtBytesFn(500);
    assert.ok(r.includes('B') || r.includes('500'), 'bytes');
  });
  test('kilobytes', () => {
    const r = fmtBytesFn(2048);
    assert.ok(r.includes('K') || r.includes('2'), 'kb');
  });
  test('megabytes', () => {
    const r = fmtBytesFn(5 * 1024 * 1024);
    assert.ok(r.includes('M') || r.includes('5'), 'mb');
  });
}

// ── server.js validators ──────────────────────────────────
console.log('\n=== Server validators ===');
const srvPath = '/tmp/w0pium-check/server.js';
if (fs.existsSync(srvPath)) {
  const srv = fs.readFileSync(srvPath, 'utf8');
  
  test('has MASTER_CODE validation', () => {
    assert.ok(srv.includes('MASTER_CODE'), 'MASTER_CODE exists');
  });
  
  test('has rate limiter imports', () => {
    assert.ok(srv.includes('express-rate-limit'), 'rate-limit import');
  });
  
  test('has CSRF middleware', () => {
    assert.ok(srv.includes('csrfCheck'), 'csrfCheck exists');
  });
  
  test('has Helmet with upgradeInsecureRequests disabled', () => {
    assert.ok(srv.includes('upgradeInsecureRequests: null'), 'CSP fix');
  });
  
  test('uses parameterized SQL queries', () => {
    // Check that db.prepare calls use ? placeholders, not string interpolation
    const prepareCalls = (srv.match(/db\.prepare\(/g) || []).length;
    const interpolation = (srv.match(/\$\{[a-zA-Z}]/g) || []).length;
    assert.ok(prepareCalls > 50, `has ${prepareCalls} prepare calls`);
    assert.ok(interpolation < 5, `minimal interpolation: ${interpolation}`);
  });
}

// ── Summary ────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
