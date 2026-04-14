/**
 * cn() — lightweight class name utility (clsx + tailwind-merge style).
 * Zero dependencies, ~30 lines.
 *
 * Accepts: strings, arrays, objects ({ 'class-name': boolean })
 * Returns: deduplicated class string.
 *
 * Usage:
 *   cn('foo', 'bar')                       → 'foo bar'
 *   cn('foo', { bar: true, baz: false })   → 'foo bar'
 *   cn(['foo', null, undefined, 'bar'])    → 'foo bar'
 *   cn('px-2', condition && 'text-red')    → 'px-2 text-red' (if condition)
 */

(function () {
  function cn(...args) {
    const classes = [];
    for (const arg of args) {
      if (!arg) continue;
      if (typeof arg === 'string') {
        classes.push(arg);
      } else if (Array.isArray(arg)) {
        const inner = cn(...arg);
        if (inner) classes.push(inner);
      } else if (typeof arg === 'object') {
        for (const [key, val] of Object.entries(arg)) {
          if (val) classes.push(key);
        }
      }
    }
    // Deduplicate while preserving order (last wins for same base class)
    const seen = new Set();
    const deduped = [];
    for (const c of classes.reverse()) {
      // Extract base Tailwind class (e.g. 'text' from 'text-red', 'px' from 'px-2')
      const base = c.split('-')[0];
      if (!seen.has(base)) {
        deduped.unshift(c);
        seen.add(base);
      }
    }
    return deduped.join(' ');
  }

  window.cn = cn;
})();
