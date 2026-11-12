import { STORAGE_KEYS, storage } from '@/lib/storage';
import {
  type AppPreferences,
  AppPreferencesSchema,
  type ArtistImageSource,
} from '@/types/preferences';

const defaults = (): AppPreferences => AppPreferencesSchema.parse({});

let current = defaults();
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export const getPreferences = (): AppPreferences => current;

/** Collapses the two image switches into one lookup strategy. */
export function artistImageSource(
  preferences: AppPreferences,
): ArtistImageSource {
  if (preferences.artistImages === 'off') return 'off';
  return preferences.artistImageDeezerFallback
    ? 'wikimedia-deezer'
    : 'wikimedia';
}

export function subscribeToPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadPreferences(): Promise<void> {
  if (loaded) return Promise.resolve();

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const json = await storage.getItem(STORAGE_KEYS.preferences);
        if (json !== null) {
          const result = AppPreferencesSchema.safeParse(JSON.parse(json));
          if (result.success) {
            current = result.data;
          } else {
            console.warn('[Preferences] Discarding invalid saved values.');
            await storage.removeItem(STORAGE_KEYS.preferences);
          }
        }
      } catch (error) {
        console.warn('[Preferences] Could not load saved values', error);
        await storage.removeItem(STORAGE_KEYS.preferences);
      } finally {
        loaded = true;
        emit();
      }
    })();
  }

  return loadPromise;
}

export async function updatePreferences(
  patch: Partial<AppPreferences>,
): Promise<void> {
  current = AppPreferencesSchema.parse({ ...current, ...patch });
  emit();
  await storage.setItem(STORAGE_KEYS.preferences, JSON.stringify(current));
}
