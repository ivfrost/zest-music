import { eq } from 'drizzle-orm';
import { drizzle, useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import * as schema from '@/db/schema';
import type { LibraryDatabase } from '@/db/library';

export interface PlaylistSummary {
  id: string;
  title: string;
  songCount: number;
}

/** The provider's connection, wrapped once per connection for Drizzle. */
export function useLibraryDatabase(): LibraryDatabase {
  const sqlite = useSQLiteContext();
  return useMemo(() => drizzle(sqlite), [sqlite]);
}

/**
 * Playlists with their song counts, kept current through the connection's
 * change listener. Counts come from a second query on `song_playlists` because
 * `useLiveQuery` only subscribes to the query's first table.
 */
export function usePlaylists(): PlaylistSummary[] {
  const db = useLibraryDatabase();

  const { data: playlists } = useLiveQuery(
    db
      .select({ id: schema.playlists.id, title: schema.playlists.title })
      .from(schema.playlists)
      .orderBy(schema.playlists.title),
    [db],
  );

  const { data: memberships } = useLiveQuery(
    db
      .select({ playlistId: schema.songPlaylists.playlistId })
      .from(schema.songPlaylists),
    [db],
  );

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of memberships) {
      counts.set(row.playlistId, (counts.get(row.playlistId) ?? 0) + 1);
    }

    return playlists.map(playlist => ({
      ...playlist,
      songCount: counts.get(playlist.id) ?? 0,
    }));
  }, [playlists, memberships]);
}

/** Song ids in a playlist, in the order the rows were added. */
export function usePlaylistSongIds(playlistId: string): string[] {
  const db = useLibraryDatabase();

  const { data } = useLiveQuery(
    db
      .select({ songId: schema.songPlaylists.songId })
      .from(schema.songPlaylists)
      .where(eq(schema.songPlaylists.playlistId, playlistId)),
    [db, playlistId],
  );

  return useMemo(() => data.map(row => row.songId), [data]);
}
