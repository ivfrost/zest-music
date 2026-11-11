import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  musicLocations: '@lemomuse/musicLocations',
  audioCacheIndex: '@lemomuse/audioCacheIndex',
  playbackSession: '@lemomuse/playbackSession',
  playbackPosition: '@lemomuse/playbackPosition',
  preferences: '@lemomuse/preferences',
  artistImages: '@lemomuse/artistImages',
} as const;

export { AsyncStorage as storage };
