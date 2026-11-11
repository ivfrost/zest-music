import { z } from 'zod';

const RepeatModeSchema = z.enum(['off', 'one', 'all']);
export type RepeatMode = z.infer<typeof RepeatModeSchema>;

// Bump on shape changes; data written with another version is discarded.
export const PLAYBACK_STORAGE_VERSION = 1;

export const PlaybackSessionSchema = z.object({
  version: z.literal(PLAYBACK_STORAGE_VERSION),
  currentRoute: z.string(),
  queue: z.array(z.string()).min(1),
  order: z.array(z.string()).min(1),
  currentIndex: z.number().int().nonnegative(),
  repeatMode: RepeatModeSchema,
  isShuffling: z.boolean(),
  savedAt: z.number(),
});
export type PlaybackSession = z.infer<typeof PlaybackSessionSchema>;

export const PlaybackPositionSchema = z.object({
  version: z.literal(PLAYBACK_STORAGE_VERSION),
  uri: z.string(),
  positionSeconds: z.number().nonnegative(),
  savedAt: z.number(),
});
export type PlaybackPosition = z.infer<typeof PlaybackPositionSchema>;
