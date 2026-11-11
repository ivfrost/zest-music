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
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { setAlbumFilter } from '@/lib/albumFilter';
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
  const { colors, vars: themeVars, rippleColor, dividerColor } =
    useMaterialTheme();
  const renderSeparator = useRowSeparator(dividerColor, 88);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const searchInputRef = useRef<TextInputInstance>(null);

  const normalized = query.trim().toLowerCase();

  const songResults = useMemo(() => {
    if (!normalized) return [];
    return songs.filter(song => {
      if (song.title.toLowerCase().includes(normalized)) return true;
      const { artist } = getSongDisplayInfo(song, artistNameById);
      return artist.toLowerCase().includes(normalized);
    });
  }, [songs, artistNameById, normalized]);

  const artistResults = useMemo(() => {
    if (!normalized) return [];
    return artists.filter(artist =>
      artist.name.toLowerCase().includes(normalized),
    );
  }, [artists, normalized]);

  const albumResults = useMemo(() => {
    if (!normalized) return [];
    return releases.filter(release =>
      release.title.toLowerCase().includes(normalized),
    );
  }, [releases, normalized]);

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
      onShow={() => searchInputRef.current?.focus()}
    >
      <View style={[themeVars, { flex: 1 }]}>
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            <View className="flex-row items-center gap-2 px-4 py-3">
              <View className="flex-1 flex-row items-center gap-2 rounded-full bg-surface-container px-4 py-2">
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
                  autoFocus
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search your library"
                  placeholderTextColor={colors.onSurfaceVariant}
                  returnKeyType="search"
                  className="flex-1 text-base text-on-surface"
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
              <View className="overflow-hidden rounded-full">
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
                  <View key={option.value} className="flex-1 overflow-hidden rounded-full">
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => setScope(option.value)}
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
                        {option.label}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {scope === 'songs' ? (
              <FlatList<Song>
                data={songResults}
                keyExtractor={song => song.uri}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="py-2"
                ItemSeparatorComponent={renderSeparator}
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
                data={artistResults}
                keyExtractor={artist => artist.id}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="py-2"
                ItemSeparatorComponent={renderSeparator}
                ListEmptyComponent={
                  <Text className="p-6 text-center text-on-surface-variant">
                    {emptyMessage}
                  </Text>
                }
                renderItem={({ item: artist }) => (
                  <ArtistRow
                    name={artist.name}
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
                )}
              />
            ) : (
              <FlatList<ReleaseSummary>
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
                    icon={{ ios: 'square.stack', android: 'album', web: 'album' }}
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
