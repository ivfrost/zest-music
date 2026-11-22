import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  View,
} from 'react-native';
import { getSongDisplayInfo } from '@/audio/trackHelpers';
import {
  FilterDropdown,
  FILTER_ICON,
  SORT_ICON,
} from '@/components/FilterDropdown';
import { ListCard } from '@/components/ListCard';
import { Row } from '@/components/Row';
import { useRowSeparator } from '@/components/RowSeparator';
import { TabMenuButton } from '@/components/TabMenuButton';
import { TabScreen } from '@/components/TabScreen';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { setAlbumFilter } from '@/lib/albumFilter';
import { nameCollator } from '@/lib/collator';
import { usePlayStats } from '@/lib/playStats';
import { spacing } from '@/theme';
import type { ReleaseSummary } from '@/types/releases';
import type { Song } from '@/types/songs';

const MODES = ['all', 'recent', 'most'] as const;
type Mode = (typeof MODES)[number];

const MODE_LABELS: Record<Mode, string> = {
  all: 'All',
  recent: 'Recent',
  most: 'Most played',
};

const MODE_OPTIONS = MODES.map(option => MODE_LABELS[option]);

const SORT_OPTIONS = ['Name A–Z', 'Name Z–A'];

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
    isScanning: isLibraryLoading,
  } = useMusicLocations();
  const { colors, rippleColor, dividerColor } = useMaterialTheme();
  const renderSeparator = useRowSeparator(dividerColor, 88);
  const [mode, setMode] = useState<Mode>('all');
  const [isDescending, setIsDescending] = useState(false);
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

    const direction = isDescending ? -1 : 1;
    const all = [...rows].sort(
      (a, b) =>
        direction * nameCollator.compare(a.release.title, b.release.title) ||
        nameCollator.compare(a.artist, b.artist),
    );
    const recent = rows
      .filter(entry => entry.lastPlayedAt > 0)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
    const most = rows
      .filter(entry => entry.playCount > 0)
      .sort(
        (a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt,
      );

    return { all, recent, most };
  }, [releases, songs, artistNameById, played, isDescending]);

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

  const countLabel = `${mode === 'all' ? '' : `${MODE_LABELS[mode]} · `}${
    visibleAlbums.length
  } ${visibleAlbums.length === 1 ? 'album' : 'albums'}`;

  return (
    <TabScreen>
      <ListCard
        titleRow={
          <View className="h-12 flex-row items-center gap-2">
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="text-title-large font-medium text-on-surface"
            >
              Albums
            </Text>
            <View className="flex-1" />
            <TabMenuButton />
          </View>
        }
        label={countLabel}
        actions={
          <>
            <View className="overflow-hidden rounded-md3-full">
              <FilterDropdown
                label={MODE_LABELS[mode]}
                options={MODE_OPTIONS}
                selectedIndex={MODES.indexOf(mode)}
                onSelect={index => {
                  const next = MODES[index];
                  if (next) setMode(next);
                }}
                accessibilityLabel={`Filter albums, ${MODE_LABELS[mode]}`}
                icon={FILTER_ICON}
              />
            </View>
            {mode === 'all' && (
              <View className="overflow-hidden rounded-md3-full">
                <FilterDropdown
                  label={SORT_OPTIONS[isDescending ? 1 : 0] ?? ''}
                  options={SORT_OPTIONS}
                  selectedIndex={isDescending ? 1 : 0}
                  onSelect={index => setIsDescending(index === 1)}
                  accessibilityLabel={`Sort albums, ${SORT_OPTIONS[isDescending ? 1 : 0]}`}
                  icon={SORT_ICON}
                />
              </View>
            )}
          </>
        }
      >
        {({ listMaxHeight, onRowLayout }) => (
          <FlatList
            ref={listRef}
            data={visibleAlbums}
            keyExtractor={entry => entry.release.id}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={restoreOffset}
            extraData={mode}
            className="shrink"
            style={{ maxHeight: listMaxHeight }}
            contentContainerStyle={{ paddingBottom: spacing.sm }}
            ItemSeparatorComponent={renderSeparator}
            ListEmptyComponent={
              <Text className="p-6 text-on-surface-variant">
                {emptyMessage}
              </Text>
            }
            renderItem={({ item, index }) => (
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
                onLayout={index === 0 ? onRowLayout : undefined}
              />
            )}
          />
        )}
      </ListCard>
    </TabScreen>
  );
}
