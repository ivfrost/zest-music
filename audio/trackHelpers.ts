import type { Song } from '@/types/songs';

export function createQueueFromSongList(
  songs: readonly Song[],
  startUri: string,
): string[] {
  const startIndex = songs.findIndex(song => song.uri === startUri);
  if (startIndex < 0) return [startUri];
  return [...songs.slice(startIndex), ...songs.slice(0, startIndex)].map(
    song => song.uri,
  );
}

function findCurrentSong(
  songs: readonly Song[],
  currentUri: string | null,
): Song | null {
  if (!currentUri) return null;
  return songs.find(song => song.uri === currentUri) ?? null;
}

function getSongArtistNames(
  song: Pick<Song, 'artistIds'> | null,
  artistNameById: ReadonlyMap<string, string>,
): string {
  if (!song) return 'Unknown Artist';

  const names = song.artistIds
    .map(artistId => artistNameById.get(artistId))
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? names.join(', ') : 'Unknown Artist';
}

export function getSongDisplayInfo(
  song: Pick<Song, 'title' | 'artistIds'>,
  artistNameById: ReadonlyMap<string, string>,
) {
  return {
    title: song.title,
    artist: getSongArtistNames(song, artistNameById),
  };
}

export function getCurrentTrackInfo(
  songs: readonly Song[],
  currentUri: string | null,
  artistNameById: ReadonlyMap<string, string>,
  isLoading: boolean,
) {
  const currentSong = findCurrentSong(songs, currentUri);
  const displayInfo = currentSong
    ? getSongDisplayInfo(currentSong, artistNameById)
    : null;

  return {
    currentSong,
    currentTitle:
      displayInfo?.title ?? (isLoading ? 'Loading track…' : 'Unknown track'),
    currentArtist: displayInfo?.artist ?? 'Unknown Artist',
  };
}
