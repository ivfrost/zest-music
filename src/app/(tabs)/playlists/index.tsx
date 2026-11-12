import { Text } from 'react-native';
import { TabScreen } from '@/components/TabScreen';

export default function PlaylistTab() {
  return (
    <TabScreen>
      <Text className='px-4 pt-4 text-on-surface-variant'>
        No playlists yet
      </Text>
    </TabScreen>
  );
}
