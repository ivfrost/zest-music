import type { z } from 'zod';
import { STORAGE_KEYS, storage } from '@/lib/storage';
import {
  PLAYBACK_STORAGE_VERSION,
  PlaybackPositionSchema,
  type PlaybackSession,
  PlaybackSessionSchema,
} from '@/types/playback';

async function readValidated<T>(
  key: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const json = await storage.getItem(key);
  if (json === null) return null;

  try {
    const result = schema.safeParse(JSON.parse(json));
    if (result.success) return result.data;
  } catch {
    // Unparsable JSON falls through and is discarded below.
  }

  console.warn(`[Playback] Discarding corrupt data at ${key}`);
  await storage.removeItem(key);
  return null;
}

export const loadPlaybackSession = () =>
  readValidated(STORAGE_KEYS.playbackSession, PlaybackSessionSchema);

export const loadPlaybackPosition = () =>
  readValidated(STORAGE_KEYS.playbackPosition, PlaybackPositionSchema);

export async function savePlaybackSession(
  session: Omit<PlaybackSession, 'version' | 'savedAt'>,
): Promise<void> {
  await storage.setItem(
    STORAGE_KEYS.playbackSession,
    JSON.stringify({
      ...session,
      version: PLAYBACK_STORAGE_VERSION,
      savedAt: Date.now(),
    }),
  );
}

export async function savePlaybackPosition(
  uri: string,
  positionSeconds: number,
): Promise<void> {
  await storage.setItem(
    STORAGE_KEYS.playbackPosition,
    JSON.stringify({
      version: PLAYBACK_STORAGE_VERSION,
      uri,
      positionSeconds,
      savedAt: Date.now(),
    }),
  );
}

export async function clearPlaybackSession(): Promise<void> {
  await storage.multiRemove([
    STORAGE_KEYS.playbackSession,
    STORAGE_KEYS.playbackPosition,
  ]);
}

/**
 * `order` must be a permutation of `queue`; otherwise fall back to `queue`
 * and set `fallback` so the caller can clear shuffle.
 */
export function normalizeOrder(
  queue: readonly string[],
  order: readonly string[],
  currentIndex: number,
  currentUri: string,
): { order: string[]; currentIndex: number; fallback: boolean } {
  const index = Math.trunc(currentIndex);
  const counts = new Map<string, number>();
  for (const uri of queue) counts.set(uri, (counts.get(uri) ?? 0) + 1);

  let valid = order.length === queue.length;
  for (const uri of valid ? order : []) {
    const remaining = counts.get(uri) ?? 0;
    if (remaining === 0) {
      valid = false;
      break;
    }
    counts.set(uri, remaining - 1);
  }

  if (!valid) {
    return {
      order: [...queue],
      currentIndex: Math.max(0, queue.indexOf(currentUri)),
      fallback: true,
    };
  }

  return {
    order: [...order],
    currentIndex: Math.min(Math.max(index, 0), order.length - 1),
    fallback: false,
  };
}
