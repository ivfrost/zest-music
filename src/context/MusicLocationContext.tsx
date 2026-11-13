import { drizzle } from 'drizzle-orm/expo-sqlite';
import { Directory } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { audioEngine } from '@/audio/audioEngine';
import {
  deleteSongsBatch,
  deleteSongsByUriPrefix,
  deleteSongsByUris,
  purgeOrphanedRows,
  readLibrary,
} from '@/db/library';
import { indexAudioFile } from '@/lib/musicIndexer';
import {
  addMusicLocation,
  loadMusicLocations,
  removeMusicLocation,
} from '@/lib/musicLocations';
import {
  collectAudioUris,
  createProgressFlusher,
  isAudioFile,
} from '@/lib/musicScan';
import { STORAGE_KEYS, storage } from '@/lib/storage';
import type { Artist } from '@/types/artists';
import type { MusicLocation } from '@/types/musicLocation';
import type { ReleaseSummary } from '@/types/releases';
import type { Song } from '@/types/songs';

const PURGE_BATCH_SIZE = 200;
const SONG_REPORT_INTERVAL_MS = 250;

type MusicLocationsContextValue = {
  locations: MusicLocation[];
  songs: Song[];
  artists: Artist[];
  releases: ReleaseSummary[];
  /** Display data for a track still playing after its folder was removed. */
  removedNowPlaying: {
    title: string;
    artist: string;
    album: string | null;
    artworkUri: string | null;
  } | null;
  isScanning: boolean;
  scanningLocationUri: string | null;
  scanningSongTitle: string | null;
  scanningAction: 'scan' | 'remove';
  addLocation: (location: MusicLocation) => Promise<MusicLocation[]>;
  removeAllMusicLocations: () => Promise<MusicLocation[]>;
  removeLocation: (location: MusicLocation) => Promise<MusicLocation[]>;
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
  const locationRevision = useRef(0);
  const [locations, setLocations] = useState<MusicLocation[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [scanningLocationUri, setScanningLocationUri] = useState<string | null>(
    null,
  );
  const [scanningSongTitle, setScanningSongTitle] = useState<string | null>(
    null,
  );
  const [scanningAction, setScanningAction] = useState<'scan' | 'remove'>(
    'scan',
  );

  const lastSongReport = useRef(0);
  // Indexing is much faster than rendering, so only surface the newest title.
  const reportSong = useCallback((title: string) => {
    const now = Date.now();
    if (now - lastSongReport.current < SONG_REPORT_INTERVAL_MS) return;
    lastSongReport.current = now;
    setScanningSongTitle(title);
  }, []);

  // Mirrors of the published state, readable by callbacks without re-creating them.
  const songsRef = useRef<Song[]>([]);
  const artistsRef = useRef<Artist[]>([]);
  const releasesRef = useRef<ReleaseSummary[]>([]);
  /** Song kept on screen while it plays after its folder was removed. */
  const removedSongRef = useRef<Song | null>(null);
  const [removedNowPlaying, setRemovedNowPlaying] = useState<{
    title: string;
    artist: string;
    album: string | null;
    artworkUri: string | null;
  } | null>(null);

  const loadLibraryFromDatabase = useCallback(
    async (source: string, shouldApply?: () => boolean): Promise<Song[]> => {
      const library = await readLibrary(db, source);
      // A superseded scan must not publish its snapshot over newer state.
      if (shouldApply && !shouldApply()) return library.songs;

      // Stop overriding the player once the track is gone for good or back in the
      // library. The lists themselves never contain it.
      const removedSong = removedSongRef.current;
      if (
        removedSong &&
        (removedSong.uri !== audioEngine.getSnapshot().currentUri ||
          library.songs.some(song => song.uri === removedSong.uri))
      ) {
        removedSongRef.current = null;
        setRemovedNowPlaying(null);
      }

      songsRef.current = library.songs;
      artistsRef.current = library.artists;
      releasesRef.current = library.releases;
      setSongs(library.songs);
      setArtists(library.artists);
      setReleases(library.releases);
      return library.songs;
    },
    [db],
  );

  // Drops the override once playback leaves the removed track.
  useEffect(() => {
    let lastUri = audioEngine.getSnapshot().currentUri;
    const unsubscribe = audioEngine.subscribe(() => {
      const currentUri = audioEngine.getSnapshot().currentUri;
      if (currentUri === lastUri) return;
      lastUri = currentUri;

      const removedSong = removedSongRef.current;
      if (!removedSong || removedSong.uri === currentUri) return;
      removedSongRef.current = null;
      setRemovedNowPlaying(null);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const scanLocations = useCallback(
    async (
      savedLocations: MusicLocation[],
      source = 'scan',
    ): Promise<Song[]> => {
      const generation = ++scanGeneration.current;
      const isCancelled = () => generation !== scanGeneration.current;

      // Publishes progress mid-scan; the reload at the end stays authoritative.
      const flusher = createProgressFlusher(() =>
        loadLibraryFromDatabase(source, () => !isCancelled()),
      );

      async function visit(directory: Directory): Promise<void> {
        if (isCancelled()) return;
        for (const item of directory.list()) {
          if (isCancelled()) return;
          if (item instanceof Directory) {
            await visit(item);
            continue;
          }
          if (!isAudioFile(item)) continue;

          try {
            reportSong(await indexAudioFile(db, item));
          } catch (error) {
            console.warn(`Could not index music file ${item.uri}:`, error);
          }
          flusher.request();
        }
      }

      if (isCancelled()) return [];

      try {
        for (const location of savedLocations) {
          if (isCancelled()) return [];
          setScanningAction('scan');
          setScanningLocationUri(location.uri);
          setScanningSongTitle(null);
          if (__DEV__)
            console.info('[MusicLibrary] Scanning folder', {
              source,
              uri: location.uri,
            });
          try {
            await visit(new Directory(location.uri));
          } catch (error) {
            console.warn(`Could not scan music folder ${location.uri}:`, error);
          }
        }
      } finally {
        // A superseded scan must not clear the folder the newer scan announced.
        if (!isCancelled()) {
          setScanningLocationUri(null);
          setScanningSongTitle(null);
          setScanningAction('scan');
        }
      }

      if (isCancelled()) return [];
      // Drain the last incremental reload so it cannot land after the final snapshot.
      await flusher.drain();
      if (isCancelled()) return [];
      return loadLibraryFromDatabase(source, () => !isCancelled());
    },
    [db, loadLibraryFromDatabase, reportSong],
  );

  const refresh = useCallback(
    async (source = 'refresh') => {
      const revisionAtStart = locationRevision.current;
      setIsScanning(true);
      try {
        const loaded = await loadMusicLocations();
        if (__DEV__)
          console.info('[MusicLibrary] Read saved music locations', {
            source,
            locationCount: loaded.length,
          });
        if (revisionAtStart === locationRevision.current) setLocations(loaded);
        await loadLibraryFromDatabase(`${source}-cached`);
        if (revisionAtStart === locationRevision.current) {
          await scanLocations(loaded, source);
        }
        return loaded;
      } finally {
        setIsScanning(false);
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
      locationRevision.current += 1;
      setIsScanning(true);
      try {
        const updated = await addMusicLocation(location);
        setLocations(updated);
        await scanLocations(updated, 'folder-added');
        return updated;
      } finally {
        setIsScanning(false);
      }
    },
    [scanLocations],
  );

  // Inverse of scanLocations: deletes in batches and publishes state between
  // them, so the library shrinks progressively instead of all at once.
  const purgeSongs = useCallback(
    async (locationUri: string | null, source: string): Promise<Song[]> => {
      const generation = ++scanGeneration.current;
      const isCancelled = () => generation !== scanGeneration.current;
      const flusher = createProgressFlusher(() =>
        loadLibraryFromDatabase(source, () => !isCancelled()),
      );

      // Capture the playing track before its rows are deleted, so the player can
      // keep showing it until playback moves on.
      const playingUri = audioEngine.getSnapshot().currentUri;
      const playingSong = playingUri
        ? songsRef.current.find(song => song.uri === playingUri)
        : undefined;
      if (playingSong) {
        const artistNames = artistsRef.current
          .filter(artist => playingSong.artistIds.includes(artist.id))
          .map(artist => artist.name)
          .filter(Boolean);
        const release =
          releasesRef.current.find(
            release => release.id === playingSong.releaseId,
          ) ?? null;
        removedSongRef.current = playingSong;
        setRemovedNowPlaying({
          title: playingSong.title,
          artist: artistNames.join(', ') || 'Unknown Artist',
          album: release?.title ?? null,
          artworkUri: release?.artworkUri ?? null,
        });
      }

      setScanningAction('remove');
      setScanningLocationUri(locationUri);
      setScanningSongTitle(null);

      try {
        if (locationUri) {
          let uris: string[] | null = null;
          try {
            uris = collectAudioUris(new Directory(locationUri));
          } catch (error) {
            console.warn(
              `Could not list ${locationUri} before removal:`,
              error,
            );
          }

          if (uris) {
            for (let i = 0; i < uris.length; i += PURGE_BATCH_SIZE) {
              if (isCancelled()) return [];
              const removed = await deleteSongsByUris(
                db,
                uris.slice(i, i + PURGE_BATCH_SIZE),
              );
              const lastTitle = removed[removed.length - 1];
              if (lastTitle) reportSong(lastTitle);
              await purgeOrphanedRows(db);
              flusher.request();
            }
          } else {
            // Folder unreadable, so fall back to the URI prefix recorded at scan time.
            const prefix = locationUri.endsWith('/')
              ? locationUri
              : `${locationUri}/`;
            await deleteSongsByUriPrefix(db, prefix);
            await purgeOrphanedRows(db);
            flusher.request();
          }
        } else {
          while (!isCancelled()) {
            const removed = await deleteSongsBatch(db, PURGE_BATCH_SIZE);
            if (removed.length === 0) break;
            const lastTitle = removed[removed.length - 1];
            if (lastTitle) reportSong(lastTitle);
            await purgeOrphanedRows(db);
            flusher.request();
          }
        }
      } finally {
        // A superseded purge must not clear the folder the newer job announced.
        if (!isCancelled()) {
          setScanningLocationUri(null);
          setScanningSongTitle(null);
          setScanningAction('scan');
        }
      }

      if (isCancelled()) return [];
      await flusher.drain();
      if (isCancelled()) return [];
      return loadLibraryFromDatabase(source, () => !isCancelled());
    },
    [db, loadLibraryFromDatabase, reportSong],
  );

  const removeAllMusicLocations = useCallback(async () => {
    locationRevision.current += 1;
    setIsScanning(true);
    try {
      await storage.removeItem(STORAGE_KEYS.musicLocations);
      setLocations([]);
      await purgeSongs(null, 'locations-cleared');
      return [];
    } finally {
      setIsScanning(false);
    }
  }, [purgeSongs]);

  const removeLocation = useCallback(
    async (location: MusicLocation) => {
      locationRevision.current += 1;
      setIsScanning(true);
      try {
        // Purge before forgetting the folder: an interrupted removal then leaves the
        // folder saved, so the next scan rebuilds its rows instead of orphaning them.
        await purgeSongs(location.uri, 'folder-removed');
        const remaining = await removeMusicLocation(location);
        setLocations(remaining);
        return remaining;
      } finally {
        setIsScanning(false);
      }
    },
    [purgeSongs],
  );

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
      removedNowPlaying,
      isScanning,
      scanningLocationUri,
      scanningSongTitle,
      scanningAction,
      addLocation,
      removeAllMusicLocations,
      removeLocation,
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
      removedNowPlaying,
      isScanning,
      scanningLocationUri,
      scanningSongTitle,
      scanningAction,
      addLocation,
      removeAllMusicLocations,
      removeLocation,
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
