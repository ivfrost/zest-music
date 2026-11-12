import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { CryptoDigestAlgorithm, digest, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import {
  type IAudioMetadata,
  type IPicture,
  parseFromTokenizer,
} from 'music-metadata';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fromBlob } from 'strtok3';
import * as schema from '@/db/schema';

import { AudioFileBlob } from '@/lib/audioFileBlob';
import { titleFromFilename } from '@/lib/musicMetadata';
import { STORAGE_KEYS, storage } from '@/lib/storage';
import type { Artist } from '@/types/artists';
import { type MusicLocation, MusicLocationSchema } from '@/types/musicLocation';
import type { ReleaseSummary, ReleaseType } from '@/types/releases';
import type { Song } from '@/types/songs';

async function loadMusicLocations(): Promise<MusicLocation[]> {
  const key = STORAGE_KEYS.musicLocations;
  const json = await storage.getItem(key);
  if (json === null) return [];

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    console.warn('Malformed music locations JSON; removing item from storage.');
    await storage.removeItem(key);
    return [];
  }

  const result = MusicLocationSchema.array().safeParse(value);
  if (result.success) return result.data;

  console.warn('Invalid music locations schema; removing item from storage.');
  await storage.removeItem(key);
  return [];
}

async function addMusicLocation(
  location: MusicLocation,
): Promise<MusicLocation[]> {
  const locations = await loadMusicLocations();
  if (locations.some(saved => saved.uri === location.uri)) return locations;

  const updated = [...locations, location];
  await storage.setItem(STORAGE_KEYS.musicLocations, JSON.stringify(updated));
  return updated;
}

