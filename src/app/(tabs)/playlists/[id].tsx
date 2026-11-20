import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createQueueFromSongList,
  getSongDisplayInfo,
} from '@/audio/trackHelpers';
import { ActionSheet } from '@/components/ActionSheet';
import { useRowSeparator } from '@/components/RowSeparator';
import { Snackbar, type SnackbarMessage } from '@/components/Snackbar';
import { SongRow } from '@/components/SongRow';
import { removeSongFromPlaylist } from '@/db/library';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import {
  useLibraryDatabase,
  usePlaylistSongIds,
  usePlaylists,
} from '@/hooks/usePlaylists';
import { MINI_PLAYER_CLEARANCE } from '@/lib/layout';
import type { Song } from '@/types/songs';

const BACK_ICON = {
  ios: 'chevron.left',
  android: 'arrow_back',
  web: 'arrow_back',
} as const;

const songLabel = (count: number) =>
  count === 1 ? '1 song' : `${count} songs`;

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = typeof id === 'string' ? id : '';
  const insets = useSafeAreaInsets();
  const currentRoute = usePathname();
  const { colors, rippleColor, dividerColor } = useMaterialTheme();
  const renderSeparator = useRowSeparator(dividerColor, 88);
  const { songs, releaseById, artistNameById } = useMusicLocations();
  const { playTrack } = useAudio();
  const db = useLibraryDatabase();
  const playlists = usePlaylists();
  const songIds = usePlaylistSongIds(playlistId);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);

  const playlist =
    playlists.find(candidate => candidate.id === playlistId) ?? null;
  const songsById = useMemo(
    () => new Map(songs.map(song => [song.id, song])),
    [songs],
  );
  const playlistSongs = useMemo(
    () =>
      songIds.flatMap(songId => {
        const song = songsById.get(songId);
        return song ? [song] : [];
      }),
    [songIds, songsById],
  );

  const removeFromPlaylist = async (song: Song) => {
    try {
      const removed = await removeSongFromPlaylist(db, song.id, playlistId);
      const { title } = getSongDisplayInfo(song, artistNameById);
      setSnackbar({
        id: Date.now(),
        text: removed
          ? `Removed ${title}`
          : 'Song is already out of the playlist',
      });
    } catch (error) {
      console.warn('[Playlists] Could not remove song', error);
      setSnackbar({ id: Date.now(), text: 'Could not remove song' });
    }
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top }} className="bg-background">
      <StatusBar style="auto" />

      <View className="flex-row items-center pb-2 pr-4">
        <View className="h-12 w-12 overflow-hidden rounded-md3-full">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            android_ripple={{ color: rippleColor, borderless: true }}
            className="h-full w-full items-center justify-center"
          >
            <SymbolView
              name={BACK_ICON}
              size={24}
              tintColor={colors.onSurface}
            />
          </Pressable>
        </View>

        <View className="flex-1">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="text-title-large font-medium text-on-surface"
          >
            {playlist?.title ?? 'Playlist'}
          </Text>
          <Text className="text-body-medium text-on-surface-variant opacity-70">
            {songLabel(playlistSongs.length)}
          </Text>
        </View>
      </View>

      <FlatList
        className="flex-1 px-4"
        data={playlistSongs}
        keyExtractor={song => song.id}
        ItemSeparatorComponent={renderSeparator}
        contentContainerStyle={{ paddingBottom: MINI_PLAYER_CLEARANCE }}
        ListEmptyComponent={
          <Text className="p-6 text-on-surface-variant">
            No songs in this playlist
          </Text>
        }
        renderItem={({ item: song }) => {
          const release = releaseById.get(song.releaseId);
          const { title, artist } = getSongDisplayInfo(song, artistNameById);
          const albumTitle =
            release && release.title !== song.title ? release.title : null;
          const subtitle = [artist || 'Unknown Artist', albumTitle]
            .filter(Boolean)
            .join(' · ');

          return (
            <SongRow
              title={title}
              subtitle={subtitle}
              artworkUri={release?.artworkUri ?? null}
              durationSeconds={song.duration}
              iconColor={colors.onSurfaceVariant}
              rippleColor={rippleColor}
              onPress={() =>
                void playTrack(song.uri, {
                  currentRoute,
                  queue: createQueueFromSongList(playlistSongs, song.uri),
                })
              }
              onLongPress={() => setActionSong(song)}
            />
          );
        }}
      />

      <ActionSheet
        visible={actionSong !== null}
        title={
          actionSong
            ? getSongDisplayInfo(actionSong, artistNameById).title
            : undefined
        }
        message={playlist?.title}
        options={['Remove from playlist']}
        onSelect={() => {
          const song = actionSong;
          setActionSong(null);
          if (song) void removeFromPlaylist(song);
        }}
        onCancel={() => setActionSong(null)}
      />
      <Snackbar message={snackbar} onDismiss={() => setSnackbar(null)} />
    </View>
  );
}
