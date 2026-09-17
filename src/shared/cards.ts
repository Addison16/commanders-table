import { z } from 'zod';

const uuidPath = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const artPath = new RegExp(
  `^/art_crop/(?:front|back)/[0-9a-f]/[0-9a-f]/${uuidPath}\\.(?:jpg|png|webp)$`,
  'i',
);
const cardPath = new RegExp(`^(?:/cards/${uuidPath}/?|/card/[a-z0-9]{2,8}/[^/]+(?:/[^/]+){0,2}/?)$`, 'i');

function trustedUrl(value: string, host: string) {
  try {
    const url = new URL(value);
    return value === value.trim() &&
      url.protocol === 'https:' &&
      url.hostname === host &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/** Only Scryfall's raster art crops are safe to render from imported saves. */
export const commanderCardSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  imageUrl: z
    .string()
    .max(1000)
    .refine((value) => {
      const url = trustedUrl(value, 'cards.scryfall.io');
      return !!url && artPath.test(url.pathname) && (!url.search || /^\?\d+$/.test(url.search));
    }, 'Use an HTTPS Scryfall art-crop image.'),
  scryfallUrl: z
    .string()
    .max(1000)
    .refine((value) => {
      const url = trustedUrl(value, 'scryfall.com');
      return !!url && !url.search && cardPath.test(url.pathname);
    }, 'Use an HTTPS Scryfall card link.'),
  artist: z.string().trim().min(1).max(200),
});

export type CommanderCard = z.infer<typeof commanderCardSchema>;
