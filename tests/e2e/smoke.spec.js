const { test, expect } = require('@playwright/test');

test.describe('W0PIUM smoke (NAS-safe)', () => {
  test('health endpoint is OK', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['x-request-id']).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('spa shell HTML is served', async ({ request }) => {
    const res = await request.get('/');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('W0PIUM');
    expect(html).toContain('id="app"');
    expect(html).toContain('id="navLinks"');
  });

  test('search route serves SPA shell for anonymous user', async ({ request }) => {
    const res = await request.get('/search');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('id="app"');
    expect(html).toContain('/app.js');
  });

  test('unauthenticated API guard stays enforced', async ({ request }) => {
    const res = await request.get('/api/me');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(String(body.error || '').toLowerCase()).toContain('unauth');
  });

  test('critical static assets are available', async ({ request }) => {
    const assets = ['/app.js', '/style.css', '/manifest.json', '/service-worker.js'];
    for (const asset of assets) {
      const res = await request.get(asset);
      expect(res.ok(), `${asset} should be reachable`).toBeTruthy();
    }
  });
});
