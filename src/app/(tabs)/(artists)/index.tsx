import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { ArtistRow } from '@/components/ArtistRow';
import {
  FilterDropdown,
  FILTER_ICON,
  SORT_ICON,
} from '@/components/FilterDropdown';
import { ListCard } from '@/components/ListCard';
import { useRowSeparator } from '@/components/RowSeparator';
import { TabMenuButton } from '@/components/TabMenuButton';
import { TabScreen } from '@/components/TabScreen';
import { useArtistImages } from '@/hooks/useArtistImages';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { usePreferences } from '@/hooks/usePreferences';
import { artistImageUrl } from '@/lib/artistImages';
import { nameCollator } from '@/lib/collator';
import { usePlayStats } from '@/lib/playStats';
import { artistImageSource } from '@/lib/preferences';
import { spacing } from '@/theme';
import type { Artist } from '@/types/artists';

const MODES = ['all', 'recent', 'most'] as const;
type Mode = (typeof MODES)[number];

const MODE_LABELS: Record<Mode, string> = {
  all: 'All',
  recent: 'Recent',
  most: 'Most played',
};

const MODE_OPTIONS = MODES.map(option => MODE_LABELS[option]);

const SORT_OPTIONS = ['Name A–Z', 'Name Z–A'];

export default function ArtistTab() {
  const { artists, songs, isScanning: isLibraryLoading } = useMusicLocations();
  const songCountByArtist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of songs) {
      for (const artistId of song.artistIds) {
        counts.set(artistId, (counts.get(artistId) ?? 0) + 1);
      }
    }
    return counts;
  }, [songs]);
  const played = usePlayStats();
  const artistPlaybackById = useMemo(() => {
    const stats = new Map<
      string,
      { lastPlayedAt: number; playCount: number }
    >();
    for (const song of songs) {
      const lastPlayedAt =
        played.lastPlayedAt[song.uri] ?? song.lastPlayedAt ?? 0;
      const playCount = song.playCount + (played.increments[song.uri] ?? 0);
      for (const artistId of song.artistIds) {
        const current = stats.get(artistId) ?? {
          lastPlayedAt: 0,
          playCount: 0,
        };
        current.lastPlayedAt = Math.max(current.lastPlayedAt, lastPlayedAt);
        current.playCount += playCount;
        stats.set(artistId, current);
      }
    }
    return stats;
  }, [songs, played]);
  const [mode, setMode] = useState<Mode>('all');
  const [isDescending, setIsDescending] = useState(false);
  const lists = useMemo(() => {
    const recent = artists
      .filter(
        artist => (artistPlaybackById.get(artist.id)?.lastPlayedAt ?? 0) > 0,
      )
      .sort((a, b) => {
        const byPlayedAt =
          (artistPlaybackById.get(b.id)?.lastPlayedAt ?? 0) -
          (artistPlaybackById.get(a.id)?.lastPlayedAt ?? 0);
        return byPlayedAt || nameCollator.compare(a.name, b.name);
      });
    const most = artists
      .filter(artist => (artistPlaybackById.get(artist.id)?.playCount ?? 0) > 0)
      .sort((a, b) => {
        const statsA = artistPlaybackById.get(a.id);
        const statsB = artistPlaybackById.get(b.id);
        return (
          (statsB?.playCount ?? 0) - (statsA?.playCount ?? 0) ||
          (statsB?.lastPlayedAt ?? 0) - (statsA?.lastPlayedAt ?? 0) ||
          nameCollator.compare(a.name, b.name)
        );
      });
    const all = isDescending
      ? [...artists].sort((a, b) => nameCollator.compare(b.name, a.name))
      : artists;
    return { all, recent, most };
  }, [artists, artistPlaybackById, isDescending]);
  const visibleArtists = lists[mode];
  const emptyMessage =
    mode === 'all'
      ? isLibraryLoading
        ? 'Loading artists…'
        : 'No artists found'
      : 'Nothing played yet';
  const { currentUri, isPlaying, isLoading } = useAudio();
  const { colors, rippleColor, dividerColor } = useMaterialTheme();
  const { preferences } = usePreferences();
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 0 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { item: Artist }[] }) => {
      setVisibleIds(new Set(viewableItems.map(({ item }) => item.id)));
    },
  ).current;
  const artistImages = useArtistImages(
    artists,
    artistImageSource(preferences),
    visibleIds,
  );
  const renderSeparator = useRowSeparator(dividerColor, 88);

  const listRef = useRef<FlatList<Artist>>(null);
  const countLabel = `${mode === 'all' ? '' : `${MODE_LABELS[mode]} · `}${
    visibleArtists.length
  } ${visibleArtists.length === 1 ? 'artist' : 'artists'}`;

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
              Artists
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
                accessibilityLabel={`Filter artists, ${MODE_LABELS[mode]}`}
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
                  accessibilityLabel={`Sort artists, ${SORT_OPTIONS[isDescending ? 1 : 0]}`}
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
            data={visibleArtists}
            keyExtractor={artist => artist.id}
            extraData={`${currentUri}|${isPlaying}|${isLoading}`}
            className="shrink"
            style={{ maxHeight: listMaxHeight }}
            contentContainerStyle={{ paddingBottom: spacing.sm }}
            ItemSeparatorComponent={renderSeparator}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            ListEmptyComponent={
              <Text className="p-6 text-center text-on-surface-variant">
                {emptyMessage}
              </Text>
            }
            renderItem={({ item: artist, index }) => {
              const songCount = songCountByArtist.get(artist.id) ?? 0;
              const albumCount = artist.releaseIds.length;
              const artistImage = artistImages.get(artist.id);
              const subtitle = `${albumCount} ${
                albumCount === 1 ? 'album' : 'albums'
              } · ${songCount} ${songCount === 1 ? 'song' : 'songs'}`;

              return (
                <ArtistRow
                  name={artist.name}
                  subtitle={subtitle}
                  artworkUri={
                    artistImage ? artistImageUrl(artistImage, 'thumb') : null
                  }
                  iconColor={colors.onSurfaceVariant}
                  rippleColor={rippleColor}
                  onPress={() =>
                    router.push({
                      pathname: '/artists/[id]',
                      params: { id: artist.id },
                    })
                  }
                  onLayout={index === 0 ? onRowLayout : undefined}
                />
              );
            }}
          />
        )}
      </ListCard>
    </TabScreen>
  );
}
