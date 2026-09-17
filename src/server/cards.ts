import { z } from 'zod';
import { commanderCardSchema, type CommanderCard } from '../shared/cards.js';

const API = 'https://api.scryfall.com';
const CACHE_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 550;
const MAX_PENDING = 12;
const MAX_CACHE = 256;
const MAX_WAIT_MS = 10_000;
const MAX_BYTES = 200_000;
const uuid = z.string().uuid();
const languages = new Set([
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ja',
  'ko',
  'ru',
  'zhs',
  'zht',
  'he',
  'la',
  'grc',
  'ar',
  'sa',
  'ph',
]);

export class CardLookupError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

const unavailable = () =>
  new CardLookupError(
    503,
    'Card artwork is unavailable right now. Try again shortly, or keep playing with the commander name.',
  );
const invalidLink = () =>
  new CardLookupError(400, 'Use a card name or an HTTPS card link from scryfall.com.');

/** Convert recognized permalinks to fixed API paths; never fetch user URLs. */
export function cardEndpoint(input: string): string {
  let query = input.trim();
  if (!query || query.length > 512)
    throw new CardLookupError(400, 'Enter a card name or Scryfall card link.');
  if (/^(?:www\.)?scryfall\.com(?:\/|$)/i.test(query)) query = `https://${query.replace(/^www\./i, '')}`;
  if (/^[a-z][a-z\d+.-]*:|^\/\/|^www\./i.test(query)) {
    let url: URL;
    try {
      url = new URL(query);
    } catch {
      throw invalidLink();
    }
    if (
      url.protocol !== 'https:' ||
      !['scryfall.com', 'www.scryfall.com'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw invalidLink();
    const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
    if (parts[0] === 'cards' && parts.length === 2 && uuid.safeParse(parts[1]).success)
      return `${API}/cards/${parts[1].toLowerCase()}`;
    if (parts[0] !== 'card' || parts.length < 3 || parts.length > 5 || !/^[a-z\d]{2,8}$/i.test(parts[1]))
      throw invalidLink();
    let collector: string;
    try {
      collector = decodeURIComponent(parts[2]);
    } catch {
      throw invalidLink();
    }
    if (!/^[\p{L}\p{N}★☆+-]{1,30}$/u.test(collector)) throw invalidLink();
    const language = languages.has(parts[3]) ? parts[3] : undefined;
    if (parts.length === 5 && !language) throw invalidLink();
    return `${API}/cards/${parts[1].toLowerCase()}/${encodeURIComponent(collector)}${language ? `/${language}` : ''}`;
  }
  if (query.length > 100) throw new CardLookupError(400, 'Card names can be up to 100 characters.');
  return `${API}/cards/named?${new URLSearchParams({ fuzzy: query.toLowerCase() })}`;
}

const imageUris = z.object({ art_crop: z.string() });
const cardResponse = z.object({
  id: uuid,
  name: z.string(),
  artist: z.string().optional(),
  scryfall_uri: z.string(),
  image_uris: imageUris.optional(),
  card_faces: z
    .array(z.object({ name: z.string(), artist: z.string().optional(), image_uris: imageUris.optional() }))
    .max(8)
    .optional(),
});

function cardFromResponse(value: unknown): CommanderCard {
  const parsed = cardResponse.safeParse(value);
  if (!parsed.success) throw unavailable();
  const card = parsed.data,
    front = card.card_faces?.[0];
  let scryfallUrl = `https://scryfall.com/cards/${card.id}`;
  try {
    const link = new URL(card.scryfall_uri);
    link.search = '';
    link.hash = '';
    scryfallUrl = link.href;
  } catch {
    /* The validated fallback still identifies this printing. */
  }
  const result = commanderCardSchema.safeParse({
    id: card.id,
    name: front?.name ?? card.name,
    imageUrl: card.image_uris?.art_crop ?? front?.image_uris?.art_crop,
    scryfallUrl,
    artist: (card.image_uris ? card.artist : front?.artist) ?? card.artist ?? 'Unknown artist',
  });
  if (!result.success) throw unavailable();
  return result.data;
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader || Number(response.headers.get('content-length')) > MAX_BYTES) {
    await reader?.cancel();
    throw unavailable();
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw unavailable();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw unavailable();
  }
}

type LookupOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class CardLookupService {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private pending = new Map<string, Promise<unknown>>();
  private tail: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private blockedUntil = 0;
  private fetcher: typeof fetch;
  private now: () => number;
  private sleep: (milliseconds: number) => Promise<void>;

  constructor(options: LookupOptions = {}) {
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  suggest(query: string): Promise<{ names: string[] }> {
    const term = query.trim();
    if (term.length < 2 || term.length > 100 || /https?:|\/\//i.test(term))
      return Promise.resolve({ names: [] });
    const endpoint = `${API}/cards/autocomplete?${new URLSearchParams({ q: term.toLowerCase(), include_extras: 'false' })}`;
    return this.lookup(endpoint, (value) => {
      const result = z.object({ data: z.array(z.string()).max(20) }).safeParse(value);
      if (!result.success) throw unavailable();
      return { names: [...new Set(result.data.data.filter((name) => name.trim() && name.length <= 100))] };
    });
  }

  resolve(query: string): Promise<{ card: CommanderCard }> {
    try {
      return this.lookup(cardEndpoint(query), (value) => ({ card: cardFromResponse(value) }));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private backoff() {
    return new CardLookupError(
      429,
      'Card lookup is busy. Try again in a moment, or keep the commander name.',
      Math.max(1, Math.ceil((this.blockedUntil - this.now()) / 1000)),
    );
  }

  private lookup<T>(endpoint: string, parse: (value: unknown) => T): Promise<T> {
    const cached = this.cache.get(endpoint);
    if (cached && cached.expiresAt > this.now()) {
      this.cache.delete(endpoint);
      this.cache.set(endpoint, cached);
      return Promise.resolve(cached.value as T);
    }
    this.cache.delete(endpoint);
    const existing = this.pending.get(endpoint);
    if (existing) return existing as Promise<T>;
    if (this.blockedUntil > this.now()) return Promise.reject(this.backoff());
    if (this.pending.size >= MAX_PENDING)
      return Promise.reject(new CardLookupError(503, 'Card lookup is busy. Wait a moment and try again.'));
    const deadline = this.now() + MAX_WAIT_MS;
    const work = this.tail.then(async () => {
      if (this.blockedUntil > this.now()) throw this.backoff();
      const delay = Math.max(0, this.nextRequestAt - this.now());
      if (this.now() + delay >= deadline) throw unavailable();
      if (delay) await this.sleep(delay);
      if (this.now() >= deadline) throw unavailable();
      this.nextRequestAt = this.now() + INTERVAL_MS;
      try {
        const response = await this.fetcher(endpoint, {
          method: 'GET',
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'CommandersTable/0.1 (+https://github.com/Addison16/commanders-table)',
          },
          signal: AbortSignal.timeout(Math.min(6000, Math.max(1, deadline - this.now()))),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) {
            const header = response.headers.get('retry-after');
            const duration =
              header && /^\d+$/.test(header)
                ? Number(header) * 1000
                : Math.max(0, Date.parse(header ?? '') - this.now()) || 0;
            this.blockedUntil = this.now() + Math.max(30_000, duration);
            throw this.backoff();
          }
          if (response.status === 404)
            throw new CardLookupError(
              404,
              'No unique card matched. Choose a suggested full name or paste its Scryfall card link.',
            );
          throw unavailable();
        }
        const result = parse(await readJson(response));
        this.cache.set(endpoint, { value: result, expiresAt: this.now() + CACHE_MS });
        while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
        return result;
      } catch (error) {
        if (error instanceof CardLookupError) throw error;
        throw unavailable();
      }
    });
    const pending = work.finally(() => this.pending.delete(endpoint));
    this.pending.set(endpoint, pending);
    this.tail = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
}

// All rooms and both endpoints share one upstream queue and bounded cache.
export const cardLookup = new CardLookupService();
