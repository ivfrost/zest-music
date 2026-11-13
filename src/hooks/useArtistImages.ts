import { useEffect, useState } from 'react';
import {
  type ArtistImage,
  fetchArtistImage,
  isNetworkUnavailable,
  noteNetworkFailure,
  readCachedArtistImages,
} from '@/lib/artistImages';
import type { Artist } from '@/types/artists';
import type { ArtistImageSource } from '@/types/preferences';

/** MusicBrainz allows one request per second. */
const REQUEST_INTERVAL_MS = 1_200;

/** Failures are not cached on disk, so retry each source mode once per launch. */
const failed = new Set<string>();

export function useArtistImages(
  artists: readonly Artist[],
  source: ArtistImageSource,
): ReadonlyMap<string, ArtistImage | null> {
  const [images, setImages] = useState<ReadonlyMap<string, ArtistImage | null>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;

    const mode = source === 'off' ? null : source;
    if (!mode || artists.length === 0) {
      setImages(new Map());
      return;
    }

    void (async () => {
      const cached = await readCachedArtistImages(artists, mode);
      if (cancelled) return;
      setImages(new Map(cached));

      for (const artist of artists) {
        if (
          isNetworkUnavailable() ||
          cached.has(artist.id) ||
          failed.has(`${mode}:${artist.id}`)
        ) {
          if (isNetworkUnavailable()) break;
          continue;
        }

        try {
          const url = await fetchArtistImage(artist, mode);
          if (cancelled) return;
          setImages(previous => new Map(previous).set(artist.id, url));
        } catch (error) {
          if (noteNetworkFailure(error)) break;
          console.warn('[ArtistImages] Lookup failed', {
            artist: artist.name,
            error,
          });
          failed.add(`${mode}:${artist.id}`);
          if (cancelled) return;
          setImages(previous => new Map(previous).set(artist.id, null));
        }

        await new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL_MS));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artists, source]);

  return images;
}
