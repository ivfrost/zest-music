import { type ReactNode, useEffect } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type CenteredDialogProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Card centered over the screen. Children size the card. Pass a scrollable child
 * to let long content scroll inside the card's height cap.
 */
export function CenteredDialog({
  visible,
  title,
  onClose,
  children,
}: CenteredDialogProps) {
  useEffect(() => {
    if (!visible) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 items-center justify-center px-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={onClose}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
          />

          <View
            className="w-full overflow-hidden rounded-md3-xl bg-surface-container-high"
            style={styles.card}
          >
            <Text
              numberOfLines={1}
              className="px-5 pb-2 pt-5 text-title-medium font-medium text-on-surface"
            >
              {title}
            </Text>
            <View style={styles.body}>{children}</View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  card: { maxWidth: 420, maxHeight: '80%' },
  body: { flexShrink: 1 },
});
