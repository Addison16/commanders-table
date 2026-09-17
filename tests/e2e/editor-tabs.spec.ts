import { expect, test, type Page } from '@playwright/test';

const editorId = (page: Page) => page.evaluate(() => sessionStorage.getItem('mtg-tab'));
async function duplicate(page: Page) {
  const opened = page.waitForEvent('popup');
  await page.evaluate(() => window.open(location.href, '_blank'));
  const copy = await opened;
  await expect(copy.getByTestId('life-0')).toHaveText('20');
  return copy;
}

test('a duplicated tab gets its own identity, preserves it on reload and respects explicit takeover', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 2 · 20 life' }).click();
  const originalId = await editorId(page);
  const copy = await duplicate(page);
  const copyId = await editorId(copy);
  expect(copyId).not.toBe(originalId);
  await expect(copy.getByText('Another tab controls this local game.')).toBeVisible();
  await copy.reload();
  await expect(copy.getByText('Another tab controls this local game.')).toBeVisible();
  expect(await editorId(copy)).toBe(copyId);
  await page.bringToFront();
  await page.getByRole('button', { name: "Decrease Player 1's life", exact: true }).click();
  await expect(copy.getByTestId('life-0')).toHaveText('19');
  await copy.bringToFront();
  await copy.getByRole('button', { name: 'Take over here', exact: true }).click();
  await expect(page.getByText('Another tab controls this local game.')).toBeVisible();
  await copy.getByRole('button', { name: "Decrease Player 1's life", exact: true }).click();
  await expect(copy.getByTestId('life-0')).toHaveText('18');
  await expect(page.getByTestId('life-0')).toHaveText('18');
});

test('a restored page checks its identity before editing if another tab claimed its released identity', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Quick 2 · 20 life' }).click();
  const originalId = await editorId(page);
  // Exercise the browser lifecycle handlers with real Web Locks. While frozen,
  // the original document cannot receive user input and releases its reservation.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  const copy = await duplicate(page);
  expect(await editorId(copy)).toBe(originalId);
  await expect(copy.getByRole('button', { name: "Decrease Player 1's life", exact: true })).toBeEnabled();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByText('Another tab controls this local game.')).toBeVisible();
  await expect.poll(() => editorId(page)).not.toBe(originalId);
  await copy.bringToFront();
  await copy.getByRole('button', { name: "Decrease Player 1's life", exact: true }).click();
  await expect(page.getByTestId('life-0')).toHaveText('19');
});
