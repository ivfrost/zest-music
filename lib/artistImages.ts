import { USER_AGENT } from '@/lib/http';
import { STORAGE_KEYS, storage } from '@/lib/storage';
import type { Artist } from '@/types/artists';
import type { ArtistImageSource } from '@/types/preferences';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const COMMONS_FILE_PATH = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const DEEZER_API = 'https://api.deezer.com/search/artist';
const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json',
};
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Grace period before dropping artists that left the library. */
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Refresh `lastSeenAt` at most daily to avoid a write per read. */
const LAST_SEEN_RESOLUTION_MS = 24 * 60 * 60 * 1000;
/** Ignore loose MusicBrainz name matches to avoid the wrong person. */
const MIN_MATCH_SCORE = 90;
const RETRY_DELAY_MS = 2_000;

type EnabledSource = Exclude<ArtistImageSource, 'off'>;

type ArtistImageSize = 'thumb' | 'hero';

/** A resolved artwork source; the display size picks the URL at read time. */
export type ArtistImage =
  | { kind: 'commons'; file: string }
  | { kind: 'deezer'; url: string };

/** Deezer only serves a fixed set of square sizes, so it gets its own scale. */
const IMAGE_WIDTHS: Record<
  ArtistImageSize,
  { commons: number; deezer: number }
> = {
  thumb: { commons: 256, deezer: 250 },
  hero: { commons: 1280, deezer: 1000 },
};

export function artistImageUrl(
  image: ArtistImage,
  size: ArtistImageSize,
): string {
  if (image.kind === 'commons') {
    const width = IMAGE_WIDTHS[size].commons;
    return `${COMMONS_FILE_PATH}/${encodeURIComponent(image.file)}?width=${width}`;
  }

  // Deezer encodes the square size in the CDN path.
  const width = IMAGE_WIDTHS[size].deezer;
  return image.url.replace(/\/\d+x\d+-/, `/${width}x${width}-`);
}

interface CacheEntry {
  image: ArtistImage | null;
  lookedWith: EnabledSource;
  fetchedAt: number;
  lastSeenAt: number;
}

type ArtistImageCache = Record<string, CacheEntry>;

type ArtistIdentity = Pick<Artist, 'id' | 'name' | 'musicBrainzId'>;

let cache: ArtistImageCache | null = null;
let loadPromise: Promise<ArtistImageCache> | null = null;

function parseImage(raw: unknown): ArtistImage | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;

  const { kind, file, url } = raw as Record<string, unknown>;
  if (kind === 'commons' && typeof file === 'string') {
    return { kind: 'commons', file };
  }
  if (kind === 'deezer' && typeof url === 'string') {
    return { kind: 'deezer', url };
  }
  return undefined;
}

/** Entries written before the source was cached baked the width into the URL. */
function migrateLegacyUrl(raw: unknown): ArtistImage | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;

  const prefix = `${COMMONS_FILE_PATH}/`;
  if (raw.startsWith(prefix)) {
    const file = decodeURIComponent(raw.slice(prefix.length).split('?')[0]);
    return file ? { kind: 'commons', file } : undefined;
  }
  if (raw.includes('dzcdn.net')) return { kind: 'deezer', url: raw };
  return undefined;
}

function sanitize(value: unknown): ArtistImageCache {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: ArtistImageCache = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object') continue;

    const record = entry as Partial<CacheEntry> & { url?: unknown };
    const { image, lookedWith, fetchedAt, lastSeenAt } = record;
    if (!Number.isFinite(fetchedAt)) continue;

    const parsed =
      'image' in record ? parseImage(image) : migrateLegacyUrl(record.url);
    if (parsed === undefined) continue;

    result[id] = {
      image: parsed,
      lookedWith:
        lookedWith === 'wikimedia-deezer' ? 'wikimedia-deezer' : 'wikimedia',
      fetchedAt: fetchedAt as number,
      lastSeenAt: Number.isFinite(lastSeenAt)
        ? (lastSeenAt as number)
        : (fetchedAt as number),
    };
  }
  return result;
}

function loadCache(): Promise<ArtistImageCache> {
  if (cache) return Promise.resolve(cache);

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await storage.getItem(STORAGE_KEYS.artistImages);
        cache = sanitize(raw ? JSON.parse(raw) : null);
      } catch (error) {
        console.warn('[ArtistImages] Could not read cache', error);
        cache = {};
      }
      return cache;
    })();
  }

  return loadPromise;
}

async function persistCache(): Promise<void> {
  if (!cache) return;

  try {
    await storage.setItem(STORAGE_KEYS.artistImages, JSON.stringify(cache));
  } catch (error) {
    console.warn('[ArtistImages] Could not write cache', error);
  }
}

async function getJson(
  url: string,
  headers: Record<string, string> = {},
  attempt = 0,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...headers },
  });
  if (response.ok) return response.json();

  // MusicBrainz throttles bursts with 403/429/503; one retry is enough.
  const retryable =
    response.status === 403 ||
    response.status === 429 ||
    response.status === 503;
  if (retryable && attempt === 0) {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return getJson(url, headers, attempt + 1);
  }

  throw new Error(`Request failed with status ${response.status}`);
}

