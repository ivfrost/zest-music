import { z } from 'zod';

export const TapBehaviorSchema = z.enum(['none', 'start-over', 'pause']);

const ArtistImagesSchema = z.enum(['off', 'wikimedia']);

export const AppPreferencesSchema = z.object({
  artistImages: ArtistImagesSchema.default('wikimedia'),
  // Opt-in: the only lookup that sends artist names to a non-Wikimedia server.
  artistImageDeezerFallback: z.boolean().default(false),
  currentPlayingTapBehavior: TapBehaviorSchema.default('none'),
});

export type AppPreferences = z.infer<typeof AppPreferencesSchema>;
export type TapBehavior = z.infer<typeof TapBehaviorSchema>;
export type ArtistImageSource = 'off' | 'wikimedia' | 'wikimedia-deezer';
