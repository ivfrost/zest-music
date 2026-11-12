import { useSyncExternalStore } from 'react';
import { audioEngine } from '@/audio/audioEngine';

export type PlayStats = {
  /** Last play this session, keyed by song URI. */
  lastPlayedAt: Record<string, number>;
  /** Plays this session, added to the persisted `playCount`. */
  increments: Record<string, number>;
};

let snapshot: PlayStats = { lastPlayedAt: {}, increments: {} };
const listeners = new Set<() => void>();

// Fast Refresh re-runs this module, so drop the previous listener first.
const engine = globalThis as { __playStatsDispose?: () => void };
engine.__playStatsDispose?.();
engine.__playStatsDispose = audioEngine.onTrackPlayed(uri => {
  snapshot = {
    lastPlayedAt: { ...snapshot.lastPlayedAt, [uri]: Date.now() },
    increments: {
      ...snapshot.increments,
      [uri]: (snapshot.increments[uri] ?? 0) + 1,
    },
  };
  for (const listener of listeners) listener();
});

function getPlayStats(): PlayStats {
  return snapshot;
}

function subscribeToPlayStats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlayStats(): PlayStats {
  return useSyncExternalStore(subscribeToPlayStats, getPlayStats);
}
