import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { ArtistRow } from '@/components/ArtistRow';
import { useRowSeparator } from '@/components/RowSeparator';
import { TabScreen } from '@/components/TabScreen';
import { useArtistImages } from '@/hooks/useArtistImages';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { usePreferences } from '@/hooks/usePreferences';
import { artistImageUrl } from '@/lib/artistImages';
import { artistImageSource } from '@/lib/preferences';

export default function ArtistTab() {
  const { artists, songs } = useMusicLocations();
  const songCountByArtist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of songs) {
      for (const artistId of song.artistIds) {
        counts.set(artistId, (counts.get(artistId) ?? 0) + 1);
      }
    }
    return counts;
  }, [songs]);
  const { currentUri, isPlaying, isLoading } = useAudio();
  const { colors, rippleColor, dividerColor } = useMaterialTheme();
  const { preferences } = usePreferences();
  const artistImages = useArtistImages(artists, artistImageSource(preferences));
  const renderSeparator = useRowSeparator(dividerColor, 88);

  return (
    <TabScreen>
      <View className="max-h-full overflow-hidden rounded-3xl bg-surface-container">
        <FlatList
          data={artists}
          keyExtractor={artist => artist.id}
          extraData={`${currentUri}|${isPlaying}|${isLoading}`}
          className="grow-0"
          contentContainerClassName="py-2"
          ItemSeparatorComponent={renderSeparator}
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
    </TabScreen>
  );
}
