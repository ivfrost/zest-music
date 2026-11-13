import { type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MINI_PLAYER_CLEARANCE } from '@/lib/layout';
import { SwipeableTab } from './SwipeableTab';

export function TabScreen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();

  return (
    <SwipeableTab>
      <View
        className="bg-background flex-1 px-4"
        style={{
          paddingTop: insets.top,
          paddingBottom: MINI_PLAYER_CLEARANCE,
        }}
      >
        {children}
      </View>
    </SwipeableTab>
  );
}