const supportedAudioExtensions = new Set([
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

function tagValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function firstTagValue(value: string | string[] | undefined): string | null {
  return tagValues(value)[0] ?? null;
}

function releaseTypeFromTags(metadata: IAudioMetadata['common']): ReleaseType {
  const releaseTypes = (metadata.releasetype ?? []).join(' ').toLowerCase();
  if (releaseTypes.includes('single')) return 'single';
  if (releaseTypes.includes('ep')) return 'ep';
  if (releaseTypes.includes('album')) return 'album';
  return 'unknown';
}

const COVER_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

async function storeArtwork(
  picture: IPicture | undefined,
): Promise<string | null> {
  if (!picture) return null;

  const directory = new Directory(Paths.document, 'covers');
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

type MusicLocationsContextValue = {
  locations: MusicLocation[];
  songs: Song[];
  artists: Artist[];
  releases: ReleaseSummary[];
  isLoading: boolean;
  addLocation: (location: MusicLocation) => Promise<MusicLocation[]>;
  removeAllMusicLocations: () => Promise<MusicLocation[]>;
  refresh: () => Promise<MusicLocation[]>;
  scanSavedLocations: () => Promise<Song[]>;
  releaseById: Map<string, ReleaseSummary>;
  artistNameById: Map<string, string>;
};

export const MusicLocationsContext =
  createContext<MusicLocationsContextValue | null>(null);

export function MusicLocationsProvider({ children }: PropsWithChildren) {
  const sqlite = useSQLiteContext();
  const db = useMemo(() => drizzle(sqlite), [sqlite]);
  const scanGeneration = useRef(0);
  const [locations, setLocations] = useState<MusicLocation[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const findOrCreateRelease = useCallback(
    async (
      title: string,
      type: ReleaseType,
      musicBrainzId: string | null,
      musicBrainzReleaseGroupId: string | null,
      artworkUri: string | null,
    ): Promise<string> => {
      const byMusicBrainzId = musicBrainzId
        ? await db
            .select({ id: schema.releases.id })
            .from(schema.releases)
            .where(eq(schema.releases.musicBrainzId, musicBrainzId))
            .limit(1)
        : [];
      const existing =
        byMusicBrainzId[0] ??
        (
          await db
            .select({ id: schema.releases.id })
            .from(schema.releases)
            .where(
              and(
                eq(schema.releases.title, title),
                eq(schema.releases.type, type),
              ),
            )
            .limit(1)
        )[0];

      if (existing) {
        if (musicBrainzId || musicBrainzReleaseGroupId || artworkUri) {
          await db
            .update(schema.releases)
            .set({
              musicBrainzId,
              musicBrainzReleaseGroupId,
              ...(artworkUri ? { artworkUri } : {}),
            })
            .where(eq(schema.releases.id, existing.id));
        }
        return existing.id;
      }

      const id = randomUUID();
      await db.insert(schema.releases).values({
        id,
        title,
        type,
        artworkUri,
        musicBrainzId,
        musicBrainzReleaseGroupId,
      });
      if (__DEV__) console.info('[MusicLibrary] Created release', {
        id,
        title,
        type,
        artworkUri,
        musicBrainzId,
        musicBrainzReleaseGroupId,
      });
      return id;
    },
    [db],
  );

  const findOrCreateArtists = useCallback(
    async (
      names: string[],
      musicBrainzIds: (string | null)[],
    ): Promise<string[]> => {
      const ids: string[] = [];

      for (const [index, name] of names.entries()) {
        const musicBrainzId = musicBrainzIds[index] ?? null;
        const byMusicBrainzId = musicBrainzId
          ? await db
              .select({ id: schema.artists.id })
              .from(schema.artists)
              .where(eq(schema.artists.musicBrainzId, musicBrainzId))
              .limit(1)
          : [];
        const existing =
          byMusicBrainzId[0] ??
          (
            await db
              .select({ id: schema.artists.id })
              .from(schema.artists)
              .where(eq(schema.artists.name, name))
              .limit(1)
          )[0];

        if (existing) {
          if (musicBrainzId) {
            await db
              .update(schema.artists)
              .set({ musicBrainzId })
              .where(eq(schema.artists.id, existing.id));
          }
          ids.push(existing.id);
          continue;
        }

        const id = randomUUID();
        await db.insert(schema.artists).values({ id, name, musicBrainzId });
        if (__DEV__) console.info('[MusicLibrary] Created artist', {
          id,
          name,
          musicBrainzId,
        });
        ids.push(id);
      }

      return ids;
    },
    [db],
  );

  const loadLibraryFromDatabase = useCallback(
    async (source: string): Promise<Song[]> => {
      const [songRows, artistRows, releaseRows] = await Promise.all([
        db
          .select({
            id: schema.songs.id,
            title: schema.songs.title,
            uri: schema.songs.uri,
            size: schema.songs.size,
            duration: schema.songs.duration,
            playCount: schema.songs.playCount,
            lastPlayedAt: schema.songs.lastPlayedAt,
            trackNumber: schema.songs.trackNumber,
            releaseId: schema.songs.releaseId,
            musicBrainzRecordingId: schema.songs.musicBrainzRecordingId,
            musicBrainzTrackId: schema.songs.musicBrainzTrackId,
            artistId: schema.releaseArtists.artistId,
          })
          .from(schema.songs)
          .leftJoin(
            schema.releaseArtists,
            eq(schema.songs.releaseId, schema.releaseArtists.releaseId),
          ),
        db
          .select({
            id: schema.artists.id,
            name: schema.artists.name,
            musicBrainzId: schema.artists.musicBrainzId,
            releaseId: schema.releaseArtists.releaseId,
          })
          .from(schema.artists)
          .leftJoin(
            schema.releaseArtists,
            eq(schema.artists.id, schema.releaseArtists.artistId),
          ),
        db
          .select({
            id: schema.releases.id,
            title: schema.releases.title,
            artworkUri: schema.releases.artworkUri,
          })
          .from(schema.releases),
      ]);

      const songsById = new Map<string, Song>();
      for (const row of songRows) {
        let song = songsById.get(row.id);
        if (!song) {
          song = {
            id: row.id,
            title: row.title,
            uri: row.uri,
            size: row.size,
            duration: row.duration,
            playCount: row.playCount,
            lastPlayedAt: row.lastPlayedAt,
            trackNumber: row.trackNumber,
            releaseId: row.releaseId,
            musicBrainzRecordingId: row.musicBrainzRecordingId,
            musicBrainzTrackId: row.musicBrainzTrackId,
            artistIds: [],
          };
          songsById.set(song.id, song);
        }
        if (row.artistId && !song.artistIds.includes(row.artistId)) {
          song.artistIds.push(row.artistId);
        }
      }

      const artistsById = new Map<string, Artist>();
      for (const row of artistRows) {
        let artist = artistsById.get(row.id);
        if (!artist) {
          artist = {
            id: row.id,
            name: row.name,
            musicBrainzId: row.musicBrainzId,
            releaseIds: [],
          };
          artistsById.set(artist.id, artist);
        }
        if (row.releaseId && !artist.releaseIds.includes(row.releaseId)) {
          artist.releaseIds.push(row.releaseId);
        }
      }

      const loadedSongs = [...songsById.values()];
      const loadedArtists = [...artistsById.values()];
      if (__DEV__) console.info('[MusicLibrary] Read songs and artists from database', {
        source,
        songCount: loadedSongs.length,
        artistCount: loadedArtists.length,
        releaseCount: releaseRows.length,
      });
      setSongs(loadedSongs);
      setArtists(loadedArtists.sort((a, b) => a.name.localeCompare(b.name)));
      setReleases(releaseRows);
      return loadedSongs;
    },
    [db],
  );

  const scanLocations = useCallback(
    async (
      savedLocations: MusicLocation[],
      source = 'scan',
    ): Promise<Song[]> => {
      const generation = ++scanGeneration.current;
      const isCancelled = () => generation !== scanGeneration.current;

      async function visit(directory: Directory): Promise<void> {
        if (isCancelled()) return;
        for (const item of directory.list()) {
          if (isCancelled()) return;
          if (item instanceof Directory) {
            await visit(item);
            continue;
          }

          const extension = item.name.split('.').pop()?.toLowerCase();
          if (
            !(item instanceof File) ||
            !extension ||
            !supportedAudioExtensions.has(extension)
          ) {
            continue;
          }

          try {
            const tokenizer = fromBlob(
              new AudioFileBlob(item) as unknown as Blob,
              {
                fileInfo: { path: item.name, size: item.size },
              },
            );
            let metadata: IAudioMetadata;
            try {
              metadata = await parseFromTokenizer(tokenizer);
            } finally {
              await tokenizer.close();
            }

            const tags = metadata.common;
            const rawDuration = metadata.format.duration;
            const duration =
              typeof rawDuration === 'number' && Number.isFinite(rawDuration)
                ? Math.round(rawDuration)
                : null;
            const title = tags.title?.trim() || titleFromFilename(item.name);

            const releaseTitle = tags.album?.trim() || 'Unknown Album';
            const musicBrainzReleaseId = firstTagValue(
              tags.musicbrainz_albumid,
            );
            const musicBrainzReleaseGroupId = firstTagValue(
              tags.musicbrainz_releasegroupid,
            );
            const artworkUri = await storeArtwork(tags.picture?.[0]);
            const releaseId = await findOrCreateRelease(
              releaseTitle,
              releaseTypeFromTags(tags),
              musicBrainzReleaseId,
              musicBrainzReleaseGroupId,
              artworkUri,
            );

            const albumArtistNames = tagValues(
              tags.albumartists ?? tags.albumartist,
            );
            const trackArtistNames = tagValues(tags.artists ?? tags.artist);
            const tagArtistNames = albumArtistNames.length
              ? albumArtistNames
              : trackArtistNames;
            const names = tagArtistNames.length
              ? tagArtistNames
              : ['Unknown Artist'];
            const rawArtistIds = tagValues(
              albumArtistNames.length
                ? tags.musicbrainz_albumartistid
                : tags.musicbrainz_artistid,
            );
            const artistMusicBrainzIds =
              rawArtistIds.length === names.length
                ? rawArtistIds
                : names.length === 1
                  ? [rawArtistIds[0] ?? null]
                  : [];
            const artistIds = await findOrCreateArtists(
              names,
              artistMusicBrainzIds,
            );

            for (const artistId of artistIds) {
              await db
                .insert(schema.releaseArtists)
                .values({
                  releaseId,
                  artistId,
                  role: albumArtistNames.length ? 'albumArtist' : 'artist',
                })
                .onConflictDoNothing();
            }

            const musicBrainzRecordingId = firstTagValue(
              tags.musicbrainz_recordingid,
            );
            const musicBrainzTrackId = firstTagValue(tags.musicbrainz_trackid);
            const trackNumber = tags.track?.no ?? null;
            const byMusicBrainzId = musicBrainzRecordingId
              ? await db
                  .select({ id: schema.songs.id })
                  .from(schema.songs)
                  .where(
                    eq(
                      schema.songs.musicBrainzRecordingId,
                      musicBrainzRecordingId,
                    ),
                  )
                  .limit(1)
              : [];
            const existingSong =
              byMusicBrainzId[0] ??
              (
                await db
                  .select({ id: schema.songs.id })
                  .from(schema.songs)
                  .where(eq(schema.songs.uri, item.uri))
                  .limit(1)
              )[0];
            const songValues = {
              title,
              uri: item.uri,
              size: item.size,
              duration,
              trackNumber,
              releaseId,
              musicBrainzRecordingId,
              musicBrainzTrackId,
            };

            if (existingSong) {
              await db
                .update(schema.songs)
                .set(songValues)
                .where(eq(schema.songs.id, existingSong.id));
            } else {
              const id = randomUUID();
              await db.insert(schema.songs).values({ id, ...songValues });
              if (__DEV__) console.info('[MusicLibrary] Created song', {
                id,
                title,
                releaseId,
                musicBrainzRecordingId,
                musicBrainzTrackId,
              });
            }
          } catch (error) {
            console.warn(`Could not index music file ${item.uri}:`, error);
          }
        }
      }

      if (isCancelled()) return [];

      for (const location of savedLocations) {
        if (isCancelled()) return [];
        try {
          await visit(new Directory(location.uri));
        } catch (error) {
          console.warn(`Could not scan music folder ${location.uri}:`, error);
        }
      }

      if (isCancelled()) return [];
      return loadLibraryFromDatabase(source);
    },
    [db, findOrCreateArtists, findOrCreateRelease, loadLibraryFromDatabase],
  );

  const refresh = useCallback(
    async (source = 'refresh') => {
      setIsLoading(true);
      try {
        const loaded = await loadMusicLocations();
        if (__DEV__) console.info('[MusicLibrary] Read saved music locations', {
          source,
          locationCount: loaded.length,
        });
        setLocations(loaded);
        await loadLibraryFromDatabase(`${source}-cached`);
        await scanLocations(loaded, source);
        return loaded;
      } finally {
        setIsLoading(false);
      }
    },
    [loadLibraryFromDatabase, scanLocations],
  );

  useEffect(() => {
    refresh('app-boot').catch(error =>
      console.warn('Unable to load music library:', error),
    );
    return () => {
      // Stop an in-flight scan before the provider's DB connection closes.
      scanGeneration.current += 1;
    };
  }, [refresh]);

  const addLocation = useCallback(
    async (location: MusicLocation) => {
      const updated = await addMusicLocation(location);
      setLocations(updated);
      await scanLocations(updated, 'folder-added');
      return updated;
    },
    [scanLocations],
  );

  const removeAllMusicLocations = useCallback(async () => {
    await storage.removeItem(STORAGE_KEYS.musicLocations);
    setLocations([]);
    await scanLocations([], 'locations-cleared');
    return [];
  }, [scanLocations]);

  const scanSavedLocations = useCallback(
    () => scanLocations(locations, 'manual-rescan'),
    [locations, scanLocations],
  );

  const releaseById = useMemo(
    () => new Map(releases.map(release => [release.id, release])),
    [releases],
  );
  const artistNameById = useMemo(
    () => new Map(artists.map(artist => [artist.id, artist.name])),
    [artists],
  );

  const value = useMemo(
    () => ({
      locations,
      songs,
      artists,
      releases,
      isLoading,
      addLocation,
      removeAllMusicLocations,
      refresh,
      scanSavedLocations,
      releaseById,
      artistNameById,
    }),
    [
      locations,
      songs,
      artists,
      releases,
      isLoading,
      addLocation,
      removeAllMusicLocations,
      refresh,
      scanSavedLocations,
      releaseById,
      artistNameById,
    ],
  );

  return (
    <MusicLocationsContext.Provider value={value}>
      {children}
    </MusicLocationsContext.Provider>
  );
}
