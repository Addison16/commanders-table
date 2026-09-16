import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openLayout(page: Page) {
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await page.getByRole('button', { name: 'Table layout', exact: true }).click();
}

test('shared table faces both sides, enlarges touch controls and remembers local choices', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  await openLayout(page);
  await page.getByRole('button', { name: /Shared table Lay it sideways/ }).click();
  await expect(page.getByRole('button', { name: /Shared table Lay it sideways/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Back to game', exact: true }).click();
  const tiles = page.locator('.tile-content');
  await expect(tiles.nth(0)).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await expect(tiles.nth(1)).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
  await expect(tiles.nth(2)).toHaveCSS('transform', 'none');
  await expect(tiles.nth(3)).toHaveCSS('transform', 'none');
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    for (const button of await page.locator('.board .hold').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(64);
      expect(box.height).toBeGreaterThanOrEqual(52);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    const dimensions = await page.locator('.board').evaluate((board) => ({
      height: board.clientHeight,
      content: board.scrollHeight,
      width: document.documentElement.clientWidth,
      contentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.height + 1);
    expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.width);
    if (info.project.name === 'chromium-phone')
      await page.screenshot({ path: `docs/screenshots/shared-table-${viewport.width}.png` });
  }
  // Touch both a far-side and near-side counter; their player IDs stay fixed.
  await page.getByRole('button', { name: "Decrease Player 1's life", exact: true }).tap();
  await page.getByRole('button', { name: "Increase Player 4's life", exact: true }).tap();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await expect(page.getByTestId('life-3')).toHaveText('41');
  await expect(page.getByText('Saved here', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.board')).toHaveAttribute('data-layout', 'shared');
  await expect(page.getByTestId('life-0')).toHaveText('39');
  await expect(page.getByTestId('life-3')).toHaveText('41');
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(tiles.nth(0)).toHaveAttribute('data-facing', 'across');
  await page.getByRole('button', { name: 'Player 1 details', exact: true }).click();
  const flip = page.getByRole('checkbox', { name: 'Face this seat across the table', exact: true });
  await expect(flip).toBeChecked();
  await flip.uncheck();
  await page.getByRole('button', { name: 'Close Player 1', exact: true }).click();
  await expect(tiles.nth(0)).toHaveAttribute('data-facing', 'near');
  await expect(tiles.nth(1)).toHaveAttribute('data-facing', 'across');
  await openLayout(page);
  await page.getByRole('button', { name: /All facing me Hold the phone/ }).click();
  await page.getByRole('button', { name: 'Back to game', exact: true }).click();
  await expect(page.locator('.board')).toHaveAttribute('data-layout', 'upright');
  await expect(page.locator('[data-facing="across"]')).toHaveCount(0);
  await expect(page.getByTestId('life-0')).toHaveText('39');
});

type Draw = { a: number; b: number; c: number; d: number; x: number };
type Probe = Window & { diceDraw: Record<string, Draw>; diceSample: number };

test('settled dice draw their recorded numbers upright and centered on the face', async ({ page }, info) => {
  await page.addInitScript(() => {
    const probe = window as unknown as Probe;
    probe.diceDraw = {};
    probe.diceSample = 19;
    const random = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, 'getRandomValues', {
      value: (array: Uint32Array<ArrayBuffer>) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = probe.diceSample;
          return array;
        }
        return random(array);
      },
    });
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.classList.contains('dice-canvas')) {
        const matrix = this.getTransform();
        probe.diceDraw[text] = {
          a: matrix.a,
          b: matrix.b,
          c: matrix.c,
          d: matrix.d,
          x: matrix.e / (this.canvas.width / this.canvas.getBoundingClientRect().width),
        };
      }
      if (maxWidth === undefined) fill.call(this, text, x, y);
      else fill.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  for (const sides of [20, 4, 6, 8, 10, 12, 100, 2]) {
    await page.evaluate((n) => {
      const probe = window as unknown as Probe;
      probe.diceDraw = {};
      probe.diceSample = n - 1;
    }, sides);
    await page.getByRole('button', { name: 'Utilities', exact: true }).click();
    if (sides === 2) await page.getByRole('button', { name: 'Flip a coin', exact: true }).click();
    else {
      await page.getByRole('button', { name: `d${sides}`, exact: true }).click();
      await page.getByRole('button', { name: `Roll 1d${sides}`, exact: true }).click();
    }
    await expect(page.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
    const labels = sides === 100 ? ['00', '0'] : [sides === 2 ? 'T' : String(sides)];
    for (const [index, label] of labels.entries()) {
      await expect
        .poll(() => page.evaluate((text) => (window as unknown as Probe).diceDraw[text], label))
        .toBeDefined();
      const draw = await page.evaluate((text) => (window as unknown as Probe).diceDraw[text], label);
      expect(draw.a).toBeGreaterThan(0);
      expect(draw.d).toBeGreaterThan(0);
      expect(draw.b).toBeCloseTo(0, 5);
      expect(draw.c).toBeCloseTo(0, 5);
      expect(draw.a).toBeCloseTo(draw.d, 5);
      expect(draw.x).toBeCloseTo(page.viewportSize()!.width * (sides === 100 ? (index + 0.5) / 2 : 0.5), 1);
    }
    if (sides === 20 && info.project.name === 'chromium-phone')
      await page.screenshot({ path: 'docs/screenshots/dice-upright.png' });
    await page.getByRole('button', { name: 'Back to game', exact: true }).click();
    // Exercise both animation and the static reduced-motion rendering path.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
});
