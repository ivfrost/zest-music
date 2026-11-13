import { Text, View } from 'react-native';
import { TabScreen } from '@/components/TabScreen';
import { TabMenuButton } from '@/components/TabMenuButton';

export default function PlaylistTab() {
  return (
    <TabScreen>
      <View className="flex-row items-center justify-between">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-title-large font-medium text-on-surface"
        >
          Playlists
        </Text>
        <TabMenuButton />
      </View>
      <Text className="px-4 pt-4 text-body-large text-on-surface-variant">
        No playlists yet
      </Text>
    </TabScreen>
  );
}
