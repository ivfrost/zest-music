import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createQueueFromSongList,
  getSongDisplayInfo,
} from '@/audio/trackHelpers';
import { ArtistRow } from '@/components/ArtistRow';
import { Row } from '@/components/Row';
import { useRowSeparator } from '@/components/RowSeparator';
import { SongRow } from '@/components/SongRow';
import { useArtistImages } from '@/hooks/useArtistImages';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { usePreferences } from '@/hooks/usePreferences';
import { setAlbumFilter } from '@/lib/albumFilter';
import { artistImageUrl } from '@/lib/artistImages';
import { usePlayStats } from '@/lib/playStats';
import { artistImageSource } from '@/lib/preferences';
import { foldForSearch } from '@/lib/search';
import type { Artist } from '@/types/artists';
import type { ReleaseSummary } from '@/types/releases';
import type { Song } from '@/types/songs';

type SearchScope = 'songs' | 'artists' | 'albums';

const SCOPES: { value: SearchScope; label: string }[] = [
  { value: 'artists', label: 'Artists' },
  { value: 'songs', label: 'Songs' },
  { value: 'albums', label: 'Albums' },
];

type SearchOverlayProps = {
  initialScope: SearchScope;
  onClose: () => void;
};

export function SearchOverlay({ initialScope, onClose }: SearchOverlayProps) {
  const { songs, artists, releases, releaseById, artistNameById } =
    useMusicLocations();
  const { playTrack } = useAudio();
  const currentRoute = usePathname();
  const {
    colors,
    vars: themeVars,
    rippleColor,
    dividerColor,
  } = useMaterialTheme();
  const renderSeparator = useRowSeparator(dividerColor, 88);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const searchInputRef = useRef<TextInputInstance>(null);
  const played = usePlayStats();

  const normalized = foldForSearch(query.trim());

  // Search has its own order: favorites first, independent of the Songs tab's sort.
  const songPlayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of songs) {
      counts.set(
        song.uri,
        song.playCount + (played.increments[song.uri] ?? 0),
      );
    }
    return counts;
  }, [songs, played.increments]);

  const albumPlayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of songs) {
      counts.set(
        song.releaseId,
        (counts.get(song.releaseId) ?? 0) +
          (songPlayCounts.get(song.uri) ?? 0),
      );
    }
    return counts;
  }, [songs, songPlayCounts]);

  const artistPlayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of songs) {
      const songCount = songPlayCounts.get(song.uri) ?? 0;
      for (const artistId of song.artistIds) {
        counts.set(artistId, (counts.get(artistId) ?? 0) + songCount);
      }
    }
    return counts;
  }, [songs, songPlayCounts]);

  const songResults = useMemo(() => {
    if (!normalized) return [];
    return songs
      .filter(song => {
        if (foldForSearch(song.title).includes(normalized)) return true;
        const { artist } = getSongDisplayInfo(song, artistNameById);
        return foldForSearch(artist).includes(normalized);
      })
      .sort(
        (a, b) =>
          (songPlayCounts.get(b.uri) ?? 0) - (songPlayCounts.get(a.uri) ?? 0),
      );
  }, [songs, artistNameById, normalized, songPlayCounts]);

  const artistResults = useMemo(() => {
    if (!normalized) return [];
    return artists
      .filter(artist => foldForSearch(artist.name).includes(normalized))
      .sort(
        (a, b) =>
          (artistPlayCounts.get(b.id) ?? 0) -
          (artistPlayCounts.get(a.id) ?? 0),
      );
  }, [artists, normalized, artistPlayCounts]);

  const albumResults = useMemo(() => {
    if (!normalized) return [];
    return releases
      .filter(release => foldForSearch(release.title).includes(normalized))
      .sort(
        (a, b) =>
          (albumPlayCounts.get(b.id) ?? 0) -
          (albumPlayCounts.get(a.id) ?? 0),
      );
  }, [releases, normalized, albumPlayCounts]);

  const { preferences } = usePreferences();
  const [visibleArtistIds, setVisibleArtistIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 0 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { item: Artist }[] }) => {
      setVisibleArtistIds(new Set(viewableItems.map(({ item }) => item.id)));
    },
  ).current;
  // Only rows on screen ask MusicBrainz for a photo.
  const artistImages = useArtistImages(
    scope === 'artists' ? artistResults : [],
    artistImageSource(preferences),
    visibleArtistIds,
  );

  const closeAnd = (action: () => void) => {
    onClose();
    action();
  };

  const emptyMessage = normalized
    ? 'No results'
    : 'Type to search your library';

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }}
    >
      <View style={[themeVars, { flex: 1 }]}>
        <SafeAreaView
          edges={['top', 'bottom']}
          className="flex-1 bg-background"
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            <View className="flex-row items-center gap-2 px-4 py-3">
              <View className="flex-1 flex-row items-center gap-2 rounded-md3-full bg-surface-container px-4 py-2">
                <SymbolView
                  name={{
                    ios: 'magnifyingglass',
                    android: 'search',
                    web: 'search',
                  }}
                  size={20}
                  tintColor={colors.onSurfaceVariant}
                />
                <TextInput
                  ref={searchInputRef}
                  showSoftInputOnFocus
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search your library"
                  placeholderTextColor={colors.onSurfaceVariant}
                  returnKeyType="search"
                  className="flex-1 text-body-large text-on-surface"
                />
                {query ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    onPress={() => setQuery('')}
                    hitSlop={8}
                  >
                    <SymbolView
                      name={{
                        ios: 'xmark.circle.fill',
                        android: 'close',
                        web: 'close',
                      }}
                      size={18}
                      tintColor={colors.onSurfaceVariant}
                    />
                  </Pressable>
                ) : null}
              </View>
              <View className="overflow-hidden rounded-md3-full">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close search"
                  onPress={onClose}
                  android_ripple={{ color: rippleColor, borderless: true }}
                  hitSlop={8}
                  className="p-2"
                >
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={22}
                    tintColor={colors.onSurface}
                  />
                </Pressable>
              </View>
            </View>

            <View className="flex-row gap-1 px-4 pb-2">
              {SCOPES.map(option => {
                const selected = scope === option.value;
                return (
                  <View
                    key={option.value}
                    className="flex-1 overflow-hidden rounded-md3-full"
                  >
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => setScope(option.value)}
                      android_ripple={{ color: rippleColor, borderless: true }}
                      className={`items-center py-2 ${selected ? 'bg-primary-container' : ''}`}
                    >
                      <Text
                        numberOfLines={1}
                        className={`text-body-medium font-medium ${
                          selected
                            ? 'text-on-primary-container'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {scope === 'songs' ? (
              <FlatList<Song>
                key="songs"
                data={songResults}
                keyExtractor={song => song.uri}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="py-2"
                ItemSeparatorComponent={renderSeparator}
                ListHeaderComponent={
                  songResults.length > 0 ? (
                    <View className="flex-row items-center py-1 pl-4 pr-1">
                      <Text className="flex-1 text-body-medium text-on-surface-variant">
                        {songResults.length} songs
                      </Text>
                      <View className="overflow-hidden rounded-md3-full">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Shuffle all, ${songResults.length} songs`}
                          onPress={() => {
                            const firstSong = songResults[0];
                            if (!firstSong) return;
                            closeAnd(() => {
                              void playTrack(
                                firstSong.uri,
                                {
                                  currentRoute,
                                  label: 'Search results',
                                  queue: createQueueFromSongList(
                                    songResults,
                                    firstSong.uri,
                                  ),
                                },
                                { shuffle: true },
                              );
                            });
                          }}
                          android_ripple={{
                            color: rippleColor,
                            borderless: true,
                          }}
                          className="h-12 w-12 items-center justify-center"
                        >
                          <SymbolView
                            name={{
                              ios: 'shuffle',
                              android: 'shuffle',
                              web: 'shuffle',
                            }}
                            size={20}
                            tintColor={colors.onSurfaceVariant}
                          />
                        </Pressable>
                      </View>
                      <View className="overflow-hidden rounded-md3-full">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Play all, ${songResults.length} songs`}
                          onPress={() => {
                            const firstSong = songResults[0];
                            if (!firstSong) return;
                            closeAnd(() => {
                              void playTrack(firstSong.uri, {
                                currentRoute,
                                label: 'Search results',
                                queue: createQueueFromSongList(
                                  songResults,
                                  firstSong.uri,
                                ),
                              });
                            });
                          }}
                          android_ripple={{
                            color: rippleColor,
                            borderless: true,
                          }}
                          className="h-12 w-12 items-center justify-center"
                        >
                          <SymbolView
                            name={{
                              ios: 'play.fill',
                              android: 'play_arrow',
                              web: 'play_arrow',
                            }}
                            size={24}
                            tintColor={colors.onSurfaceVariant}
                          />
                        </Pressable>
                      </View>
                    </View>
                  ) : undefined
                }
                ListEmptyComponent={
                  <Text className="p-6 text-center text-on-surface-variant">
                    {emptyMessage}
                  </Text>
                }
                renderItem={({ item: song }) => {
                  const release = releaseById.get(song.releaseId);
                  const { title, artist } = getSongDisplayInfo(
                    song,
                    artistNameById,
                  );
                  const albumTitle =
                    release && release.title !== song.title
                      ? release.title
                      : null;
                  const subtitle = [albumTitle, artist || 'Unknown Artist']
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
                        closeAnd(() => {
                          void playTrack(song.uri, {
                            currentRoute,
                            label: 'Search results',
                            queue: createQueueFromSongList(
                              songResults,
                              song.uri,
                            ),
                          });
                        })
                      }
                    />
                  );
                }}
              />
            ) : scope === 'artists' ? (
              <FlatList<Artist>
                key="artists"
                data={artistResults}
                keyExtractor={artist => artist.id}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="py-2"
                ItemSeparatorComponent={renderSeparator}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                ListEmptyComponent={
                  <Text className="p-6 text-center text-on-surface-variant">
                    {emptyMessage}
                  </Text>
                }
                renderItem={({ item: artist }) => {
                  const artistImage = artistImages.get(artist.id);
                  return (
                    <ArtistRow
                      name={artist.name}
                      artworkUri={
                        artistImage
                          ? artistImageUrl(artistImage, 'thumb')
                          : null
                      }
                      iconColor={colors.onSurfaceVariant}
                      rippleColor={rippleColor}
                      onPress={() =>
                        closeAnd(() =>
                          router.push({
                            pathname: '/artists/[id]',
                            params: { id: artist.id },
                          }),
                        )
                      }
                    />
                  );
                }}
              />
            ) : (
              <FlatList<ReleaseSummary>
                key="albums"
                data={albumResults}
                keyExtractor={release => release.id}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="py-2"
                ItemSeparatorComponent={renderSeparator}
                ListEmptyComponent={
                  <Text className="p-6 text-center text-on-surface-variant">
                    {emptyMessage}
                  </Text>
                }
                renderItem={({ item: release }) => (
                  <Row
                    title={release.title}
                    artworkUri={release.artworkUri}
                    icon={{
                      ios: 'square.stack',
                      android: 'album',
                      web: 'album',
                    }}
                    iconColor={colors.onSurfaceVariant}
                    rippleColor={rippleColor}
                    showChevron
                    onPress={() =>
                      closeAnd(() => {
                        setAlbumFilter(release.id);
                        router.navigate('/songs');
                      })
                    }
                  />
                )}
              />
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
