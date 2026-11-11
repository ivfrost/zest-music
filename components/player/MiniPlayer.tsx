import { SymbolView } from 'expo-symbols';
import { Image, Pressable, Text, View } from 'react-native';

type MiniPlayerProps = {
  title: string;
  artist: string;
  artworkUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  onToggle: () => void;
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
  onToggle,
  onExpand,
  iconColor,
  rippleColor,
}: MiniPlayerProps) {
  const trackLabel = (
    <View className="flex-1 flex-row items-center">
      <View className="mr-3 h-11 w-11 items-center justify-center overflow-hidden bg-surface-container-high">
        {artworkUri ? (
          <Image
            accessible={false}
            source={{ uri: artworkUri }}
            className="h-full w-full"
            resizeMode="cover"
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
        <Text className="text-base leading-5 text-on-surface" numberOfLines={1}>
          {title}
        </Text>
        <Text
          className="mt-0.5 text-sm leading-5 text-on-surface-variant opacity-60"
          numberOfLines={1}
        >
          {artist}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 flex-row items-center px-4">
      {onExpand ? (
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
        trackLabel
      )}
      <View className="ml-3 h-10 w-10 overflow-hidden rounded-full">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause playback' : 'Resume playback'}
          disabled={isLoading}
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
    <View
      style={{ borderRadius: 20 }}
      className="mx-3 mb-2 h-16 overflow-hidden bg-surface-container"
    >
      <MiniPlayerContent {...props} />
    </View>
  );
}
