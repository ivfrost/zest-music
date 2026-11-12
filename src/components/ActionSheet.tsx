import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarContext } from '@/context/TabBarContext';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';

/** The native bar drops instantly, so the sheet waits a beat to read as a sequence. */
const TAB_BAR_DELAY_MS = 120;
const OPEN_MS = 300;
const CLOSE_MS = 200;
/** Used only until the card has been measured. */
const DEFAULT_TRAVEL = 420;
/** Material 3 emphasized decelerate / accelerate. */
const ENTER_EASING = Easing.bezier(0.05, 0.7, 0.1, 1);
const EXIT_EASING = Easing.bezier(0.3, 0, 0.8, 0.15);

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  message?: string;
  options: readonly string[];
  onSelect: (index: number) => void;
  onCancel: () => void;
};

export function ActionSheet({
  visible,
  title,
  message,
  options,
  onSelect,
  onCancel,
}: ActionSheetProps) {
  const { colors, rippleColor } = useMaterialTheme();
  const insets = useSafeAreaInsets();
  const { setIsTabBarHidden } = useContext(TabBarContext);
  const [isMounted, setIsMounted] = useState(false);
  const [travel, setTravel] = useState(DEFAULT_TRAVEL);
  const isMountedRef = useRef(false);
  const hidBarRef = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;

  const open = useCallback(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      easing: ENTER_EASING,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (visible) {
      hidBarRef.current = true;
      setIsTabBarHidden(true);
      const timer = setTimeout(() => {
        const alreadyMounted = isMountedRef.current;
        isMountedRef.current = true;
        setIsMounted(true);
        // Reopened mid-close: the modal never left, so onShow will not fire again.
        if (alreadyMounted) open();
      }, TAB_BAR_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // Nothing was opened by us, and the bar belongs to the focused screen.
    if (!hidBarRef.current) return;

    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: EXIT_EASING,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      isMountedRef.current = false;
      hidBarRef.current = false;
      setIsMounted(false);
      setIsTabBarHidden(false);
    });
  }, [visible, open, progress, setIsTabBarHidden]);

  useEffect(
    () => () => {
      if (hidBarRef.current) setIsTabBarHidden(false);
    },
    [setIsTabBarHidden],
  );

  useEffect(() => {
    if (!visible) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onCancel();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, onCancel]);

  if (!isMounted) return null;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
      onShow={open}
    >
      <View className="flex-1 justify-end">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#000000',
              opacity: progress.interpolate({
                inputRange: [0, 0.7, 1],
                outputRange: [0, 0.4, 0.4],
              }),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={onCancel}
            className="flex-1"
          />
        </Animated.View>

        <Animated.View
          onLayout={event => setTravel(event.nativeEvent.layout.height)}
          style={{
            paddingBottom: insets.bottom + 12,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [travel, 0],
                }),
              },
            ],
          }}
          className="px-3"
        >
          <View className="overflow-hidden rounded-3xl bg-surface-container-low">
            {title || message ? (
              <View className="bg-surface-container px-5 pb-4 pt-5">
                {title ? (
                  <Text
                    className="text-base font-medium text-on-surface"
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                ) : null}
                {message ? (
                  <Text
                    className="mt-1 text-sm text-on-surface-variant opacity-70"
                    numberOfLines={1}
                  >
                    {message}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {options.map((option, index) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={option}
                onPress={() => onSelect(index)}
                android_ripple={{ color: rippleColor }}
                unstable_pressDelay={0}
                className="h-14 justify-center px-5"
              >
                <Text className="text-base text-on-surface">{option}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
