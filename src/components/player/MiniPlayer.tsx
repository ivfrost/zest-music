import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';

type MiniPlayerProps = {
  title: string;
  artist: string;
  artworkUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  hasTrack: boolean;
  onToggle: () => void;
  onSearch: () => void;
  onExpand?: () => void;
  iconColor: string;
  rippleColor: string;
};

export function MiniPlayerContent({
  title,
  artist,
  artworkUri,
  isPlaying,
  isLoading,
  hasTrack,
  onToggle,
  onSearch,
  onExpand,
  iconColor,
  rippleColor,
}: MiniPlayerProps) {
  const trackLabel = (
    <View className="flex-1 flex-row items-center">
      <View className="mr-3 h-12 w-12 items-center justify-center overflow-hidden rounded-md3-sm bg-surface-container-high">
        {artworkUri ? (
          <Image
            accessible={false}
            source={{ uri: artworkUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <SymbolView
            name={{
              ios: 'music.note',
              android: 'music_note',
              web: 'music_note',
            }}
            tintColor={iconColor}
          />
        )}
      </View>
      <View className="flex-1 justify-center">
        <Text className="text-body-large text-on-surface" numberOfLines={1}>
          {title}
        </Text>
        <Text
          className="mt-0.5 text-body-medium text-on-surface-variant"
          numberOfLines={1}
        >
          {artist}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 flex-row items-center px-4">
      {onExpand && hasTrack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Expand player: ${title} by ${artist}`}
          onPress={onExpand}
          className="flex-1"
          android_ripple={{ color: rippleColor, borderless: false }}
        >
          {trackLabel}
        </Pressable>
      ) : (
        <View className="flex-1">{trackLabel}</View>
      )}
      <View className="ml-1 h-12 w-12 overflow-hidden rounded-md3-full">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search library"
          onPress={onSearch}
          className="h-full w-full items-center justify-center"
          android_ripple={{ color: rippleColor, borderless: true }}
        >
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            size={20}
            tintColor={iconColor}
          />
        </Pressable>
      </View>
      <View
        className={`h-12 w-12 overflow-hidden rounded-md3-full ${
          hasTrack ? '' : 'opacity-40'
        }`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause playback' : 'Resume playback'}
          disabled={!hasTrack || isLoading}
          onPress={onToggle}
          className="h-full w-full items-center justify-center"
          android_ripple={{ color: rippleColor, borderless: true }}
        >
          <SymbolView
            name={{
              ios: isPlaying ? 'pause.fill' : 'play.fill',
              android: isPlaying ? 'pause' : 'play_arrow',
              web: isPlaying ? 'pause' : 'play_arrow',
            }}
            tintColor={iconColor}
          />
        </Pressable>
      </View>
    </View>
  );
}

export function MiniPlayer(props: MiniPlayerProps) {
  return (
    <View className="mx-2 mb-1 h-16 overflow-hidden rounded-md3-lg bg-surface-container">
      <MiniPlayerContent {...props} />
    </View>
  );
}