/** Covers files whose tags carry no musicbrainz_artistid. */
async function findMusicBrainzId(name: string): Promise<string | null> {
  const query = new URLSearchParams({
    query: `artist:"${name.replaceAll('"', '')}"`,
    fmt: 'json',
    limit: '1',
  });
  const data = (await getJson(`${MUSICBRAINZ_API}/artist?${query}`)) as {
    artists?: { id?: unknown; score?: unknown }[];
  };

  const best = data.artists?.[0];
  if (!best || typeof best.id !== 'string') return null;

  const score = typeof best.score === 'number' ? best.score : 0;
  return score >= MIN_MATCH_SCORE ? best.id : null;
}

async function findWikidataId(musicBrainzId: string): Promise<string | null> {
  const query = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: `haswbstatement:P434=${musicBrainzId}`,
    format: 'json',
  });
  const data = (await getJson(`${WIKIDATA_API}?${query}`)) as {
    query?: { search?: { title?: unknown }[] };
  };

  const title = data.query?.search?.[0]?.title;
  return typeof title === 'string' ? title : null;
}

async function findImageFile(wikidataId: string): Promise<string | null> {
  const query = new URLSearchParams({
    action: 'wbgetclaims',
    entity: wikidataId,
    property: 'P18',
    format: 'json',
  });
  const data = (await getJson(`${WIKIDATA_API}?${query}`)) as {
    claims?: { P18?: { mainsnak?: { datavalue?: { value?: unknown } } }[] };
  };

  const value = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : null;
}

function stripFilePrefix(fileName: string): string {
  return fileName.startsWith('File:') ? fileName.slice(5) : fileName;
}

async function findWikimediaImage(
  artist: ArtistIdentity,
): Promise<ArtistImage | null> {
  const musicBrainzId =
    artist.musicBrainzId ?? (await findMusicBrainzId(artist.name));
  const wikidataId = musicBrainzId ? await findWikidataId(musicBrainzId) : null;
  const file = wikidataId ? await findImageFile(wikidataId) : null;
  return file ? { kind: 'commons', file: stripFilePrefix(file) } : null;
}

function normalizeName(value: string): string {
  const lower = value.toLowerCase();
  const stripped =
    typeof lower.normalize === 'function'
      ? lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      : lower;
  return stripped.replace(/[^a-z0-9]+/g, ' ').trim();
}

async function findDeezerImage(name: string): Promise<ArtistImage | null> {
  const query = new URLSearchParams({ q: name, limit: '5' });
  const data = (await getJson(`${DEEZER_API}?${query}`)) as {
    data?: { name?: unknown; picture_xl?: unknown }[];
  };

  const target = normalizeName(name);
  if (!target) return null;

  for (const candidate of data.data ?? []) {
    if (typeof candidate.name !== 'string') continue;
    if (normalizeName(candidate.name) !== target) continue;
    if (typeof candidate.picture_xl === 'string') {
      return { kind: 'deezer', url: candidate.picture_xl };
    }
  }
  return null;
}

/** An entry only counts if it was resolved with the currently enabled sources. */
function matchesMode(entry: CacheEntry, mode: EnabledSource): boolean {
  if (mode === 'wikimedia') return entry.lookedWith === 'wikimedia';
  return entry.lookedWith === 'wikimedia-deezer' || entry.image !== null;
}

/** Cached entries newer than the TTL, including cached misses. */
export async function readCachedArtistImages(
  artists: readonly ArtistIdentity[],
  mode: EnabledSource,
): Promise<Map<string, ArtistImage | null>> {
  const index = await loadCache();
  const now = Date.now();

  const result = new Map<string, ArtistImage | null>();
  let mutated = false;

  for (const artist of artists) {
    const entry = index[artist.id];
    if (!entry) continue;

    if (now - entry.lastSeenAt > LAST_SEEN_RESOLUTION_MS) {
      entry.lastSeenAt = now;
      mutated = true;
    }
    if (now - entry.fetchedAt < CACHE_TTL_MS && matchesMode(entry, mode)) {
      result.set(artist.id, entry.image);
    }
  }

  const cutoff = now - PRUNE_AFTER_MS;
  const present = new Set(artists.map(artist => artist.id));
  for (const id of Object.keys(index)) {
    if (present.has(id) || index[id].lastSeenAt > cutoff) continue;
    delete index[id];
    mutated = true;
  }

  if (mutated) void persistCache();
  return result;
}

export async function fetchArtistImage(
  artist: ArtistIdentity,
  mode: EnabledSource,
): Promise<ArtistImage | null> {
  const index = await loadCache();

  let image = await findWikimediaImage(artist);
  if (!image && mode === 'wikimedia-deezer') {
    image = await findDeezerImage(artist.name);
  }

  const now = Date.now();
  index[artist.id] = {
    image,
    lookedWith: mode,
    fetchedAt: now,
    lastSeenAt: now,
  };
  void persistCache();
  return image;
}
