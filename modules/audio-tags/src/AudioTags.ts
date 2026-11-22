import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** Tag data as the native reader reports it. An empty string or 0 means absent. */
export type NativeAudioTags = {
  title: string;
  album: string;
  artists: string[];
  albumArtists: string[];
  trackNumber: number;
  durationSeconds: number;
  releaseType: string[];
  musicBrainzAlbumId: string;
  musicBrainzReleaseGroupId: string;
  musicBrainzRecordingId: string;
  musicBrainzTrackId: string;
  musicBrainzArtistIds: string[];
  musicBrainzAlbumArtistIds: string[];
  artworkUri: string;
};

type AudioTagsModuleType = {
  read(uri: string): Promise<NativeAudioTags>;
};

let nativeModule: AudioTagsModuleType | null = null;

function getModule(): AudioTagsModuleType | null {
  if (Platform.OS !== 'android') return null;
  if (nativeModule) return nativeModule;

  try {
    nativeModule = requireNativeModule<AudioTagsModuleType>('AudioTags');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

/**
 * Reads tags through the native parser. Returns null when the module is absent
 * (Expo Go, iOS) or the format is not supported. Callers then use the JS parser.
 */
export async function readAudioTags(
  uri: string,
): Promise<NativeAudioTags | null> {
  const module = getModule();
  if (!module) return null;

  try {
    return await module.read(uri);
  } catch {
    return null;
  }
}
