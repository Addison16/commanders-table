import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('home, board and player dialog meet automated accessibility checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Gather/ })).toBeVisible();
  const check = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map((v) => ({ id: v.id, elements: v.nodes.map((n) => n.target) }))).toEqual([]);
  };
  await check();
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  await check();
  const details = page.getByRole('button', { name: 'Player 1 details', exact: true });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(details).toBeFocused();
});
