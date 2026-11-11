import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { ICON_SIZES } from '@/hooks/materialPalette';
import type { useMaterialTheme } from '@/hooks/useMaterialTheme';
import type { RepeatMode } from '@/types/playback';

type MaterialColors = ReturnType<typeof useMaterialTheme>['colors'];

const QUEUE_HANDLE_HEIGHT = 68;
const QUEUE_PEEK_HEIGHT = 280;
type QueueLevel = 'closed' | 'peek' | 'full';

type QueueTrack = {
  queueIndex: number;
  uri: string;
  title: string;
  artist: string;
  artworkUri: string | null;
  durationSeconds: number | null;
};

type FullPlayerProps = {
  isExpanded: boolean;
  title: string;
  artist: string;
  artworkUri: string | null;
  trackKey: string | null;
  artworkSize: number;
  isPlaying: boolean;
  isLoading: boolean;
  isShuffling: boolean;
  repeatMode: RepeatMode;
  positionSeconds: number;
  durationSeconds: number;
  onShuffle: () => void;
  onLoop: () => void;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
  queueTracks: QueueTrack[];
  onSelectQueueTrack: (index: number) => void;
  colors: MaterialColors;
  rippleColor: string;
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const paddedSeconds = String(remainingSeconds).padStart(2, '0');

  return hours > 0
    ? `${hours}:${String(remainingMinutes).padStart(2, '0')}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

function SeekBar({
  positionSeconds,
  durationSeconds,
  onSeek,
  colors,
}: Pick<
  FullPlayerProps,
  'positionSeconds' | 'durationSeconds' | 'onSeek' | 'colors'
>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [draftFraction, setDraftFraction] = useState<number | null>(null);
  const widthRef = useRef(0);
  const durationRef = useRef(durationSeconds);
  const onSeekRef = useRef(onSeek);
  const startFraction = useRef(0);
  const latestFraction = useRef(0);
  const latestGestureDx = useRef(0);
  const fineStartFraction = useRef(0);
  const fineStartGestureDx = useRef(0);
  const fineScrubbingRef = useRef(false);
  const pendingSeekFraction = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress =
    durationSeconds > 0
      ? Math.min(1, Math.max(0, positionSeconds / durationSeconds))
      : 0;
  const displayedFraction = draftFraction ?? progress;

  widthRef.current = trackWidth;
  durationRef.current = durationSeconds;
  onSeekRef.current = onSeek;

  const clearHoldTimer = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => {
    if (pendingSeekFraction.current === null) return;

    if (durationSeconds <= 0) {
      pendingSeekFraction.current = null;
      setDraftFraction(null);
      return;
    }

    const targetSeconds = pendingSeekFraction.current * durationSeconds;
    if (Math.abs(positionSeconds - targetSeconds) <= 0.75) {
      pendingSeekFraction.current = null;
      if (pendingSeekTimer.current) clearTimeout(pendingSeekTimer.current);
      pendingSeekTimer.current = null;
      setDraftFraction(null);
    }
  }, [durationSeconds, positionSeconds]);

  useEffect(
    () => () => {
      clearHoldTimer();
      if (pendingSeekTimer.current) clearTimeout(pendingSeekTimer.current);
    },
    [],
  );

  const clampFraction = (fraction: number) =>
    Math.min(1, Math.max(0, fraction));
  const scheduleFineScrub = () => {
    clearHoldTimer();
    holdTimer.current = setTimeout(() => {
      fineStartFraction.current = latestFraction.current;
      fineStartGestureDx.current = latestGestureDx.current;
      fineScrubbingRef.current = true;
    }, 400);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => durationRef.current > 0,
        onMoveShouldSetPanResponderCapture: () => durationRef.current > 0,
        onStartShouldSetPanResponder: () => durationRef.current > 0,
        onMoveShouldSetPanResponder: () => durationRef.current > 0,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: event => {
          pendingSeekFraction.current = null;
          if (pendingSeekTimer.current) clearTimeout(pendingSeekTimer.current);
          pendingSeekTimer.current = null;
          const fraction = clampFraction(
            event.nativeEvent.locationX / Math.max(1, widthRef.current),
          );
          startFraction.current = fraction;
          latestFraction.current = fraction;
          latestGestureDx.current = 0;
          fineScrubbingRef.current = false;
          setDraftFraction(fraction);
          scheduleFineScrub();
        },
        onPanResponderMove: (_event, gesture) => {
          latestGestureDx.current = gesture.dx;
          const rawFraction = clampFraction(
            fineScrubbingRef.current
              ? fineStartFraction.current +
                  ((gesture.dx - fineStartGestureDx.current) * 0.18) /
                    Math.max(1, widthRef.current)
              : startFraction.current +
                  gesture.dx / Math.max(1, widthRef.current),
          );
          const fraction = fineScrubbingRef.current
            ? clampFraction(
                Math.round(rawFraction * durationRef.current) /
                  Math.max(1, durationRef.current),
              )
            : rawFraction;
          latestFraction.current = fraction;
          setDraftFraction(fraction);
          scheduleFineScrub();
        },
        onPanResponderRelease: (_event, gesture) => {
          clearHoldTimer();
          const fraction = fineScrubbingRef.current
            ? clampFraction(
                Math.round(latestFraction.current * durationRef.current) /
                  Math.max(1, durationRef.current),
              )
            : latestFraction.current;
          pendingSeekFraction.current = fraction;
          setDraftFraction(fraction);
          onSeekRef.current(fraction * durationRef.current);
          fineScrubbingRef.current = false;
          if (pendingSeekTimer.current) clearTimeout(pendingSeekTimer.current);
          pendingSeekTimer.current = setTimeout(() => {
            pendingSeekFraction.current = null;
            pendingSeekTimer.current = null;
            setDraftFraction(null);
          }, 2500);
        },
        onPanResponderTerminate: () => {
          clearHoldTimer();
          fineScrubbingRef.current = false;
          pendingSeekFraction.current = null;
          if (pendingSeekTimer.current) clearTimeout(pendingSeekTimer.current);
          pendingSeekTimer.current = null;
          setDraftFraction(null);
        },
      }),
    [],
  );

  const seekBy = (delta: number) => {
    onSeek(Math.min(durationSeconds, Math.max(0, positionSeconds + delta)));
  };

  return (
    <View className="mx-4 mt-7" style={{ alignSelf: 'stretch' }}>
      <View
        {...panResponder.panHandlers}
        hitSlop={{ top: 18, bottom: 18, left: 8, right: 8 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{
          min: 0,
          max: Math.max(0, durationSeconds),
          now: Math.min(
            draftFraction === null
              ? positionSeconds
              : draftFraction * durationSeconds,
            durationSeconds,
          ),
          text: `${formatTime(
            draftFraction === null
              ? positionSeconds
              : draftFraction * durationSeconds,
          )} of ${formatTime(durationSeconds)}`,
        }}
        accessibilityActions={[
          { name: 'increment', label: 'Seek forward 10 seconds' },
          { name: 'decrement', label: 'Seek back 10 seconds' },
        ]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'increment') seekBy(10);
          if (event.nativeEvent.actionName === 'decrement') seekBy(-10);
        }}
        onLayout={event => {
          const width = event.nativeEvent.layout.width;
          widthRef.current = width;
          setTrackWidth(width);
        }}
        className="h-8 justify-end"
      >
        <View
          className="absolute left-0 right-0 h-1.5 overflow-hidden rounded-full"
          style={{
            top: '50%',
            transform: [{ translateY: -3 }],
            backgroundColor: colors.surfaceContainerHigh,
          }}
        >
          <View
            className="h-full rounded-full"
            style={{
              width: `${displayedFraction * 100}%`,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <View
          className="absolute h-3.5 w-3.5 rounded-full"
          style={{
            top: '50%',
            left: `${displayedFraction * 100}%`,
            transform: [{ translateY: -6 }],
            marginLeft: -7,
            backgroundColor: colors.primary,
            opacity: durationSeconds > 0 ? 1 : 0,
          }}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-on-surface-variant">
          {formatTime(
            draftFraction === null
              ? positionSeconds
              : displayedFraction * durationSeconds,
          )}
        </Text>
        <Text className="text-xs text-on-surface-variant">
          {formatTime(durationSeconds)}
        </Text>
      </View>
    </View>
  );
}

export function FullPlayer({
  isExpanded,
  title,
  artist,
  artworkUri,
  trackKey,
  artworkSize,
  isPlaying,
  isLoading,
  isShuffling,
  repeatMode,
  positionSeconds,
  durationSeconds,
  onShuffle,
  onLoop,
  onPrevious,
  onToggle,
  onNext,
  onSeek,
  queueTracks,
  onSelectQueueTrack,
  colors,
  rippleColor,
}: FullPlayerProps) {
  const [queueSheetLevel, setQueueSheetLevel] = useState<QueueLevel>('closed');
  const [isQueueDragging, setIsQueueDragging] = useState(false);
  // The list only mounts while the sheet is open, so a collapsed sheet can
  // never show a row even if a transform fails to apply.
  const isQueueOpen = queueSheetLevel !== 'closed' || isQueueDragging;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Sized from the window, not onLayout: the player container is 64px tall while
  // collapsed and gets re-measured throughout the expand animation.
  const queueSheetHeight = Math.max(
    QUEUE_HANDLE_HEIGHT,
    windowHeight - insets.top - insets.bottom,
  );
  const queueOffsetFor = useCallback(
    (level: QueueLevel) =>
      level === 'full'
        ? 0
        : level === 'peek'
          ? Math.max(0, queueSheetHeight - QUEUE_PEEK_HEIGHT)
          : Math.max(0, queueSheetHeight - QUEUE_HANDLE_HEIGHT),
    [queueSheetHeight],
  );
  const queueSheetTranslateY = useSharedValue(queueOffsetFor('closed'));
  const queueDragStartY = useRef(0);
  // The shared value is animated on the UI thread, so its JS-side read can lag;
  // gestures start from this ref instead.
  const queueSettledY = useRef(queueOffsetFor('closed'));
  const queueScrollY = useRef(0);
  const coverOffset = useSharedValue(0);
  const artworkSizeRef = useRef(artworkSize);
  const trackKeyRef = useRef(trackKey);
  const onPreviousRef = useRef(onPrevious);
  const onNextRef = useRef(onNext);
  const pendingCoverTransition = useRef<{
    fromTrackKey: string | null;
    incomingOffset: number;
    timeout: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  artworkSizeRef.current = artworkSize;
  trackKeyRef.current = trackKey;
  onPreviousRef.current = onPrevious;
  onNextRef.current = onNext;

  const coverAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: coverOffset.value }],
  }));

  const completeCoverSwipe = (swipeLeft: boolean) => {
    const pending = {
      fromTrackKey: trackKeyRef.current,
      incomingOffset: swipeLeft
        ? artworkSizeRef.current
        : -artworkSizeRef.current,
      timeout: null as ReturnType<typeof setTimeout> | null,
    };
    pendingCoverTransition.current = pending;

    if (swipeLeft) onNextRef.current();
    else onPreviousRef.current();

    pending.timeout = setTimeout(() => {
      if (
        pendingCoverTransition.current === pending &&
        trackKeyRef.current === pending.fromTrackKey
      ) {
        pendingCoverTransition.current = null;
        coverOffset.value = withSpring(0);
      }
    }, 800);
  };

  useEffect(() => {
    const pending = pendingCoverTransition.current;
    if (!pending || pending.fromTrackKey === trackKey) return;

    if (pending.timeout) clearTimeout(pending.timeout);
    pendingCoverTransition.current = null;
    coverOffset.value = pending.incomingOffset;
    coverOffset.value = withTiming(0, { duration: 180 });
  }, [coverOffset, trackKey]);

  useEffect(
    () => () => {
      const pending = pendingCoverTransition.current;
      if (pending?.timeout) clearTimeout(pending.timeout);
    },
    [],
  );

  const coverPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !pendingCoverTransition.current &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_event, gesture) => {
          const maxOffset = artworkSizeRef.current * 0.55;
          coverOffset.value = Math.max(
            -maxOffset,
            Math.min(maxOffset, gesture.dx),
          );
        },
        onPanResponderRelease: (_event, gesture) => {
          const threshold = Math.max(44, artworkSizeRef.current * 0.18);
          const swipeLeft =
            gesture.dx < -threshold || (gesture.vx < -0.5 && gesture.dx < -10);
          const swipeRight =
            gesture.dx > threshold || (gesture.vx > 0.5 && gesture.dx > 10);

          if (!swipeLeft && !swipeRight) {
            coverOffset.value = withSpring(0);
            return;
          }

          const destination =
            (swipeLeft ? -1 : 1) * Math.max(artworkSizeRef.current, 1);
          coverOffset.value = withTiming(
            destination,
            { duration: 150 },
            finished => {
              if (finished) runOnJS(completeCoverSwipe)(swipeLeft);
            },
          );
        },
        onPanResponderTerminate: () => {
          coverOffset.value = withSpring(0);
        },
      }),
    [coverOffset],
  );
  const queueSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: queueSheetTranslateY.value }],
  }));

  const settleQueueSheet = useCallback(
    (level: QueueLevel) => {
      const target = queueOffsetFor(level);
      queueSettledY.current = target;
      queueSheetTranslateY.value = withTiming(target, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    },
    [queueOffsetFor, queueSheetTranslateY],
  );

  useEffect(() => {
    settleQueueSheet(queueSheetLevel);
  }, [queueSheetLevel, settleQueueSheet]);

  // The player stays mounted while collapsed; reopen it with the queue shut.
  useEffect(() => {
    if (isExpanded) return;
    settleQueueSheet('closed');
    setQueueSheetLevel('closed');
    setIsQueueDragging(false);
  }, [isExpanded, settleQueueSheet]);

  useEffect(() => {
    if (!isQueueOpen) queueScrollY.current = 0;
  }, [isQueueOpen]);

  // Hit testing already limits this responder to the sheet's subtree, so any
  // vertical drag that reaches it belongs to the queue.
  const ownsQueueDrag = useCallback(
    (gesture: { dy: number; dx: number }) => {
      if (Math.abs(gesture.dy) <= 8) return false;
      if (Math.abs(gesture.dy) <= Math.abs(gesture.dx)) return false;
      if (queueSheetLevel !== 'full') return true;
      return gesture.dy > 0 && queueScrollY.current <= 0;
    },
    [queueSheetLevel],
  );

  const queuePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          ownsQueueDrag(gesture),
        onMoveShouldSetPanResponder: (_event, gesture) =>
          ownsQueueDrag(gesture),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          cancelAnimation(queueSheetTranslateY);
          queueDragStartY.current = queueSettledY.current;
          setIsQueueDragging(true);
        },
        onPanResponderMove: (_event, gesture) => {
          const closedY = queueOffsetFor('closed');
          queueSheetTranslateY.value = Math.max(
            0,
            Math.min(closedY, queueDragStartY.current + gesture.dy),
          );
        },
        onPanResponderRelease: (_event, gesture) => {
          const closedY = queueOffsetFor('closed');
          const currentY = Math.max(
            0,
            Math.min(closedY, queueDragStartY.current + gesture.dy),
          );
          const snaps: { level: QueueLevel; y: number }[] = [
            { level: 'full', y: 0 },
            { level: 'peek', y: queueOffsetFor('peek') },
            { level: 'closed', y: closedY },
          ];
          const nearestSnap = snaps.reduce((nearest, snap) =>
            Math.abs(snap.y - currentY) < Math.abs(nearest.y - currentY)
              ? snap
              : nearest,
          );
          const nextLevel =
            gesture.vy < -0.75
              ? 'full'
              : gesture.vy > 0.75
                ? 'closed'
                : nearestSnap.level;
          // Snap explicitly: a release that keeps the same level emits no state change,
          // which would otherwise leave the sheet where the finger lifted.
          settleQueueSheet(nextLevel);
          setQueueSheetLevel(nextLevel);
          setIsQueueDragging(false);
        },
        onPanResponderTerminate: () => {
          settleQueueSheet(queueSheetLevel);
          setIsQueueDragging(false);
        },
      }),
    [
      ownsQueueDrag,
      queueOffsetFor,
      queueSheetLevel,
      queueSheetTranslateY,
      settleQueueSheet,
    ],
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1">
      <View className="flex-1 items-center justify-center px-8 py-6">
        <Animated.View
          {...coverPanResponder.panHandlers}
          className="overflow-hidden rounded-3xl bg-surface-container-high"
          style={[
            { width: artworkSize, height: artworkSize },
            coverAnimatedStyle,
          ]}
        >
          {artworkUri ? (
            <Image
              source={{ uri: artworkUri }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <SymbolView
                name={{
                  ios: 'music.note',
                  android: 'music_note',
                  web: 'music_note',
                }}
                size={ICON_SIZES.display}
                tintColor={colors.onSurfaceVariant}
              />
            </View>
          )}
        </Animated.View>

        <View className="mt-8 w-full">
          <Text
            className="text-2xl font-semibold text-on-surface"
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            className="mt-1 text-lg text-on-surface-variant"
            numberOfLines={1}
          >
            {artist}
          </Text>
        </View>

        <View className="mt-8 w-full flex-row items-center">
          <View className="flex-1 items-center">
            <View
              className="h-12 w-12 overflow-hidden rounded-full"
              style={{ borderRadius: 24, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isShuffling ? 'Turn shuffle off' : 'Turn shuffle on'
                }
                accessibilityState={{ selected: isShuffling }}
                onPress={onShuffle}
                className="h-full w-full items-center justify-center rounded-full"
                style={{
                  borderRadius: 24,
                  backgroundColor: isShuffling
                    ? colors.primaryContainer
                    : 'transparent',
                }}
                android_ripple={{
                  color: rippleColor,
                  borderless: false,
                  radius: 24,
                }}
              >
                <SymbolView
                  name={{ ios: 'shuffle', android: 'shuffle', web: 'shuffle' }}
                  size={ICON_SIZES.small}
                  tintColor={
                    isShuffling
                      ? colors.onPrimaryContainer
                      : colors.onSurfaceVariant
                  }
                />
              </Pressable>
            </View>
          </View>

          <View className="flex flex-1 flex-row items-center justify-center gap-3">
            <View
              className="h-12 w-12 overflow-hidden rounded-full"
              style={{ borderRadius: 24, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous track"
                disabled={isLoading}
                onPress={onPrevious}
                className="h-full w-full items-center justify-center rounded-full"
                style={{ borderRadius: 24, opacity: isLoading ? 0.38 : 1 }}
                android_ripple={{
                  color: rippleColor,
                  borderless: false,
                  radius: 24,
                }}
              >
                <SymbolView
                  name={{
                    ios: 'backward.end.fill',
                    android: 'skip_previous',
                    web: 'skip_previous',
                  }}
                  tintColor={colors.onSurfaceVariant}
                />
              </Pressable>
            </View>

            <View
              className="h-16 w-16 overflow-hidden rounded-full"
              style={{ borderRadius: 32, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isPlaying ? 'Pause playback' : 'Resume playback'
                }
                disabled={isLoading}
                onPress={onToggle}
                className="h-full w-full items-center justify-center rounded-full bg-primary-container"
                style={{ borderRadius: 32, opacity: isLoading ? 0.38 : 1 }}
                android_ripple={{
                  color: rippleColor,
                  borderless: false,
                  radius: 32,
                }}
              >
                <SymbolView
                  name={{
                    ios: isPlaying ? 'pause.fill' : 'play.fill',
                    android: isPlaying ? 'pause' : 'play_arrow',
                    web: isPlaying ? 'pause' : 'play_arrow',
                  }}
                  size={ICON_SIZES.xlarge}
                  tintColor={colors.onPrimaryContainer}
                />
              </Pressable>
            </View>

            <View
              className="h-12 w-12 overflow-hidden rounded-full"
              style={{ borderRadius: 24, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next track"
                disabled={isLoading}
                onPress={onNext}
                className="h-full w-full items-center justify-center rounded-full"
                style={{ borderRadius: 24, opacity: isLoading ? 0.38 : 1 }}
                android_ripple={{
                  color: rippleColor,
                  borderless: false,
                  radius: 24,
                }}
              >
                <SymbolView
                  name={{
                    ios: 'forward.end.fill',
                    android: 'skip_next',
                    web: 'skip_next',
                  }}
                  tintColor={colors.onSurfaceVariant}
                />
              </Pressable>
            </View>
          </View>
          <View className="flex-1 items-center">
            <View
              className="h-12 w-12 overflow-hidden rounded-full"
              style={{ borderRadius: 24, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  repeatMode === 'off'
                    ? 'Repeat current track once'
                    : repeatMode === 'one'
                      ? 'Repeat all tracks'
                      : 'Turn repeat off'
                }
                accessibilityState={{ selected: repeatMode !== 'off' }}
                onPress={onLoop}
                className="h-full w-full items-center justify-center rounded-full"
                style={{
                  borderRadius: 24,
                  backgroundColor:
                    repeatMode !== 'off'
                      ? colors.primaryContainer
                      : 'transparent',
                }}
                android_ripple={{
                  color: rippleColor,
                  borderless: false,
                  radius: 24,
                }}
              >
                <SymbolView
                  name={
                    repeatMode === 'one'
                      ? {
                          ios: 'repeat.1',
                          android: 'repeat_one',
                          web: 'repeat_one',
                        }
                      : { ios: 'repeat', android: 'repeat', web: 'repeat' }
                  }
                  size={ICON_SIZES.small}
                  tintColor={
                    repeatMode !== 'off'
                      ? colors.onPrimaryContainer
                      : colors.onSurfaceVariant
                  }
                />
              </Pressable>
            </View>
          </View>
        </View>

        <SeekBar
          positionSeconds={positionSeconds}
          durationSeconds={durationSeconds}
          onSeek={onSeek}
          colors={colors}
        />
      </View>
      <Animated.View
        {...queuePanResponder.panHandlers}
        style={[
          {
            position: 'absolute',
            right: 0,
            bottom: insets.bottom,
            left: 0,
            height: queueSheetHeight,
            zIndex: 10,
            elevation: 20,
            overflow: 'hidden',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surfaceContainer,
          },
          queueSheetAnimatedStyle,
        ]}
      >
        <View style={{ height: QUEUE_HANDLE_HEIGHT }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isQueueOpen ? 'Hide upcoming queue' : 'Show upcoming queue'
            }
            accessibilityHint="Drag this handle up to expand the queue"
            onPress={() => {
              setIsQueueDragging(false);
              setQueueSheetLevel(isQueueOpen ? 'closed' : 'peek');
            }}
            className="h-full flex-row items-center justify-center gap-2"
            android_ripple={{ color: rippleColor }}
          >
            <SymbolView
              name={
                !isQueueOpen
                  ? {
                      ios: 'chevron.up',
                      android: 'keyboard_arrow_up',
                      web: 'keyboard_arrow_up',
                    }
                  : {
                      ios: 'chevron.down',
                      android: 'keyboard_arrow_down',
                      web: 'keyboard_arrow_down',
                    }
              }
              tintColor={colors.onSurfaceVariant}
            />
            <Text className="text-sm font-medium text-on-surface">Up next</Text>
            <Text className="text-xs text-on-surface-variant">
              {queueTracks.length}
            </Text>
          </Pressable>
        </View>
        {isQueueOpen && queueTracks.length > 0 ? (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 20 }}
            scrollEventThrottle={16}
            onScroll={event => {
              queueScrollY.current = event.nativeEvent.contentOffset.y;
            }}
          >
            {queueTracks.map(track => (
              <Pressable
                key={`${track.uri}-${track.queueIndex}`}
                accessibilityRole="button"
                accessibilityLabel={`Play ${track.title} by ${track.artist}`}
                onPress={() => {
                  onSelectQueueTrack(track.queueIndex);
                  setQueueSheetLevel('closed');
                  setIsQueueDragging(false);
                }}
                unstable_pressDelay={80}
                style={({ pressed }) =>
                  pressed ? { opacity: 0.6 } : undefined
                }
                className="min-h-14 flex-row items-center gap-3 px-5 py-1.5"
              >
                {track.artworkUri ? (
                  <Image
                    source={{ uri: track.artworkUri }}
                    className="h-10 w-10 rounded-md"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="h-10 w-10 items-center justify-center rounded-md bg-surface-container-high">
                    <SymbolView
                      name={{
                        ios: 'music.note',
                        android: 'music_note',
                        web: 'music_note',
                      }}
                      size={ICON_SIZES.small}
                      tintColor={colors.onSurfaceVariant}
                    />
                  </View>
                )}
                <View className="flex-1">
                  <Text
                    className="text-sm leading-5 text-on-surface"
                    numberOfLines={1}
                  >
                    {track.title}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs leading-4 text-on-surface-variant opacity-70"
                    numberOfLines={1}
                  >
                    {track.artist}
                  </Text>
                </View>
                {track.durationSeconds != null ? (
                  <Text className="ml-3 text-xs text-on-surface-variant opacity-70">
                    {formatTime(track.durationSeconds)}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        ) : isQueueOpen ? (
          <Text className="px-5 py-4 text-sm text-on-surface-variant">
            No upcoming tracks
          </Text>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}
