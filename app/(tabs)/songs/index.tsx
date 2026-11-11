import { usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  createQueueFromSongList,
  getSongDisplayInfo,
} from '@/audio/trackHelpers';
import { ActionSheet } from '@/components/ActionSheet';
import { useRowSeparator } from '@/components/RowSeparator';
import { SongRow } from '@/components/SongRow';
import { TabScreen } from '@/components/TabScreen';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { setAlbumFilter, useAlbumFilter } from '@/lib/albumFilter';
import { usePlayStats } from '@/lib/playStats';
import type { Song } from '@/types/songs';

/** Caps ranked modes so they stay a selection instead of the whole library. */
const RANKED_LIMIT = 50;

const MODES = ['all', 'recent', 'most'] as const;
type Mode = (typeof MODES)[number];

const MODE_LABELS: Record<Mode, string> = {
  all: 'All songs',
  recent: 'Recent',
  most: 'Most played',
};

const SONG_ACTIONS = [
  'Add to playlist',
  'Enqueue',
  'Play Next (preserve queue)',
  'Play Now (preserve queue)',
];

export default function SongsTab() {
  const {
    songs,
    releaseById,
    artistNameById,
    isLoading: isLibraryLoading,
  } = useMusicLocations();
  const { playTrack, currentUri, isPlaying, isLoading } = useAudio();
  const currentRoute = usePathname();
  const { colors, rippleColor, dividerColor } = useMaterialTheme();
  const renderSeparator = useRowSeparator(dividerColor, 88);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [mode, setMode] = useState<Mode>('all');
  // Session plays layered over the persisted counters.
  const played = usePlayStats();
  const albumId = useAlbumFilter();
  const albumTitle = albumId
    ? (releaseById.get(albumId)?.title ?? null)
    : null;
  const albumArtist = useMemo(() => {
    if (!albumId) return null;
    const song = songs.find(candidate => candidate.releaseId === albumId);
    return song ? getSongDisplayInfo(song, artistNameById).artist : null;
  }, [albumId, songs, artistNameById]);

  const lists = useMemo(() => {
    const lastPlayedAt = (song: Song) =>
      played.lastPlayedAt[song.uri] ?? song.lastPlayedAt ?? null;
    const playCount = (song: Song) =>
      song.playCount + (played.increments[song.uri] ?? 0);

    const recent = songs
      .filter(song => lastPlayedAt(song) != null)
      .sort((a, b) => (lastPlayedAt(b) ?? 0) - (lastPlayedAt(a) ?? 0))
      .slice(0, RANKED_LIMIT);

    const most = songs
      .filter(song => playCount(song) > 0)
      .sort((a, b) => {
        const byCount = playCount(b) - playCount(a);
        return byCount !== 0
          ? byCount
          : (lastPlayedAt(b) ?? 0) - (lastPlayedAt(a) ?? 0);
      })
      .slice(0, RANKED_LIMIT);

    return { all: songs, recent, most };
  }, [songs, played]);

  const listRef = useRef<FlatList<Song>>(null);
  const offsetsRef = useRef<Record<string, number>>({});
  const pendingOffsetRef = useRef<number | null>(null);
  const listKey = albumId ?? mode;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetsRef.current[listKey] = event.nativeEvent.contentOffset.y;
  };

  const restoreOffset = () => {
    if (pendingOffsetRef.current === null) return;
    const offset = pendingOffsetRef.current;
    pendingOffsetRef.current = null;
    listRef.current?.scrollToOffset({ offset, animated: false });
  }

  const actionSheetInfo = useMemo(() => {
    if (!actionSong) return null;

    const { title, artist } = getSongDisplayInfo(actionSong, artistNameById);
    const releaseTitle = releaseById.get(actionSong.releaseId)?.title ?? null;
    const albumTitle = releaseTitle !== title ? releaseTitle : null;

    return {
      title,
      message: [artist || 'Unknown Artist', albumTitle].filter(Boolean).join(' · '),
    };
  }, [actionSong, artistNameById, releaseById]);

  useEffect(() => {
    pendingOffsetRef.current = offsetsRef.current[listKey] ?? 0;
    const frame = requestAnimationFrame(restoreOffset);
    return () => cancelAnimationFrame(frame);
  }, [listKey]);

  const visibleSongs = albumId
    ? songs.filter(song => song.releaseId === albumId)
    : lists[mode];
  const emptyMessage = albumId
    ? 'No songs in this album'
    : mode === 'recent'
      ? 'Nothing played yet'
      : mode === 'most'
        ? 'No play history yet'
        : isLibraryLoading
          ? 'Loading songs…'
          : 'No songs found';

  return (
    <TabScreen>
      <View className="flex-1">
        <View className="overflow-hidden rounded-3xl bg-surface-container">
          {albumId ? (
            <View className="flex-row p-2">
              <View className="flex-1 flex-row items-center gap-2 rounded-full bg-primary-container py-1.5 pl-4 pr-2">
                <Text
                  numberOfLines={1}
                  className="flex-1 text-sm font-medium text-on-primary-container"
                >
                  {[albumTitle ?? 'Album', albumArtist]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <View className="overflow-hidden rounded-full">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear album filter"
                    onPress={() => setAlbumFilter(null)}
                    android_ripple={{ color: rippleColor, borderless: true }}
                    hitSlop={8}
                    className="p-1"
                  >
                    <SymbolView
                      name={{
                        ios: 'xmark.circle.fill',
                        android: 'close',
                        web: 'close',
                      }}
                      size={18}
                      tintColor={colors.onPrimaryContainer}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View className="flex-row gap-1 p-2">
              {MODES.map(option => {
                const selected = mode === option;
                return (
                  <View
                    key={option}
                    className="flex-1 overflow-hidden rounded-full"
                  >
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => setMode(option)}
                      android_ripple={{ color: rippleColor, borderless: true }}
                      className={`items-center py-2 ${selected ? 'bg-primary-container' : ''}`}
                    >
                      <Text
                        numberOfLines={1}
                        className={`text-sm font-medium ${
                          selected
                            ? 'text-on-primary-container'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        {MODE_LABELS[option]}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View className="mt-3 max-h-full shrink overflow-hidden rounded-3xl bg-surface-container-low">
          <FlatList
            ref={listRef}
            data={visibleSongs}
            keyExtractor={song => song.uri}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={restoreOffset}
            extraData={`${currentUri}|${isPlaying}|${isLoading}|${mode}|${albumId ?? ''}`}
            className="grow-0"
            contentContainerClassName="py-2"
            ItemSeparatorComponent={renderSeparator}
            ListEmptyComponent={
              <Text className="p-6 text-on-surface-variant">{emptyMessage}</Text>
            }
            renderItem={({ item: song }) => {
              const release = releaseById.get(song.releaseId);
              const { title: songTitle, artist: artistNames } =
                getSongDisplayInfo(song, artistNameById);
              const albumTitle =
                release && release.title !== song.title
                  ? release.title
                  : null;
              const subtitle = [albumTitle, artistNames || 'Unknown Artist']
                .filter(Boolean)
                .join(' · ');

              return (
                <SongRow
                  title={songTitle}
                  subtitle={subtitle}
                  artworkUri={release?.artworkUri ?? null}
                  durationSeconds={song.duration}
                  iconColor={colors.onSurfaceVariant}
                  rippleColor={rippleColor}
                  onPress={() =>
                    void playTrack(song.uri, {
                      currentRoute,
                      queue: createQueueFromSongList(visibleSongs, song.uri),
                    })
                  }
                  onLongPress={() => setActionSong(song)}
                />
              );
            }}
          />
        </View>
      </View>

      <ActionSheet
        visible={actionSong !== null}
        title={actionSheetInfo?.title}
        message={actionSheetInfo?.message}
        options={SONG_ACTIONS}
        onSelect={() => setActionSong(null)}
        onCancel={() => setActionSong(null)}
      />
    </TabScreen>
  );
}
