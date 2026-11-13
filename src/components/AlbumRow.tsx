import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { ICON_SIZES } from '@/hooks/materialPalette';
import { imageSource } from '@/lib/http';

type AlbumRowProps = {
  title: string;
  subtitle?: string;
  artworkUri: string | null;
  onPress: () => void;
  iconColor: string;
};

export function AlbumRow({
  title,
  subtitle,
  artworkUri,
  onPress,
  iconColor,
}: AlbumRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      unstable_pressDelay={80}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      className="w-36"
    >
      <View className="aspect-square w-36 overflow-hidden rounded-md3-md bg-surface-variant">
        {artworkUri ? (
          <Image
            accessible={false}
            source={imageSource(artworkUri)}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <SymbolView
              name={{ ios: 'square.stack', android: 'album', web: 'album' }}
              size={ICON_SIZES.large}
              tintColor={iconColor}
            />
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        className="mt-2 text-body-large text-on-surface"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          className="mt-0.5 text-body-medium text-on-surface-variant opacity-60"
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}
