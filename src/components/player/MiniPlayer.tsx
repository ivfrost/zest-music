import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAudioProgress } from '@/hooks/useAudio';

type MiniPlayerProps = {
  title: string;
  artist: string;
  artworkUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  hasTrack: boolean;
  durationSeconds: number;
  onToggle: () => void;
  onSearch: () => void;
  onExpand?: () => void;
  iconColor: string;
  rippleColor: string;
};

/** Isolated so position ticks do not re-render the bar's controls. */
function PlaybackProgress({ durationSeconds }: { durationSeconds: number }) {
  const { positionSeconds } = useAudioProgress();
  const fraction =
    durationSeconds > 0
      ? Math.min(1, Math.max(0, positionSeconds / durationSeconds))
      : 0;
  const animatedFraction = useSharedValue(fraction);
  const lastTickAt = useRef(0);

  useEffect(() => {
    const now = Date.now();
    // Native ticks are coarse. Spread each new position across the time between
    // previous ticks, so the bar creeps instead of jumping.
    const elapsed = lastTickAt.current ? now - lastTickAt.current : 500;
    lastTickAt.current = now;

    if (fraction < animatedFraction.value) {
      // A new track or a backwards seek: rewind immediately.
      animatedFraction.value = fraction;
      return;
    }

    animatedFraction.value = withTiming(fraction, {
      duration: Math.min(1000, Math.max(250, elapsed)),
      easing: Easing.linear,
    });
  }, [animatedFraction, fraction]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${animatedFraction.value * 100}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Playback progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      className="absolute top-0.5 left-4 right-4 h-0.5 overflow-hidden rounded-md3-full bg-outline-variant"
    >
      <Animated.View
        className="h-full rounded-md3-full bg-primary"
        style={fillStyle}
      />
    </View>
  );
}

export function MiniPlayerContent({
  title,
  artist,
  artworkUri,
  isPlaying,
  isLoading,
  hasTrack,
  durationSeconds,
  onToggle,
  onSearch,
  onExpand,
  iconColor,
  rippleColor,
}: MiniPlayerProps) {
  const trackLabel = (
    <View className="flex-1 flex-row items-center">
      <View className="mr-3 h-12 w-12 items-center justify-center overflow-hidden rounded-md3-sm">
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
      {hasTrack ? <PlaybackProgress durationSeconds={durationSeconds} /> : null}
    </View>
  );
}

export function MiniPlayer(props: MiniPlayerProps) {
  return (
    <View className="mb-1 h-16 overflow-hidden rounded-md3-lg bg-surface-container-high">
      <MiniPlayerContent {...props} />
    </View>
  );
}
