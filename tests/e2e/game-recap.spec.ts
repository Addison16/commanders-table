import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Game } from '../../src/shared/schema.js';

async function localGame(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('mtg-util', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction('records').objectStore('records').get('active');
      return await new Promise<Game>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result.game);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

async function recap(page: Page) {
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await page.getByRole('button', { name: 'Share game recap', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Game recap', exact: true });
  await expect(sheet.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  return sheet;
}

async function downloadPng(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^command-table-recap-[a-f\d]{8}\.png$/u);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(700);
  return bytes;
}

test('active and final recaps export real PNGs without changing the saved game or guessing a winner', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life', exact: true }).click();
  await page.getByRole('button', { name: "Decrease Player 1's life", exact: true }).click();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  const active = await localGame(page);
  let sheet = await recap(page);
  await expect(sheet.getByLabel('Game result', { exact: true })).toHaveCount(0);
  await sheet.getByText('Text version', { exact: true }).click();
  await expect(sheet.locator('.recap-text')).toContainText('In progress');
  await expect(sheet.locator('.recap-text')).toContainText('Player 1 · 39 life');
  await downloadPng(page);
  expect(await localGame(page)).toEqual(active);
  await page.getByRole('button', { name: 'Close Game recap', exact: true }).click();
  await page.getByRole('button', { name: 'End game', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'End this game?', exact: true })
    .getByRole('button', { name: 'End game', exact: true })
    .click();
  await page.getByRole('button', { name: /^View final one-phone game:/u }).click();
  const ended = await localGame(page);
  expect(ended.status).toBe('ended');
  sheet = await recap(page);
  await expect(sheet.getByLabel('Game result', { exact: true })).toHaveValue('');
  await sheet.getByText('Text version', { exact: true }).click();
  await expect(sheet.locator('.recap-text')).toContainText('Final');
  await expect(sheet.locator('.recap-text')).not.toContainText('Winner');
  const noWinner = await downloadPng(page);
  await sheet.getByLabel('Game result', { exact: true }).selectOption(ended.order[0]);
  await expect(sheet.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  await expect(sheet.locator('.recap-text')).toContainText('Player 1 wins');
  const withWinner = await downloadPng(page);
  expect(withWinner.equals(noWinner)).toBe(false);
  await writeFile(test.info().outputPath('game-recap-winner.png'), withWinner);
  await page.screenshot({ path: test.info().outputPath('game-recap-sheet.png') });
  await sheet.getByLabel('Game result', { exact: true }).selectOption('draw');
  await expect(sheet.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  await expect(sheet.locator('.recap-text')).toContainText('Draw');
  expect(await localGame(page)).toEqual(ended);
  await page.bringToFront();
  await expect(sheet).toHaveCSS('opacity', '1');
  const audit = await new AxeBuilder({ page })
    .include('.sheet')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes }))).toEqual([]);
});

test('native sharing receives the ready PNG and cancellation or failure keeps a usable download', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: ShareData) => data.files?.[0]?.type === 'image/png',
    });
    let calls = 0;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        calls += 1;
        if (calls === 2) throw new DOMException('Canceled', 'AbortError');
        if (calls === 3) throw new Error('Unavailable');
        document.documentElement.dataset.sharedFile = data.files?.[0]?.name;
        document.documentElement.dataset.sharedSize = String(data.files?.[0]?.size ?? 0);
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life', exact: true }).click();
  const sheet = await recap(page);
  const share = sheet.getByRole('button', { name: 'Share image', exact: true });
  await share.click();
  await expect(page.locator('html')).toHaveAttribute('data-shared-file', /^command-table-recap-/u);
  expect(Number(await page.locator('html').getAttribute('data-shared-size'))).toBeGreaterThan(1000);
  await share.click();
  await expect(share).toBeEnabled();
  await expect(sheet.getByRole('alert')).toHaveCount(0);
  await share.click();
  await expect(sheet.getByRole('alert')).toContainText('You can download the image');
  await downloadPng(page);
});

test('eight players, partner commanders and large negative life totals fit a narrow offline recap', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up a game', exact: true }).click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByLabel('Starting life', { exact: true }).fill('-999999');
  await page.getByText('Names, colors & commanders', { exact: false }).click();
  const seat = page.locator('.seat-form').first();
  const name = 'Mira — a very long player name at a table';
  const commander = 'A'.repeat(100);
  await seat.getByLabel('Seat 1 name', { exact: true }).fill(name);
  await seat.getByRole('combobox', { name: 'Commanders', exact: true }).selectOption('2');
  await seat.getByLabel('Commander 1', { exact: true }).fill(commander);
  await seat.getByLabel('Commander 2', { exact: true }).fill('Tymna the Weaver');
  await page.getByRole('button', { name: 'Let’s play', exact: true }).click();
  const sheet = await recap(page);
  await context.setOffline(true);
  await sheet.getByText('Text version', { exact: true }).click();
  await expect(sheet.locator('.recap-text li')).toHaveCount(8);
  await expect(sheet.locator('.recap-text')).toContainText(commander);
  await expect(sheet.locator('.recap-text')).toContainText('-999999 life');
  expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bytes = await downloadPng(page);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(1900);
  // Generate another recap while fully offline, using only bundled fonts/art.
  await page.getByRole('button', { name: 'Close Game recap', exact: true }).click();
  await page.getByRole('button', { name: 'Share game recap', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
  await downloadPng(page);
});
