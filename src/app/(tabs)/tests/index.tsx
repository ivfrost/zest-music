import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import { Redirect, useFocusEffect, usePathname } from 'expo-router';
import { useContext } from 'react';
import { Button, ScrollView } from 'react-native';
import { TabScreen } from '@/components/TabScreen';
import { TabBarContext } from '@/context/TabBarContext';
import { useAudio } from '@/hooks/useAudio';
import useMusicLocations from '@/hooks/useMusicLocation';

export default function AudioTest() {
  // The route still ships in release builds; keep it unreachable there.
  if (!__DEV__) return <Redirect href="/" />;

  const { playTrack } = useAudio();
  const { songs } = useMusicLocations();
  const currentRoute = usePathname();
  const { setIsTabBarHidden } = useContext(TabBarContext);

  useFocusEffect(() => {
    setIsTabBarHidden(true);
    return () => setIsTabBarHidden(false);
  });

  async function pickAndPlayFlac() {
    try {
      const [file] = await pick({ type: [types.audio] });

      if (!file) return;

      if (!file.name?.toLowerCase().endsWith('.flac')) {
        console.warn('Please select a .flac file.');
        return;
      }

      await playTrack(file.uri, {
        currentRoute,
        queue: [file.uri],
      });
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }

      console.error('Could not pick or play the file:', error);
    }
  }

  return (
    <TabScreen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 pb-40 pt-4"
      >
        <Button title="Pick and play a FLAC file" onPress={pickAndPlayFlac} />
      </ScrollView>
    </TabScreen>
  );
}
