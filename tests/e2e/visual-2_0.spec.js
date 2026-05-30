const { test, expect } = require('@playwright/test');
const cp = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const USER = process.env.W0PIUM_VISUAL_USER || 'demo_artist';
const PASS = process.env.W0PIUM_VISUAL_PASS || 'w0pium-demo-2026';

test.beforeAll(() => {
  if (process.env.W0PIUM_VISUAL_NO_SEED === '1') return;
  cp.execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed-2.0.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
});

async function login(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#aUser')).toBeVisible();
  await page.fill('#aUser', USER);
  await page.fill('#aPass', PASS);
  await page.locator('[data-post-action="do-auth"]').click();
  await expect(page.locator('#aUser')).toHaveCount(0);
}

async function setTheme(page, theme) {
  await page.addInitScript(value => {
    // eslint-disable-next-line no-undef
    localStorage.setItem('theme', value);
  }, theme);
}

test.describe('W0PIUM 2.0 visual QA dataset', () => {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    for (const theme of ['dark', 'light']) {
      test(`${viewport.name} ${theme} core surfaces render`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await setTheme(page, theme);

        const runtimeErrors = [];
        page.on('console', msg => {
          if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) runtimeErrors.push(msg.text());
        });
        page.on('pageerror', err => runtimeErrors.push(err.message));

        await login(page);

        const routes = [
          ['feed', '/', '#posts'],
          ['discover', '/discover', '.discover-toolbar'],
          ['profile', `/profile/${USER}`, '.profile-tabs'],
          ['drops', '/drops', '#dropList'],
          ['chats', '/chats', '.chat-row'],
          ['chat', '/chat/seed-chat-dm', '#chatMsgs'],
          ['disk', '/disk', '#diskGrid'],
          ['notifications', '/notifications', '#app'],
          ['settings', '/settings', '.settings'],
        ];

        for (const [name, url, readySelector] of routes) {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await expect(page.locator(readySelector).first()).toBeVisible();
          await page.screenshot({
            path: testInfo.outputPath(`${viewport.name}-${theme}-${name}.png`),
            fullPage: true,
          });
        }

        expect(runtimeErrors).toEqual([]);
      });
    }
  }
});
