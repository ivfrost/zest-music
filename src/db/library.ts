import { and, eq, inArray, like, notInArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import * as schema from '@/db/schema';
import { nameCollator } from '@/lib/collator';
import type { Artist } from '@/types/artists';
import type { ReleaseSummary, ReleaseType } from '@/types/releases';
import type { Song } from '@/types/songs';

export type LibraryDatabase = ReturnType<typeof drizzle>;

export interface ReleaseInput {
  title: string;
  type: ReleaseType;
  musicBrainzId: string | null;
  musicBrainzReleaseGroupId: string | null;
  artworkUri: string | null;
}

/** Returns the id of the matching release, creating it when absent. */
export async function findOrCreateRelease(
  db: LibraryDatabase,
  input: ReleaseInput,
): Promise<string> {
  const { title, type, musicBrainzId, musicBrainzReleaseGroupId, artworkUri } =
    input;

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
          and(eq(schema.releases.title, title), eq(schema.releases.type, type)),
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
  if (__DEV__)
    console.info('[MusicLibrary] Created release', {
      id,
      title,
      type,
      artworkUri,
      musicBrainzId,
      musicBrainzReleaseGroupId,
    });
  return id;
}

/** Returns ids for each name, creating artists that are not indexed yet. */
export async function findOrCreateArtists(
  db: LibraryDatabase,
  names: string[],
  musicBrainzIds: (string | null)[],
): Promise<string[]> {
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
    if (__DEV__)
      console.info('[MusicLibrary] Created artist', {
        id,
        name,
        musicBrainzId,
      });
    ids.push(id);
  }

  return ids;
}

/**
 * Returns the id of the playlist with this title, creating it when absent.
 * The title is the playlist's identity here, so asking for an existing one
 * returns it rather than creating a duplicate.
 */
export async function createPlaylist(
  db: LibraryDatabase,
  title: string,
): Promise<string> {
  const existing = (
    await db
      .select({
        id: schema.playlists.id,
      })
      .from(schema.playlists)
      .where(eq(schema.playlists.title, title))
      .limit(1)
  )[0];
  if (existing) return existing.id;

  const id = randomUUID();
  await db.insert(schema.playlists).values({ id, title });
  if (__DEV__)
    console.info('[MusicLibrary] Created playlist', {
      id,
      title,
    });
  return id;
}

/**
 * Associates a song with a playlist. Re-adding is a no-op: the join table's
 * composite primary key makes the insert idempotent, so the code does not check
 * for existence.
 *
 * @returns `true` when the association is inserted, `false` when the song is
 * already in the playlist.
 */
export async function addSongToPlaylist(
  db: LibraryDatabase,
  songId: string,
  playlistId: string,
): Promise<boolean> {
  const inserted = await db
    .insert(schema.songPlaylists)
    .values({ songId, playlistId })
    .onConflictDoNothing()
    .returning({ songId: schema.songPlaylists.songId });

  return inserted.length > 0;
}

/**
 * Deletes a playlist. The schema's ON DELETE CASCADE removes its
 * `song_playlists` rows, and that cascade is active because the app enables
 * `PRAGMA foreign_keys` on its connection.
 *
 * @returns `true` when a playlist is deleted, `false` when the id is unknown.
 */
export async function deletePlaylist(
  db: LibraryDatabase,
  playlistId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.playlists)
    .where(eq(schema.playlists.id, playlistId))
    .returning({ id: schema.playlists.id });

  return deleted.length > 0;
}

/**
 * Removes a song from a playlist. The song itself stays in the library, and
 * playback continues, because the active queue is independent of the playlist.
 *
 * @returns `true` when the row is removed, `false` when it is absent.
 */
export async function removeSongFromPlaylist(
  db: LibraryDatabase,
  songId: string,
  playlistId: string,
): Promise<boolean> {
  const removed = await db
    .delete(schema.songPlaylists)
    .where(
      and(
        eq(schema.songPlaylists.songId, songId),
        eq(schema.songPlaylists.playlistId, playlistId),
      ),
    )
    .returning({ songId: schema.songPlaylists.songId });

  return removed.length > 0;
}

