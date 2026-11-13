import { STORAGE_KEYS, storage } from '@/lib/storage';
import { type MusicLocation, MusicLocationSchema } from '@/types/musicLocation';

/** Reads the saved music locations, dropping an unreadable entry. */
export async function loadMusicLocations(): Promise<MusicLocation[]> {
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

export async function addMusicLocation(
  location: MusicLocation,
): Promise<MusicLocation[]> {
  const locations = await loadMusicLocations();
  if (locations.some(saved => saved.uri === location.uri)) return locations;

  const updated = [...locations, location];
  await storage.setItem(STORAGE_KEYS.musicLocations, JSON.stringify(updated));
  return updated;
}

export async function removeMusicLocation(
  location: MusicLocation,
): Promise<MusicLocation[]> {
  const locations = await loadMusicLocations();
  const updated = locations.filter(saved => saved.uri !== location.uri);
  await storage.setItem(STORAGE_KEYS.musicLocations, JSON.stringify(updated));
  return updated;
}
