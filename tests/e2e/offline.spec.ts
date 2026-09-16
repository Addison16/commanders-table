import { test, expect } from '@playwright/test';
test('production shell reopens offline while private API responses remain uncached', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    process.env.E2E_PWA !== '1',
    'Requires a production build served on HTTPS or localhost; run the documented production PWA check.',
  );
  test.skip(
    browserName === 'webkit',
    'Use npm run test:pwa: WebKit offline navigation is verified by an actual server outage rather than setOffline emulation.',
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole('button', { name: "Decrease Player 1's life" }).click();
  await expect(page.getByText('Saved here')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await page.getByRole('button', { name: "Decrease Player 1's life" }).click();
  await expect(page.getByTestId('life-0')).toHaveText('38');
  const cachedPrivate = await page.evaluate(async () => {
    const matches = await Promise.all(
      (await caches.keys()).map(async (name) => {
        const cache = await caches.open(name);
        return (await cache.keys()).some((request) => new URL(request.url).pathname.startsWith('/api/'));
      }),
    );
    return matches.some(Boolean);
  });
  expect(cachedPrivate).toBe(false);
});
