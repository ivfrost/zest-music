import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ArtistRow } from '@/components/ArtistRow';
import { FilterDropdown } from '@/components/FilterDropdown';
import { useRowSeparator } from '@/components/RowSeparator';
import { TabMenuButton } from '@/components/TabMenuButton';
import { TabScreen } from '@/components/TabScreen';
import { useArtistImages } from '@/hooks/useArtistImages';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { usePreferences } from '@/hooks/usePreferences';
import { artistImageUrl } from '@/lib/artistImages';
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
  const lists = useMemo(() => {
    const recent = artists
      .filter(
        artist => (artistPlaybackById.get(artist.id)?.lastPlayedAt ?? 0) > 0,
      )
      .sort((a, b) => {
        const byPlayedAt =
          (artistPlaybackById.get(b.id)?.lastPlayedAt ?? 0) -
          (artistPlaybackById.get(a.id)?.lastPlayedAt ?? 0);
        return byPlayedAt || a.name.localeCompare(b.name);
      });
    const most = artists
      .filter(artist => (artistPlaybackById.get(artist.id)?.playCount ?? 0) > 0)
      .sort((a, b) => {
        const statsA = artistPlaybackById.get(a.id);
        const statsB = artistPlaybackById.get(b.id);
        return (
          (statsB?.playCount ?? 0) - (statsA?.playCount ?? 0) ||
          (statsB?.lastPlayedAt ?? 0) - (statsA?.lastPlayedAt ?? 0) ||
          a.name.localeCompare(b.name)
        );
      });
    return { all: artists, recent, most };
  }, [artists, artistPlaybackById]);
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
  const artistImages = useArtistImages(artists, artistImageSource(preferences));
  const renderSeparator = useRowSeparator(dividerColor, 88);

  const listRef = useRef<FlatList<Artist>>(null);

  return (
    <TabScreen>
      <View className="flex-1">
        <View className="h-12 flex-row items-center gap-2">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="text-title-large font-medium text-on-surface"
          >
            Artists
          </Text>
          <View className="flex-1" />
          <FilterDropdown
            label={MODE_LABELS[mode]}
            options={MODE_OPTIONS}
            selectedIndex={MODES.indexOf(mode)}
            onSelect={index => {
              const next = MODES[index];
              if (next) setMode(next);
            }}
            accessibilityLabel="Filter artists"
          />
          <TabMenuButton />
        </View>

        <View className="mt-3 max-h-full shrink overflow-hidden rounded-md3-xl bg-surface-container-low">
          <FlatList
            ref={listRef}
            data={visibleArtists}
            keyExtractor={artist => artist.id}
            extraData={`${currentUri}|${isPlaying}|${isLoading}`}
            className="shrink"
            contentContainerStyle={{
              paddingTop: spacing.xs,
              paddingBottom: spacing.sm,
            }}
            ItemSeparatorComponent={renderSeparator}
            ListEmptyComponent={
              <Text className="p-6 text-center text-on-surface-variant">
                {emptyMessage}
              </Text>
            }
            renderItem={({ item: artist }) => {
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
                />
              );
            }}
          />
        </View>
      </View>
    </TabScreen>
  );
}
