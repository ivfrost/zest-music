import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ICON_SIZES } from '@/hooks/materialPalette';
import { imageSource } from '@/lib/http';

type RowIcon = ComponentProps<typeof SymbolView>['name'];

type RowProps = {
  title: string;
  subtitle?: string;
  artworkUri?: string | null;
  icon: RowIcon;
  onPress: () => void;
  onLongPress?: () => void;
  iconColor: string;
  rippleColor: string;
  trailing?: ReactNode;
  showChevron?: boolean;
};

export function Row({
  title,
  subtitle,
  artworkUri,
  icon,
  onPress,
  onLongPress,
  iconColor,
  rippleColor,
  trailing,
  showChevron = false,
}: RowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      onLongPress={onLongPress}
      unstable_pressDelay={80}
      android_ripple={{ color: rippleColor }}
      className="flex-row items-center gap-4 px-4 py-2"
    >
      <View className="h-14 w-14 overflow-hidden rounded-md3-sm bg-surface-variant">
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
              name={icon}
              size={ICON_SIZES.large}
              tintColor={iconColor}
            />
          </View>
        )}
      </View>

      <View className="flex-1">
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          className="text-body-large text-on-surface"
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
      </View>

      {trailing}

      {showChevron ? (
        <SymbolView
          name={{
            ios: 'chevron.right',
            android: 'chevron_right',
            web: 'chevron_right',
          }}
          size={ICON_SIZES.small}
          tintColor={iconColor}
        />
      ) : null}
    </Pressable>
  );
}
