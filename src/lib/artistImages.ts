import { Directory, File, Paths } from 'expo-file-system';
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
/** Back off briefly after a DNS/network failure instead of retrying every artist. */
const OFFLINE_RETRY_MS = 30_000;
/** Wikimedia rate-limits bursts of image requests, so downloads are spaced out. */
const DOWNLOAD_INTERVAL_MS = 500;
/** A 429 means the quota tripped. Pause instead of logging a warning per artist. */
const THROTTLE_RETRY_MS = 60_000;

let pausedUntil = 0;

type EnabledSource = Exclude<ArtistImageSource, 'off'>;

type ArtistImageSize = 'thumb' | 'hero';

/**
 * A resolved artwork source. Remote sources pick the width at read time. A
 * `local` entry has both sizes downloaded once, so the artists tab and the
 * artist page never fetch the same picture twice.
 */
export type ArtistImage =
  | { kind: 'commons'; file: string }
  | { kind: 'deezer'; url: string }
  | { kind: 'local'; thumb: string; hero: string };

const ARTIST_IMAGE_DIRECTORY = 'artist-images';

/** Deezer only serves a fixed set of square sizes, so it gets its own scale. */
const IMAGE_WIDTHS: Record<
  ArtistImageSize,
  { commons: number; deezer: number }
> = {
  thumb: { commons: 256, deezer: 250 },
  hero: { commons: 1280, deezer: 1000 },
};

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message} ${error.cause ? String(error.cause) : ''}`;
  }
  return String(error);
}

export function isNetworkError(error: unknown): boolean {
  return /UnknownHostException|Unable to resolve host|No address associated with hostname|Network request failed|ERR_INTERNET_DISCONNECTED|ENOTFOUND|EAI_AGAIN/i.test(
    errorText(error),
  );
}

export function isFetchingPaused(): boolean {
  return Date.now() < pausedUntil;
}

/**
 * Starts a cooldown after a network error or an HTTP 429. Returns true when the
 * caller should stop fetching, so bursts fail once instead of per artist.
 */
export function noteFetchFailure(error: unknown): boolean {
  if (/status:? 429|Too Many Requests/i.test(errorText(error))) {
    pausedUntil = Date.now() + THROTTLE_RETRY_MS;
    return true;
  }
  if (!isNetworkError(error)) return false;
  pausedUntil = Date.now() + OFFLINE_RETRY_MS;
  return true;
}

export function artistImageUrl(
  image: ArtistImage,
  size: ArtistImageSize,
): string {
  if (image.kind === 'local') {
    return size === 'thumb' ? image.thumb : image.hero;
  }

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

  const { kind, file, url, thumb, hero } = raw as Record<string, unknown>;
  if (kind === 'commons' && typeof file === 'string') {
    return { kind: 'commons', file };
  }
  if (kind === 'deezer' && typeof url === 'string') {
    return { kind: 'deezer', url };
  }
  if (
    kind === 'local' &&
    typeof thumb === 'string' &&
    typeof hero === 'string'
  ) {
    return { kind: 'local', thumb, hero };
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
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
  } catch (error) {
    noteFetchFailure(error);
    throw error;
  }
  if (response.ok) return response.json();

  // MusicBrainz throttles bursts with 403, 429, and 503. One retry is enough.
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
      // Remote entries render from expo-image's disk cache. Downloading them
      // here pre-warmed the whole library on every reload and hit the rate limit.
      result.set(artist.id, entry.image);
    }
  }

  const cutoff = now - PRUNE_AFTER_MS;
  const present = new Set(artists.map(artist => artist.id));
  for (const id of Object.keys(index)) {
    if (present.has(id) || index[id].lastSeenAt > cutoff) continue;
    deleteArtistImageFiles(id);
    delete index[id];
    mutated = true;
  }

  if (mutated) void persistCache();

  return result;
}

function artistImageDirectory(): Directory {
  const directory = new Directory(Paths.document, ARTIST_IMAGE_DIRECTORY);
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

/** Best effort. A leftover file is harmless. A crash during prune is not. */
function deleteArtistImageFiles(artistId: string) {
  try {
    const directory = artistImageDirectory();
    for (const name of [`${artistId}-hero.jpg`, `${artistId}-thumb.jpg`]) {
      const file = new File(directory, name);
      if (file.exists) file.delete();
    }
  } catch {
    // Ignore. Maintenance will not retry and the cache entry is already gone.
  }
}

/** Artist ids whose download is already running, so reads do not duplicate it. */
const materializing = new Set<string>();

/** Lookups already running, keyed by source and artist. */
const lookups = new Map<string, Promise<ArtistImage | null>>();

let nextDownloadAt = 0;

async function waitForDownloadSlot(): Promise<void> {
  const wait = nextDownloadAt - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  nextDownloadAt = Date.now() + DOWNLOAD_INTERVAL_MS;
}

/** Downloads once per file. The `.part` name keeps a truncated write from being served. */
async function downloadTo(
  directory: Directory,
  name: string,
  url: string,
): Promise<File> {
  const target = new File(directory, name);
  if (target.exists) return target;

  await waitForDownloadSlot();
  const partial = new File(directory, `${name}.part`);
  if (partial.exists) partial.delete();
  // Wikimedia rejects requests without a descriptive User-Agent (403).
  await File.downloadFileAsync(url, partial, {
    headers: { 'User-Agent': USER_AGENT },
  });
  partial.move(target);
  return target;
}

/**
 * Downloads both sizes once. Returns a `local` image on success, or the original
 * remote source if anything fails.
 */
async function materializeArtistImage(
  artistId: string,
  image: ArtistImage,
): Promise<ArtistImage> {
  if (
    image.kind === 'local' ||
    materializing.has(artistId) ||
    isFetchingPaused()
  ) {
    return image;
  }

  materializing.add(artistId);
  try {
    const directory = artistImageDirectory();
    // Both sizes come from the server; decoding a full-size hero on device is
    // what exhausted the heap.
    const heroFile = await downloadTo(
      directory,
      `${artistId}-hero.jpg`,
      artistImageUrl(image, 'hero'),
    );
    const thumbFile = await downloadTo(
      directory,
      `${artistId}-thumb.jpg`,
      artistImageUrl(image, 'thumb'),
    );

    return { kind: 'local', thumb: thumbFile.uri, hero: heroFile.uri };
  } catch (error) {
    if (!noteFetchFailure(error)) {
      console.warn('[ArtistImages] Could not cache image locally', {
        artistId,
        error,
      });
    }
    return image;
  } finally {
    materializing.delete(artistId);
  }
}

export function fetchArtistImage(
  artist: ArtistIdentity,
  mode: EnabledSource,
): Promise<ArtistImage | null> {
  const key = `${mode}:${artist.id}`;
  const running = lookups.get(key);
  if (running) return running;

  // Concurrent readers share one request, so a 503 is reported once.
  const lookup = lookupArtistImage(artist, mode).finally(() => {
    lookups.delete(key);
  });
  lookups.set(key, lookup);
  return lookup;
}

async function lookupArtistImage(
  artist: ArtistIdentity,
  mode: EnabledSource,
): Promise<ArtistImage | null> {
  const index = await loadCache();

  let image = await findWikimediaImage(artist);
  if (!image && mode === 'wikimedia-deezer') {
    image = await findDeezerImage(artist.name);
  }

  const cached = image ? await materializeArtistImage(artist.id, image) : null;

  const now = Date.now();
  index[artist.id] = {
    image: cached,
    lookedWith: mode,
    fetchedAt: now,
    lastSeenAt: now,
  };
  void persistCache();
  return cached;
}
