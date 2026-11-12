import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from 'react-native';
import { getSongDisplayInfo } from '@/audio/trackHelpers';
import { Row } from '@/components/Row';
import { useRowSeparator } from '@/components/RowSeparator';
import { TabScreen } from '@/components/TabScreen';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { setAlbumFilter } from '@/lib/albumFilter';
import { usePlayStats } from '@/lib/playStats';
import type { ReleaseSummary } from '@/types/releases';
import type { Song } from '@/types/songs';

const MODES = ['all', 'recent', 'most'] as const;
type Mode = (typeof MODES)[number];

const MODE_LABELS: Record<Mode, string> = {
  all: 'All albums',
  recent: 'Recent',
  most: 'Most played',
};

type AlbumEntry = {
  release: ReleaseSummary;
  artist: string;
  songCount: number;
  lastPlayedAt: number;
  playCount: number;
};

export default function AlbumsTab() {
  const {
    releases,
    songs,
    artistNameById,
    isLoading: isLibraryLoading,
  } = useMusicLocations();
  const { colors, rippleColor, dividerColor } = useMaterialTheme();
  const renderSeparator = useRowSeparator(dividerColor, 88);
  const [mode, setMode] = useState<Mode>('all');
  const played = usePlayStats();

  const lists = useMemo(() => {
    const songsByRelease = new Map<string, Song[]>();
    for (const song of songs) {
      const bucket = songsByRelease.get(song.releaseId);
      if (bucket) {
        bucket.push(song);
      } else {
        songsByRelease.set(song.releaseId, [song]);
      }
    }

    const rows: AlbumEntry[] = releases.flatMap(release => {
      const albumSongs = songsByRelease.get(release.id);
      if (!albumSongs || albumSongs.length === 0) return [];

      let lastPlayedAt = 0;
      let playCount = 0;
      for (const song of albumSongs) {
        lastPlayedAt = Math.max(
          lastPlayedAt,
          played.lastPlayedAt[song.uri] ?? song.lastPlayedAt ?? 0,
        );
        playCount += song.playCount + (played.increments[song.uri] ?? 0);
      }

      return [
        {
          release,
          artist: getSongDisplayInfo(albumSongs[0], artistNameById).artist,
          songCount: albumSongs.length,
          lastPlayedAt,
          playCount,
        },
      ];
    });

    const all = [...rows].sort(
      (a, b) =>
        a.artist.localeCompare(b.artist) ||
        a.release.title.localeCompare(b.release.title),
    );
    const recent = rows
      .filter(entry => entry.lastPlayedAt > 0)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
    const most = rows
      .filter(entry => entry.playCount > 0)
      .sort(
        (a, b) =>
          b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt,
      );

    return { all, recent, most };
  }, [releases, songs, artistNameById, played]);

  const listRef = useRef<FlatList<AlbumEntry>>(null);
  const offsetsRef = useRef<Record<string, number>>({});
  const pendingOffsetRef = useRef<number | null>(null);
  const listKey = mode;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetsRef.current[listKey] = event.nativeEvent.contentOffset.y;
  };

  function restoreOffset() {
    if (pendingOffsetRef.current === null) return;
    const offset = pendingOffsetRef.current;
    pendingOffsetRef.current = null;
    listRef.current?.scrollToOffset({ offset, animated: false });
  }

  useEffect(() => {
    pendingOffsetRef.current = offsetsRef.current[listKey] ?? 0;
    const frame = requestAnimationFrame(restoreOffset);
    return () => cancelAnimationFrame(frame);
  }, [listKey]);

  const visibleAlbums = lists[mode];
  const emptyMessage =
    mode === 'recent'
      ? 'Nothing played yet'
      : mode === 'most'
        ? 'Nothing played yet'
        : isLibraryLoading
          ? 'Loading albums…'
          : 'No albums found';

  return (
    <TabScreen>
      <View className="flex-1">
        <View className="overflow-hidden rounded-3xl bg-surface-container">
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
        </View>

        <View className="mt-3 max-h-full shrink overflow-hidden rounded-3xl bg-surface-container-low">
          <FlatList
            ref={listRef}
            data={visibleAlbums}
            keyExtractor={entry => entry.release.id}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={restoreOffset}
            extraData={mode}
            className="grow-0"
            contentContainerClassName="py-2"
            ItemSeparatorComponent={renderSeparator}
            ListEmptyComponent={
              <Text className="p-6 text-on-surface-variant">{emptyMessage}</Text>
            }
            renderItem={({ item }) => (
              <Row
                title={item.release.title}
                subtitle={`${item.artist} · ${item.songCount} ${
                  item.songCount === 1 ? 'song' : 'songs'
                }`}
                artworkUri={item.release.artworkUri}
                icon={{ ios: 'square.stack', android: 'album', web: 'album' }}
                iconColor={colors.onSurfaceVariant}
                rippleColor={rippleColor}
                showChevron
                onPress={() => {
                  setAlbumFilter(item.release.id);
                  router.navigate('/songs');
                }}
              />
            )}
          />
        </View>
      </View>
    </TabScreen>
  );
}
