import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  musicLocations: '@zestmusic/musicLocations',
  audioCacheIndex: '@zestmusic/audioCacheIndex',
  playbackSession: '@zestmusic/playbackSession',
  playbackPosition: '@zestmusic/playbackPosition',
  preferences: '@zestmusic/preferences',
  artistImages: '@zestmusic/artistImages',
} as const;

export { AsyncStorage as storage };
