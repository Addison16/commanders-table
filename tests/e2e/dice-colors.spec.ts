import { expect, test, type Page } from '@playwright/test';
import type { Game } from '../../src/shared/schema.js';

async function saved(page: Page): Promise<Game> {
  return page.evaluate(
    () =>
      new Promise<Game>((resolve, reject) => {
        const open = indexedDB.open('mtg-util', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('records').objectStore('records').get('active');
          read.onsuccess = () => {
            db.close();
            resolve(read.result.game);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
}

async function coloredPixels(page: Page, color: 'blue' | 'rose') {
  return page.locator('.dice-canvas').evaluate((canvas: HTMLCanvasElement, color) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b, a] = pixels.slice(i, i + 4);
      if (a > 200 && (color === 'blue' ? b > r + 15 && b > g + 5 : r > b + 15 && r > g + 25)) count++;
    }
    return count;
  }, color);
}

test('player dice use colored pearl bodies and preserve the seat through rerolls, percentile dice and replay', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  await page.getByRole('button', { name: 'Player 1 details', exact: true }).click();
  await page.getByText('Edit player & commanders', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Player color', exact: true }).selectOption('blue');
  await page.getByRole('button', { name: 'Save player', exact: true }).click();
  await page.getByRole('button', { name: 'Close Player 1', exact: true }).click();
  const playerId = (await saved(page)).order[0];
  await page.getByRole('button', { name: 'Utilities', exact: true }).click();
  await page.getByRole('combobox', { name: 'Roll for', exact: true }).selectOption(playerId);
  await page.getByRole('button', { name: 'd6', exact: true }).click();
  await page.getByRole('combobox', { name: 'Number of dice', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Roll 2d6', exact: true }).click();
  await expect(page.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
  await expect(page.locator('.dice-screen-heading')).toContainText('rolled for Player 1');
  await expect.poll(() => coloredPixels(page, 'blue')).toBeGreaterThan(500);
  const first = (await saved(page)).rolls[0];
  expect(first.playerId).toBe(playerId);
  await page.getByRole('button', { name: 'Roll again', exact: true }).click();
  await expect.poll(async () => (await saved(page)).rolls[0].id).not.toBe(first.id);
  expect((await saved(page)).rolls[0].playerId).toBe(playerId);
  await expect.poll(() => coloredPixels(page, 'blue')).toBeGreaterThan(500);
  await page.getByRole('button', { name: 'Back to game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Utilities', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Roll for', exact: true })).toHaveValue(playerId);
  await page.locator('.roll-history-button').first().click();
  await expect(page.locator('.dice-screen-heading')).toContainText('rolled for Player 1');
  await expect.poll(() => coloredPixels(page, 'blue')).toBeGreaterThan(500);
  await page.getByRole('button', { name: 'Back to game', exact: true }).click();
  await page.getByRole('button', { name: 'Utilities', exact: true }).click();
  await page.getByRole('button', { name: 'd100', exact: true }).click();
  await page.getByRole('button', { name: 'Roll 1d100', exact: true }).click();
  await expect(page.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
  await expect.poll(() => coloredPixels(page, 'blue')).toBeGreaterThan(500);
  expect((await saved(page)).rolls[0].playerId).toBe(playerId);
  await page.getByRole('button', { name: 'Back to game', exact: true }).click();
  await page.getByRole('button', { name: 'Player 2 details', exact: true }).click();
  await page.getByText('Edit player & commanders', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Player color', exact: true }).selectOption('rose');
  await page.getByRole('button', { name: 'Save player', exact: true }).click();
  await page.getByRole('button', { name: 'Close Player 2', exact: true }).click();
  await page.getByRole('button', { name: 'Utilities', exact: true }).click();
  await page.evaluate(() => {
    const random = crypto.getRandomValues.bind(crypto);
    const values = [0, 5, 10, 15];
    Object.defineProperty(crypto, 'getRandomValues', {
      value: (array: Uint32Array<ArrayBuffer>) => {
        if (array instanceof Uint32Array && array.length === 1 && values.length) {
          array[0] = values.shift()!;
          return array;
        }
        return random(array);
      },
    });
  });
  await page.getByRole('button', { name: 'd20 for everyone', exact: true }).click();
  await expect(page.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
  expect((await saved(page)).rolls[0].rounds).toHaveLength(1);
  await expect.poll(() => coloredPixels(page, 'blue')).toBeGreaterThan(300);
  await expect.poll(() => coloredPixels(page, 'rose')).toBeGreaterThan(300);
  if (info.project.name === 'chromium-phone') {
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.screenshot({ path: 'docs/screenshots/player-colored-dice.png' });
  }
});
