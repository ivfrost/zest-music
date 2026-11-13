import {
  Text as ComposeText,
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';

const MENU_ICON = {
  ios: 'ellipsis',
  android: 'more_vert',
  web: 'more_vert',
} as const;

export function TabMenuButton() {
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const { colors, rippleColor } = useMaterialTheme();

  const openSettings = () => {
    setIsMenuExpanded(false);
    router.push('/(settings)/settings');
  };

  if (Platform.OS !== 'android') {
    return (
      <View className="h-12 w-12 overflow-hidden rounded-md3-full">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={openSettings}
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          className="h-full w-full items-center justify-center"
        >
          <SymbolView name={MENU_ICON} size={24} tintColor={colors.onSurface} />
        </Pressable>
      </View>
    );
  }

  return (
    <View className="h-12 w-12 overflow-hidden rounded-md3-full">
      <Host matchContents>
        <DropdownMenu
          expanded={isMenuExpanded}
          onDismissRequest={() => setIsMenuExpanded(false)}
        >
          <DropdownMenu.Trigger>
            <RNHostView matchContents>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open menu"
                onPress={() => setIsMenuExpanded(true)}
                android_ripple={{ color: rippleColor, borderless: true }}
                className="h-12 w-12 items-center justify-center"
              >
                <SymbolView
                  name={MENU_ICON}
                  size={24}
                  tintColor={colors.onSurface}
                />
              </Pressable>
            </RNHostView>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <DropdownMenuItem onClick={openSettings}>
              <DropdownMenuItem.Text>
                <ComposeText>Settings</ComposeText>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  );
}
