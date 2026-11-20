import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MINI_PLAYER_CLEARANCE } from '@/lib/layout';

const SNACKBAR_DURATION_MS = 2500;

/** Carries an id so repeating the same text still restarts the timer. */
export interface SnackbarMessage {
  id: number;
  text: string;
}

type SnackbarProps = {
  message: SnackbarMessage | null;
  onDismiss: () => void;
};

/** Transient message above the mini player. Auto-dismisses. */
export function Snackbar({ message, onDismiss }: SnackbarProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(
      () => onDismissRef.current(),
      SNACKBAR_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <View className="rounded-md3-sm bg-primary-container px-4 py-3">
        <Text
          numberOfLines={2}
          className="text-body-medium text-on-primary-container"
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: MINI_PLAYER_CLEARANCE,
    alignItems: 'center',
  },
});
