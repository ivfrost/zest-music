import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useAudio } from '@/hooks/useAudio';
import { MINI_PLAYER_CLEARANCE } from '@/lib/layout';
import { SwipeableTab } from './SwipeableTab';

export function TabScreen({ children }: PropsWithChildren) {
  const { currentUri } = useAudio();

  return (
    <SwipeableTab>
      <View
        className="bg-background flex-1 px-4 pt-4"
        style={{ paddingBottom: currentUri ? MINI_PLAYER_CLEARANCE : 16 }}
      >
        {children}
      </View>
    </SwipeableTab>
  );
}
