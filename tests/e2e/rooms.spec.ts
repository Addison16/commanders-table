import { test, expect } from '@playwright/test';
import type { RoomView } from '../../src/shared/schema.js';
test('independent browsers join, request/approve a seat, converge and reconnect', async ({
  page: host,
  browser,
}) => {
  const errors: string[] = [];
  host.on('pageerror', (e) => errors.push(e.message));
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  guest.on('pageerror', (e) => errors.push(e.message));
  await host.goto('/');
  await host.getByRole('button', { name: 'Create room', exact: true }).click();
  await host.getByLabel('Your display name').fill('Mira');
  await host.getByRole('dialog').getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(host.getByRole('button', { name: 'Live room', exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Live room', exact: true }).click();
  const url = await host.getByLabel('Join link', { exact: true }).inputValue();
  await guest.goto(url);
  await guest.getByLabel('Your display name').fill('Alex');
  await guest.getByRole('dialog').getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(guest.getByText('Pick your place.')).toBeVisible();
  expect(await guest.locator('.life-total').count()).toBe(0);
  await guest.getByRole('button', { name: 'Request seat', exact: true }).first().click();
  await host.getByRole('button', { name: 'Approve seat', exact: true }).click();
  await expect(guest.getByTestId('life-0')).toHaveText('40');
  await expect(guest.getByRole('button', { name: "Decrease Player 2's life" })).toBeDisabled();
  await host.getByRole('button', { name: 'Close Invite your table', exact: true }).click();
  await Promise.all([
    host.getByRole('button', { name: "Decrease Alex's life" }).click(),
    guest.getByRole('button', { name: "Decrease Alex's life" }).click(),
  ]);
  await expect(host.getByTestId('life-0')).toHaveText('38');
  await expect(guest.getByTestId('life-0')).toHaveText('38');
  await guestContext.setOffline(true);
  await expect(guest.getByText('Reconnecting — changes paused', { exact: false })).toBeVisible({
    timeout: 40000,
  });
  await expect(guest.getByRole('button', { name: "Decrease Alex's life" })).toBeDisabled();
  await host.getByRole('button', { name: "Decrease Alex's life" }).click();
  await guestContext.setOffline(false);
  await expect(guest.getByTestId('life-0')).toHaveText('37');
  await expect(guest.getByRole('button', { name: "Decrease Alex's life" })).toBeEnabled();
  await guest.reload();
  await expect(guest.getByTestId('life-0')).toHaveText('37');
  await expect(guest.getByRole('button', { name: "Decrease Alex's life" })).toBeEnabled();
  await guest.getByRole('button', { name: 'My seat', exact: true }).click();
  await expect(guest.locator('.my-view')).toBeVisible();
  await host.getByRole('button', { name: 'Utilities', exact: true }).click();
  await host.getByRole('button', { name: 'Roll 1d20', exact: true }).click();
  await expect(host.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
  await expect(guest.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
  await expect(guest.locator('.die')).toHaveText((await host.locator('.die').textContent()) ?? '');
  await guest.getByRole('button', { name: 'Back to game', exact: true }).click();
  await host.getByRole('button', { name: 'Back to game', exact: true }).click();
  await guest.getByRole('button', { name: 'Utilities', exact: true }).click();
  await guest.getByRole('button', { name: 'd20 for everyone', exact: true }).click();
  await expect(guest.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'false');
  await expect(guest.locator('.winner-name')).toHaveCount(0);
  await expect(host.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
  await expect(guest.getByTestId('dice-result')).toHaveAttribute('data-revealed', 'true');
  await expect(guest.locator('.winner-name')).toHaveText((await host.locator('.winner-name').textContent())!);
  await guest.getByRole('button', { name: 'Back to game', exact: true }).click();
  await guest.getByRole('button', { name: 'Home & recent games', exact: true }).click();
  await guest.getByRole('button', { name: 'Quick 2 · 20 life', exact: true }).click();
  await guest.getByRole('button', { name: 'Home & recent games', exact: true }).click();
  await guest.getByRole('button', { name: /^Resume shared room:/ }).click();
  await expect(guest.getByRole('button', { name: 'Live room', exact: true })).toBeVisible();
  await expect(guest.getByTestId('life-0')).toHaveText('37');
  await expect(guest.getByRole('button', { name: "Decrease Alex's life" })).toBeEnabled();
  expect(errors).toEqual([]);
  await guestContext.close();
});
test('refresh after a lost acknowledgement retries the original durable operation once', async ({ page }) => {
  let drop = false,
    lostOperation = '';
  await page.routeWebSocket('**/api/rooms/**/live?*', (route) => {
    const server = route.connectToServer();
    route.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'command' && msg.envelope.command.type === 'adjust') {
        drop = true;
        lostOperation = msg.envelope.operationId;
      }
      server.send(raw);
    });
    server.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      if (drop && ['ack', 'state'].includes(msg.type)) return;
      route.send(raw);
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/rooms') && r.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Create room', exact: true }).click();
  const room = (await (await response).json()) as RoomView;
  await expect(page.getByRole('button', { name: 'Live room', exact: true })).toBeVisible();
  await page.getByRole('button', { name: "Decrease Player 1's life" }).click();
  await expect.poll(() => lostOperation).not.toBe('');
  await expect
    .poll(
      async () =>
        ((await (await page.request.get(`/api/rooms/${room.id}`)).json()) as RoomView).game!.players[
          room.seats[0].id
        ].life,
    )
    .toBe(39);
  drop = false;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Live room', exact: true })).toBeVisible();
  await expect(page.getByTestId('life-0')).toHaveText('39');
  const pending = await page.evaluate(async (id) => {
    const request = indexedDB.open('mtg-util', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db.transaction('records').objectStore('records').get(`pending:${id}`);
    return await new Promise<unknown[]>((resolve) => {
      read.onsuccess = () => resolve(read.result ?? []);
    });
  }, room.id);
  expect(pending).toHaveLength(0);
});
