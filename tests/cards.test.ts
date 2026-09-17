import { afterEach, describe, expect, it, vi } from 'vitest';
import { commanderCardSchema } from '../src/shared/cards.js';
import { cardEndpoint, CardLookupService } from '../src/server/cards.js';
import { buildApp } from '../src/server/app.js';
import { readConfig } from '../src/server/config.js';

const id = '12345678-1234-4234-8234-123456789abc';
const imageUrl = `https://cards.scryfall.io/art_crop/front/1/2/${id}.jpg?1712345678`;
const upstream = {
  id,
  name: 'Example Commander',
  image_uris: { art_crop: imageUrl },
  scryfall_uri: 'https://scryfall.com/card/test/1/example-commander?utm_source=api',
  artist: 'Example Artist',
};
const card = {
  id,
  name: upstream.name,
  imageUrl,
  scryfallUrl: 'https://scryfall.com/card/test/1/example-commander',
  artist: upstream.artist,
};

function clock() {
  let now = 1_800_000_000_000;
  return {
    now: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    sleep: vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    }),
  };
}
afterEach(() => vi.restoreAllMocks());

describe('safe commander card metadata', () => {
  it('accepts trusted artwork and rejects unsafe URLs in imported metadata', () => {
    expect(commanderCardSchema.parse(card)).toEqual(card);
    expect(commanderCardSchema.parse({ ...card, scryfallUrl: `https://scryfall.com/cards/${id}` }).id).toBe(
      id,
    );
    for (const imageUrl of [
      'data:image/svg+xml,<svg/>',
      `http://cards.scryfall.io/art_crop/front/1/2/${id}.jpg`,
      `https://cards.scryfall.io.evil.example/art_crop/front/1/2/${id}.jpg`,
      `https://user:password@cards.scryfall.io/art_crop/front/1/2/${id}.jpg`,
      `https://cards.scryfall.io:8443/art_crop/front/1/2/${id}.jpg`,
      `https://cards.scryfall.io/art_crop/front/1/2/${id}.svg`,
      `https://cards.scryfall.io/normal/front/1/2/${id}.jpg`,
    ])
      expect(commanderCardSchema.safeParse({ ...card, imageUrl }).success).toBe(false);
    for (const scryfallUrl of [
      'javascript:alert(1)',
      'https://evil.example/card/test/1',
      'https://scryfall.com/search?q=commander',
    ])
      expect(commanderCardSchema.safeParse({ ...card, scryfallUrl }).success).toBe(false);
    expect(commanderCardSchema.safeParse({ ...card, name: 'x'.repeat(101) }).success).toBe(false);
    expect(commanderCardSchema.safeParse({ ...card, extra: true }).success).toBe(false);
  });

  it('maps names and known Scryfall links to fixed API endpoints', () => {
    expect(cardEndpoint(' Atraxa, Praetors’ Voice ')).toBe(
      'https://api.scryfall.com/cards/named?fuzzy=atraxa%2C+praetors%E2%80%99+voice',
    );
    expect(cardEndpoint('https://scryfall.com/card/2xm/190/atraxa-praetors-voice?utm_source=api')).toBe(
      'https://api.scryfall.com/cards/2xm/190',
    );
    expect(cardEndpoint('https://scryfall.com/card/mh3/123a/ja/example')).toBe(
      'https://api.scryfall.com/cards/mh3/123a/ja',
    );
    expect(cardEndpoint('https://scryfall.com/card/test/1%E2%98%85/example')).toBe(
      'https://api.scryfall.com/cards/test/1%E2%98%85',
    );
    expect(cardEndpoint(`https://scryfall.com/cards/${id}`)).toBe(`https://api.scryfall.com/cards/${id}`);
    for (const prefix of ['scryfall.com', 'www.scryfall.com', 'https://www.scryfall.com'])
      expect(cardEndpoint(`${prefix}/card/test/1/example-commander`)).toBe(
        'https://api.scryfall.com/cards/test/1',
      );
  });

  it.each([
    'http://127.0.0.1/private',
    'https://scryfall.com.evil.example/card/test/1/example',
    'www.scryfall.com.evil.example/card/test/1/example',
    'https://www.scryfall.com.evil.example/card/test/1/example',
    'https://scryfall.com@evil.example/card/test/1/example',
    'https://user:password@scryfall.com/card/test/1/example',
    'https://scryfall.com:8443/card/test/1/example',
    'https://api.scryfall.com/cards/named?fuzzy=example',
    'file:///etc/passwd',
    '//scryfall.com/card/test/1/example',
    'https://scryfall.com/search?q=example',
    'https://scryfall.com/card/test/%2F..%2Fprivate/example',
    'https://scryfall.com/card/test/1/arbitrary/path',
  ])('rejects an unrecognized lookup URL without fetching it: %s', async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new CardLookupService({ fetcher }).resolve(url)).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('bounded Scryfall lookup', () => {
  it('returns front-face artwork, name and artist for a double-faced card', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...upstream,
        name: 'Front Commander // Back Face',
        image_uris: undefined,
        artist: undefined,
        card_faces: [
          { name: 'Front Commander', artist: 'Front Artist', image_uris: { art_crop: imageUrl } },
          {
            name: 'Back Face',
            artist: 'Back Artist',
            image_uris: { art_crop: imageUrl.replace('/front/', '/back/') },
          },
        ],
      }),
    );
    const service = new CardLookupService({ fetcher });
    expect(await service.resolve('Front Commander')).toEqual({
      card: { ...card, name: 'Front Commander', artist: 'Front Artist' },
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': expect.stringContaining('CommandersTable') },
    });
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('coalesces requests and caches names and metadata for 24 hours', async () => {
    const time = clock();
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      Response.json(String(url).includes('/autocomplete') ? { data: ['Example Commander'] } : upstream),
    );
    const service = new CardLookupService({ ...time, fetcher });
    const [first, second] = await Promise.all([
      service.resolve('Example Commander'),
      service.resolve(' example commander '),
    ]);
    expect(first).toEqual({ card });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await service.suggest('Ex')).toEqual({ names: ['Example Commander'] });
    expect(await service.suggest('ex')).toEqual({ names: ['Example Commander'] });
    expect(await service.suggest('x')).toEqual({ names: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    time.advance(24 * 60 * 60 * 1000 - 551);
    await service.resolve('Example Commander');
    expect(fetcher).toHaveBeenCalledTimes(2);
    time.advance(1);
    await service.resolve('Example Commander');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('serializes both endpoints at least 550ms apart and bounds queued requests', async () => {
    const time = clock(),
      starts: number[] = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      starts.push(time.now());
      if (starts.length === 1) await first;
      return Response.json(
        String(url).includes('/autocomplete') ? { data: ['Example Commander'] } : upstream,
      );
    });
    const service = new CardLookupService({ ...time, fetcher });
    const queued = Array.from({ length: 12 }, (_, i) =>
      i % 2 ? service.suggest(`Name ${i}`) : service.resolve(`Name ${i}`),
    );
    await expect(service.resolve('One too many')).rejects.toMatchObject({ statusCode: 503 });
    expect(starts).toHaveLength(1);
    release();
    await Promise.all(queued);
    expect(starts).toHaveLength(12);
    expect(starts.slice(1).every((at, i) => at - starts[i] >= 550)).toBe(true);
  });

  it('evicts old cache entries instead of growing indefinitely', async () => {
    const time = clock();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(upstream));
    const service = new CardLookupService({ ...time, fetcher });
    for (let i = 0; i <= 256; i++) await service.resolve(`Commander ${i}`);
    expect(fetcher).toHaveBeenCalledTimes(257);
    await service.resolve('Commander 256');
    expect(fetcher).toHaveBeenCalledTimes(257);
    await service.resolve('Commander 0');
    expect(fetcher).toHaveBeenCalledTimes(258);
  });

  it('backs off globally after 429 without retrying queued requests or hammering upstream', async () => {
    const time = clock();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429, headers: { 'Retry-After': '45' } }))
      .mockImplementation(async () => Response.json(upstream));
    const service = new CardLookupService({ ...time, fetcher });
    const results = await Promise.allSettled([service.resolve('First'), service.resolve('Second')]);
    expect(results).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ statusCode: 429, retryAfter: 45 }) },
      { status: 'rejected', reason: expect.objectContaining({ statusCode: 429, retryAfter: 45 }) },
    ]);
    time.advance(44_999);
    await expect(service.resolve('Third')).rejects.toMatchObject({ statusCode: 429, retryAfter: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    time.advance(1);
    expect(await service.resolve('Third')).toEqual({ card });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps failure messages harmless and lets later lookups recover', async () => {
    const time = clock();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockRejectedValueOnce(new DOMException('Upstream request timed out', 'TimeoutError'))
      .mockResolvedValueOnce(new Response('not json'))
      .mockResolvedValueOnce(
        Response.json({ ...upstream, image_uris: { art_crop: 'http://127.0.0.1/private' } }),
      )
      .mockResolvedValueOnce(new Response('x'.repeat(200_001)))
      .mockImplementation(async () => Response.json(upstream));
    const service = new CardLookupService({ ...time, fetcher });
    await expect(service.resolve('Ambiguous')).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('suggested full name'),
    });
    for (const name of ['Timeout', 'Bad JSON', 'Unsafe image', 'Oversized'])
      await expect(service.resolve(name)).rejects.toMatchObject({
        statusCode: 503,
        message: expect.stringContaining('keep playing'),
      });
    expect(await service.resolve('Recovered')).toEqual({ card });
  });
});

