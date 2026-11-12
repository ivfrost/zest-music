import { SymbolView } from 'expo-symbols';
import { Image, Pressable, Text, View } from 'react-native';
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
      <View className="aspect-square w-36 overflow-hidden rounded-xl bg-surface-variant">
        {artworkUri ? (
          <Image
            accessible={false}
            source={imageSource(artworkUri)}
            className="h-full w-full rounded-xl"
            resizeMode="cover"
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
        className="mt-2 text-base leading-5 text-on-surface"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          className="mt-0.5 text-sm leading-5 text-on-surface-variant opacity-60"
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}
