const { test, expect } = require('@playwright/test');

function needEnv(name) {
  const v = process.env[name];
  return v && String(v).trim();
}

test.describe('DM browser flow', () => {
  test('login -> open/create DM -> send message', async ({ page }) => {
    const user = needEnv('DM_E2E_USER');
    const pass = needEnv('DM_E2E_PASS');
    const targetUsername = needEnv('DM_E2E_TARGET');

    test.skip(!user || !pass || !targetUsername, 'Set DM_E2E_USER, DM_E2E_PASS, DM_E2E_TARGET');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#aUser')).toBeVisible();
    await page.fill('#aUser', user);
    await page.fill('#aPass', pass);
    await page.getByRole('button', { name: 'ВОЙТИ' }).click();

    // Ensure auth session is alive
    const meRes = await page.request.get('/api/me');
    expect(meRes.ok()).toBeTruthy();

    // Resolve target and create/open DM via API (stable path), then verify in UI
    const targetRes = await page.request.get(`/api/user/${encodeURIComponent(targetUsername)}`);
    expect(targetRes.ok()).toBeTruthy();
    const target = await targetRes.json();
    expect(target.id).toBeTruthy();

    const startRes = await page.request.post(`/api/chats/start/${encodeURIComponent(target.id)}`);
    expect(startRes.ok()).toBeTruthy();
    const startData = await startRes.json();
    expect(startData.id).toBeTruthy();
    const cid = startData.id;

    await page.goto(`/chat/${cid}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#msgText')).toBeVisible();

    const marker = `e2e-dm-${Date.now()}`;
    await page.fill('#msgText', marker);
    await page.keyboard.press('Enter');

    await expect(page.locator('.msg.me .msg-text').filter({ hasText: marker })).toBeVisible();
  });
});