/**
 * Reads the whole library snapshot. Callers own publishing it to React state, so a
 * superseded scan can discard the result without touching the UI.
 */
export async function readLibrary(
  db: LibraryDatabase,
  source: string,
): Promise<{
  songs: Song[];
  artists: Artist[];
  releases: ReleaseSummary[];
}> {
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
        lastModified: schema.songs.lastModified,
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
        lastModified: row.lastModified,
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

  const songs = [...songsById.values()];
  const artists = [...artistsById.values()].sort((a, b) =>
    nameCollator.compare(a.name, b.name),
  );
  if (__DEV__)
    console.info('[MusicLibrary] Read songs and artists from database', {
      source,
      songCount: songs.length,
      artistCount: artists.length,
      releaseCount: releaseRows.length,
    });

  return { songs, artists, releases: releaseRows };
}

/** Size and modification time of every indexed file, keyed by URI. */
export async function readIndexedFiles(
  db: LibraryDatabase,
): Promise<Map<string, { size: number; lastModified: number | null }>> {
  const rows = await db
    .select({
      uri: schema.songs.uri,
      size: schema.songs.size,
      lastModified: schema.songs.lastModified,
    })
    .from(schema.songs);

  return new Map(
    rows.map(row => [
      row.uri,
      { size: row.size, lastModified: row.lastModified },
    ]),
  );
}

/** Cover file URIs still referenced by a release, so the rest can be deleted. */
export async function readReferencedArtworkUris(
  db: LibraryDatabase,
): Promise<Set<string>> {
  const rows = await db
    .select({ artworkUri: schema.releases.artworkUri })
    .from(schema.releases);

  return new Set(
    rows.map(row => row.artworkUri).filter((uri): uri is string => !!uri),
  );
}

/** Deletes the songs at `uris` and returns the titles it removed. */
export async function deleteSongsByUris(
  db: LibraryDatabase,
  uris: string[],
): Promise<string[]> {
  if (uris.length === 0) return [];

  const rows = await db
    .select({ title: schema.songs.title })
    .from(schema.songs)
    .where(inArray(schema.songs.uri, uris));
  if (rows.length === 0) return [];

  await db.delete(schema.songs).where(inArray(schema.songs.uri, uris));
  return rows.map(row => row.title);
}

export async function deleteSongsByUriPrefix(
  db: LibraryDatabase,
  prefix: string,
): Promise<void> {
  await db.delete(schema.songs).where(like(schema.songs.uri, `${prefix}%`));
}

/** Deletes up to `limit` songs and returns the titles it removed. */
export async function deleteSongsBatch(
  db: LibraryDatabase,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.songs.id, title: schema.songs.title })
    .from(schema.songs)
    .limit(limit);
  if (rows.length === 0) return [];

  await db.delete(schema.songs).where(
    inArray(
      schema.songs.id,
      rows.map(row => row.id),
    ),
  );
  return rows.map(row => row.title);
}

/**
 * Drops releases and artists left without songs. Written explicitly instead of
 * relying on the schema's cascades, which SQLite ignores unless
 * `PRAGMA foreign_keys = ON` is set on the connection.
 */
export async function purgeOrphanedRows(db: LibraryDatabase): Promise<void> {
  await db
    .delete(schema.releaseArtists)
    .where(
      notInArray(
        schema.releaseArtists.releaseId,
        db.select({ id: schema.songs.releaseId }).from(schema.songs),
      ),
    );
  await db
    .delete(schema.releases)
    .where(
      notInArray(
        schema.releases.id,
        db.select({ id: schema.songs.releaseId }).from(schema.songs),
      ),
    );
  await db
    .delete(schema.artists)
    .where(
      notInArray(
        schema.artists.id,
        db
          .select({ id: schema.releaseArtists.artistId })
          .from(schema.releaseArtists),
      ),
    );
}