describe('public card API', () => {
  it('works without a guest session, limits query sizes and permits only Scryfall images in CSP', async () => {
    const time = clock();
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      Response.json(String(url).includes('/autocomplete') ? { data: ['Example Commander'] } : upstream),
    );
    const { app } = await buildApp({
      filename: ':memory:',
      config: readConfig({ PUBLIC_ORIGIN: 'https://table.example', NODE_ENV: 'production' }),
      cards: new CardLookupService({ ...time, fetcher }),
    });
    try {
      const suggestions = await app.inject('/api/cards/suggest?q=Ex');
      expect(suggestions.statusCode).toBe(200);
      expect(suggestions.json()).toEqual({ names: ['Example Commander'] });
      expect(suggestions.cookies).toHaveLength(0);
      expect(suggestions.headers['cache-control']).toBe('no-store');
      const resolved = await app.inject('/api/cards/resolve?q=Example%20Commander');
      expect(resolved.statusCode).toBe(200);
      expect(resolved.json()).toEqual({ card });
      expect(resolved.headers['content-security-policy']).toContain(
        "img-src 'self' data: blob: https://cards.scryfall.io;",
      );
      expect(resolved.headers['content-security-policy']).toContain(
        "connect-src 'self' https://cards.scryfall.io;",
      );
      expect((await app.inject(`/api/cards/resolve?q=${'a'.repeat(513)}`)).statusCode).toBe(400);
      expect((await app.inject('/api/cards/resolve?q=http://127.0.0.1/private')).statusCode).toBe(400);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it('returns a clear cooldown and Retry-After header on upstream rate limiting', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Rate limited', { status: 429 }));
    const { app } = await buildApp({
      filename: ':memory:',
      config: readConfig({ PUBLIC_ORIGIN: 'https://table.example' }),
      cards: new CardLookupService({ fetcher }),
    });
    try {
      const response = await app.inject('/api/cards/resolve?q=Example');
      expect(response.statusCode).toBe(429);
      expect(Number(response.headers['retry-after'])).toBeGreaterThanOrEqual(30);
      expect(response.json().error).toMatch(/keep the commander name/);
    } finally {
      await app.close();
    }
  });
});
