import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { IPicture } from 'music-metadata';

export const supportedAudioExtensions = new Set([
  'aac',
  'aif',
  'aiff',
  'aifc',
  'ape',
  'asf',
  'caf',
  'dff',
  'dsf',
  'flac',
  'm4a',
  'm4b',
  'mp1',
  'mp2',
  'mp3',
  'mp4',
  'mpc',
  'mpp',
  'oga',
  'ogg',
  'opus',
  'spx',
  'wav',
  'wave',
  'wma',
  'wv',
]);

export function isAudioFile(item: Directory | File): item is File {
  const extension = item.name.split('.').pop()?.toLowerCase();
  return (
    item instanceof File &&
    !!extension &&
    supportedAudioExtensions.has(extension)
  );
}

/** Lists the audio file URIs under `directory`, depth first. */
export function collectAudioUris(
  directory: Directory,
  uris: string[] = [],
): string[] {
  for (const item of directory.list()) {
    if (item instanceof Directory) {
      collectAudioUris(item, uris);
      continue;
    }

    if (isAudioFile(item)) uris.push(item.uri);
  }
  return uris;
}

/**
 * Publishes snapshots at most once per `intervalMs` while a long scan or purge
 * runs. `request` never blocks the caller. `drain` waits for the in-flight reload,
 * which keeps a trailing snapshot from landing after a final one.
 */
export function createProgressFlusher<T>(
  reload: () => Promise<T>,
  intervalMs = 500,
) {
  let lastFlush = 0;
  let inFlight: Promise<unknown> | null = null;

  return {
    request() {
      if (inFlight || Date.now() - lastFlush < intervalMs) return;
      lastFlush = Date.now();
      inFlight = reload()
        .catch(error => {
          // A failed intermediate refresh must not abort the scan or purge.
          console.warn('[MusicLibrary] Incremental refresh failed:', error);
        })
        .finally(() => {
          inFlight = null;
        });
    },
    async drain(): Promise<void> {
      await inFlight;
    },
  };
}

const COVER_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

function coversDirectory(): Directory {
  return new Directory(Paths.document, 'covers');
}

/** Writes embedded cover art to the documents directory, keyed by its digest. */
export async function storeArtwork(
  picture: IPicture | undefined,
): Promise<string | null> {
  if (!picture) return null;

  const directory = coversDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }

  const pictureData = new Uint8Array(picture.data);
  const digestBuffer = await digest(CryptoDigestAlgorithm.SHA256, pictureData);
  const hash = Array.from(new Uint8Array(digestBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  const extension = COVER_EXTENSIONS[picture.format.toLowerCase()] ?? '.img';
  const file = new File(directory, `${hash}${extension}`);

  if (!file.exists) {
    await file.write(pictureData);
  }

  return file.uri;
}

/**
 * Deletes cover files that no release points at. A cover is content-addressed and
 * only re-extracted by indexing the audio file. This collects covers by reference
 * and does not expire them by age.
 */
export function pruneCoverFiles(referenced: ReadonlySet<string>): void {
  const directory = coversDirectory();
  if (!directory.exists) return;

  for (const item of directory.list()) {
    if (!(item instanceof File) || referenced.has(item.uri)) continue;
    try {
      item.delete();
    } catch {
      // A failed delete leaves one orphan behind. The next prune retries it.
    }
  }
}
