import { test, expect } from '@playwright/test';
test('local play commits, combines commander damage, and resumes without a server session', async ({
  page,
  context,
}, info) => {
  const sessions: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/session')) sessions.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  await expect(page.getByTestId('life-0')).toHaveText('40');
  if (info.project.name === 'chromium-phone')
    await page.screenshot({ path: 'docs/screenshots/four-player.png' });
  await page.getByRole('button', { name: "Decrease Player 1's life" }).click();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await expect(page.getByText('Saved here')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await page.getByRole('button', { name: 'Player 1 details', exact: true }).click();
  await page.getByLabel('Damage amount').fill('5');
  await page.getByRole('button', { name: 'Record combat damage', exact: true }).click();
  await page.getByRole('button', { name: 'Close Player 1', exact: true }).click();
  await expect(page.getByTestId('life-0')).toHaveText('34');
  await expect(page.getByText('Saved here')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await context.setOffline(true);
  await page.getByRole('button', { name: "Increase Player 2's life" }).click();
  await expect(page.getByTestId('life-1')).toHaveText('41');
  expect(sessions).toHaveLength(0);
});
test('JSON import/export, negative life, reduced motion and dialog navigation work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  await page.getByRole('button', { name: 'Player 1 details', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Exact life', exact: true }).fill('-123456');
  await page.locator('.counter-block').first().getByRole('button', { name: 'Set', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('life-0')).toHaveText('-123456');
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await page.getByRole('button', { name: 'Game history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The story so far' })).toBeVisible();
  await page.getByRole('button', { name: 'Close The story so far' }).click();
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export game backup', exact: true }).click();
  const file = await download;
  await page.getByText('Import a game backup', { exact: true }).click();
  await page.getByLabel('Choose JSON backup', { exact: true }).setInputFiles((await file.path())!);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByTestId('life-0')).toHaveText('-123456');
  await page.getByRole('button', { name: 'Utilities', exact: true }).click();
  await page.getByRole('button', { name: 'Roll 1d20', exact: true }).click();
  await expect(page.locator('.die')).toHaveCount(1);
  await expect(page.locator('.tumbling')).toHaveCount(0);
});
test('independent simultaneous touches increment exactly once per tap', async ({ page, context }, info) => {
  test.skip(
    info.project.name !== 'chromium-phone',
    'CDP touch injection is Chromium-specific; real touch holds are covered in both engines.',
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  const a = (await page.getByRole('button', { name: "Decrease Player 1's life" }).boundingBox())!,
    b = (await page.getByRole('button', { name: "Increase Player 2's life" }).boundingBox())!;
  const cdp = await context.newCDPSession(page);
  for (let n = 0; n < 5; n++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 1 },
        { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await expect(page.getByTestId('life-0')).toHaveText('35');
  await expect(page.getByTestId('life-1')).toHaveText('45');
  await expect(page.getByText('Saved here', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('life-0')).toHaveText('35');
});
test('HTTP LAN-compatible ID fallback and storage denial remain playable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('Storage denied');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 2 · 20 life' }).click();
  await expect(page.getByText('Changes aren’t being saved.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Decrease Player 1's life" }).click();
  await expect(page.getByTestId('life-0')).toHaveText('19');
});
test('hold cancels cleanly and keyboard remains usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 2 · 20 life' }).click();
  const minus = page.getByRole('button', { name: "Decrease Player 1's life" });
  const box = (await minus.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(620);
  await minus.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  expect(Number(await page.getByTestId('life-0').textContent())).toBeLessThan(19);
  const life = await page.getByTestId('life-0').textContent();
  await page.waitForTimeout(350);
  await expect(page.getByTestId('life-0')).toHaveText(life!);
  await minus.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('life-0')).toHaveText(String(Number(life) - 1));
});
test('two tabs require explicit takeover and cannot silently overwrite', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByText('Another tab controls this local game.')).toBeVisible();
  await expect(second.getByRole('button', { name: "Decrease Player 1's life" })).toBeDisabled();
  await second.getByRole('button', { name: 'Take over here', exact: true }).click();
  await second.getByRole('button', { name: "Decrease Player 1's life" }).click();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await expect(page.getByRole('button', { name: "Decrease Player 1's life" })).toBeDisabled();
});
test('mobile layouts retain reachable controls at every target size', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up a game' }).click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Let’s play' }).click();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const controls = await page
      .locator('.life-controls button')
      .evaluateAll((els) =>
        els.map((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })),
      );
    expect(controls.every((c) => c.w >= 44 && c.h >= 44)).toBe(true);
    await page.getByRole('button', { name: 'Player 8 details', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Player 8 details', exact: true })).toBeVisible();
  }
  if (info.project.name === 'chromium-phone') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'docs/screenshots/eight-player.png' });
  }
});
