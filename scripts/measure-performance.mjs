import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch();
const origin = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const quantiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)].toFixed(1),
    maxMs: +sorted.at(-1).toFixed(1),
  };
};
try {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Quick 4 · 40 life' }).click();
  await page.getByTestId('life-0').waitFor();
  const local = [];
  for (let i = 0; i < 20; i++) {
    local.push(
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const life = document.querySelector('[data-testid="life-0"]');
            const button = document.querySelector('[aria-label="Decrease Player 1\'s life"]');
            const start = performance.now();
            const observer = new MutationObserver(() => {
              observer.disconnect();
              requestAnimationFrame(() => resolve(performance.now() - start));
            });
            observer.observe(life, { childList: true, characterData: true, subtree: true });
            button.click();
          }),
      ),
    );
    await page.getByText('Saved here', { exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'Game menu', exact: true }).click();
  await page.getByRole('button', { name: 'Back to home', exact: true }).click();
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/rooms') && r.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Create room', exact: true }).click();
  const room = await (await response).json();
  await page.getByRole('button', { name: 'Live room', exact: true }).waitFor();
  const session = await context.request.post(`${origin}/api/session`, {
    headers: { origin, 'x-mtg-client': '1' },
    data: { reset: false },
  });
  const csrf = (await session.json()).csrf;
  const shared = [];
  for (let i = 0; i < 20; i++) {
    const time = await page.evaluate(
      async ({ room, csrf, i }) => {
        const before = performance.now();
        const visible = new Promise((resolve) => {
          const life = document.querySelector('[data-testid="life-0"]');
          const observer = new MutationObserver(() => {
            observer.disconnect();
            requestAnimationFrame(() => resolve(performance.now() - before));
          });
          observer.observe(life, { childList: true, characterData: true, subtree: true });
        });
        const result = await fetch(`/api/rooms/${room.id}/command`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-mtg-client': '1', 'x-csrf-token': csrf },
          body: JSON.stringify({
            protocolVersion: 1,
            roomId: room.id,
            gameId: room.gameId,
            baseRevision: room.revision,
            operationId: crypto.randomUUID(),
            command: { type: 'adjust', playerId: room.seats[0].id, field: 'life', delta: -1 },
          }),
        });
        if (!(await result.json()).receipt.ok) throw new Error(`Measurement operation ${i} failed`);
        return await visible;
      },
      { room, csrf, i },
    );
    shared.push(time);
  }
  const measurements = {
    measuredAt: new Date().toISOString(),
    environment:
      'Linux x86_64 desktop, Chromium phone viewport 390×844, healthy loopback connection; not physical-phone/LAN measurements',
    localInputToAnimationFrame: quantiles(local),
    sharedRequestThroughCommitAndBroadcastToAnimationFrame: quantiles(shared),
  };
  writeFileSync('docs/performance.json', JSON.stringify(measurements, null, 2) + '\n');
  console.info(JSON.stringify(measurements, null, 2));
} finally {
  await browser.close();
}
