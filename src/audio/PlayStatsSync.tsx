import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo } from "react";
import { songs } from "@/db/schema";
import { audioEngine } from "./audioEngine";

/**
 * Records each track's first actual playback in SQLite. Must be mounted inside
 * SQLiteProvider so it can reuse the app's database connection.
 */
export function PlayStatsSync() {
  const sqlite = useSQLiteContext();
  const db = useMemo(() => drizzle(sqlite), [sqlite]);

  useEffect(() => {
    return audioEngine.onTrackPlayed(uri => {
      void (async () => {
        try {
          await db
            .update(songs)
            .set({
              playCount: sql`${songs.playCount} + 1`,
              lastPlayedAt: Date.now(),
            })
            .where(eq(songs.uri, uri));
        } catch (error) {
          console.warn("[PlayStats] Could not record play", { uri, error });
        }
      })();
    });
  }, [db]);

  return null;
}
