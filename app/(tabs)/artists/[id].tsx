import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlbumRow } from '@/components/AlbumRow';
import { useArtistImages } from '@/hooks/useArtistImages';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { usePreferences } from '@/hooks/usePreferences';
import { setAlbumFilter } from '@/lib/albumFilter';
import { artistImageUrl } from '@/lib/artistImages';
import { imageSource } from '@/lib/http';
import { MINI_PLAYER_CLEARANCE } from '@/lib/layout';
import { artistImageSource } from '@/lib/preferences';

const HERO_HEIGHT = 280;

export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { artists, songs, releaseById } = useMusicLocations();
  const { vars: themeVars, colors } = useMaterialTheme();
  const { preferences } = usePreferences();
  const { currentUri } = useAudio();
  const insets = useSafeAreaInsets();
  const artist = artists.find(candidate => candidate.id === id);

  const artistList = useMemo(() => (artist ? [artist] : []), [artist]);
  const artistImages = useArtistImages(
    artistList,
    artistImageSource(preferences),
  );
  const image = artist ? (artistImages.get(artist.id) ?? null) : null;
  const imageUri = image ? artistImageUrl(image, 'hero') : null;
  const [heroAtTop, setHeroAtTop] = useState(true);
  const heroAtTopRef = useRef(true);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const atTop = event.nativeEvent.contentOffset.y < HERO_HEIGHT;
    if (atTop !== heroAtTopRef.current) {
      heroAtTopRef.current = atTop;
      setHeroAtTop(atTop);
    }
  };

  const albums = useMemo(() => {
    if (!artist) return [];

    const stats = new Map<
      string,
      { lastPlayedAt: number; songCount: number }
    >();
    for (const song of songs) {
      if (!artist.releaseIds.includes(song.releaseId)) continue;
      const current = stats.get(song.releaseId) ?? {
        lastPlayedAt: 0,
        songCount: 0,
      };
      current.lastPlayedAt = Math.max(
        current.lastPlayedAt,
        song.lastPlayedAt ?? 0,
      );
      current.songCount += 1;
      stats.set(song.releaseId, current);
    }

    return artist.releaseIds
      .flatMap(releaseId => {
        const release = releaseById.get(releaseId);
        if (!release) return [];
        const stat = stats.get(releaseId) ?? {
          lastPlayedAt: 0,
          songCount: 0,
        };
        return [{ release, ...stat }];
      })
      .sort((a, b) => {
        const aPlayed = a.lastPlayedAt > 0;
        const bPlayed = b.lastPlayedAt > 0;
        if (aPlayed && bPlayed) return b.lastPlayedAt - a.lastPlayedAt;
        if (aPlayed) return -1;
        if (bPlayed) return 1;
        return a.release.title.localeCompare(b.release.title);
      });
  }, [artist, songs, releaseById]);

  const openAlbum = (releaseId: string) => {
    setAlbumFilter(releaseId);
    router.navigate('/songs');
  };

  return (
    <View style={[themeVars, { flex: 1 }]} className="bg-background">
      <StatusBar style={heroAtTop && imageUri ? 'light' : 'auto'} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: currentUri ? MINI_PLAYER_CLEARANCE : 24,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View
          style={{ height: insets.top + HERO_HEIGHT }}
          className="w-full overflow-hidden bg-surface-container"
        >
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
            className="items-center justify-center"
          >
            <SymbolView
              name={{ ios: 'person.fill', android: 'person', web: 'person' }}
              size={80}
              tintColor={colors.onSurfaceVariant}
            />
          </View>
          {imageUri ? (
            <Image
              accessible={false}
              source={imageSource(imageUri)}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : null}
        </View>

        <View className="px-4 pt-4">
          <Text className="text-2xl font-medium text-on-surface">
            {artist?.name ?? 'Unknown artist'}
          </Text>
          <Text className="mt-1 text-sm text-on-surface-variant opacity-70">
            {albums.length === 1 ? '1 album' : `${albums.length} albums`}
          </Text>
        </View>

        {albums.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-4 px-4 py-3"
          >
            {albums.map(album => (
              <AlbumRow
                key={album.release.id}
                title={album.release.title}
                subtitle={`${album.songCount} ${
                  album.songCount === 1 ? 'song' : 'songs'
                }`}
                artworkUri={album.release.artworkUri}
                iconColor={colors.onSurfaceVariant}
                onPress={() => openAlbum(album.release.id)}
              />
            ))}
          </ScrollView>
        ) : (
          <Text className="px-4 py-6 text-on-surface-variant">No albums</Text>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 16,
          zIndex: 10,
        }}
        className="overflow-hidden rounded-full"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          android_ripple={{
            color: 'rgba(255, 255, 255, 0.25)',
            borderless: true,
          }}
          className="h-10 w-10 items-center justify-center bg-black/40"
        >
          <SymbolView
            name={{
              ios: 'chevron.left',
              android: 'arrow_back',
              web: 'arrow_back',
            }}
            size={22}
            tintColor="#FFFFFF"
          />
        </Pressable>
      </View>
    </View>
  );
}
