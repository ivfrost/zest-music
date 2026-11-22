import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import {
  Fragment,
  type ComponentRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { ICON_SIZES } from '@/hooks/materialPalette';
import { useAudioProgress } from '@/hooks/useAudio';
import type { useMaterialTheme } from '@/hooks/useMaterialTheme';
import { radius, spacing } from '@/theme';
import type { RepeatMode } from '@/types/playback';

type MaterialColors = ReturnType<typeof useMaterialTheme>['colors'];

const QUEUE_HANDLE_HEIGHT = 68;
// Fallback row height: 40dp artwork + py-2. A real row replaces it.
const QUEUE_ROW_HEIGHT = 54;
const QUEUE_PEEK_ROWS = 4;
type QueueLevel = 'closed' | 'peek' | 'mid' | 'full';

// Fine seek shows this many seconds across the bar, with a tick every 5 seconds.
const FINE_WINDOW_SECONDS = 60;
const FINE_TICK_SECONDS = 5;

type QueueTrack = {
  queueIndex: number;
  uri: string;
  title: string;
  artist: string;
  artworkUri: string | null;
  durationSeconds: number | null;
};

type PlayerArtist = { id: string; name: string };

type FullPlayerProps = {
  isExpanded: boolean;
  title: string;
  artist: string;
  artistLinks: readonly PlayerArtist[];
  /** `id` is null when the playing file is no longer in the library. */
  album: { id: string | null; title: string } | null;
  artworkUri: string | null;
  trackKey: string | null;
  artworkSize: number;
  isPlaying: boolean;
  isLoading: boolean;
  isShuffling: boolean;
  repeatMode: RepeatMode;
  durationSeconds: number;
  onShuffle: () => void;
  onLoop: () => void;
  onPrevious: () => void | Promise<void>;
  onToggle: () => void;
  onNext: () => void | Promise<void>;
  onSeek: (seconds: number) => void;
  onOpenArtist: (artistId: string) => void;
  onOpenAlbum: (releaseId: string) => void;
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
}: {
  positionSeconds: number;
  durationSeconds: number;
  onSeek: (seconds: number) => void;
  colors: MaterialColors;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [draftFraction, setDraftFraction] = useState<number | null>(null);
  const widthRef = useRef(0);
  const durationRef = useRef(durationSeconds);
  const onSeekRef = useRef(onSeek);
  const startFraction = useRef(0);
  const latestFraction = useRef(0);
  const latestGestureDx = useRef(0);
  const fineStartFraction = useRef(0);
  const fineCenterSeconds = useRef(0);
  const fineStartGestureDx = useRef(0);
  const fineScrubbingRef = useRef(false);
  const [fineScrubbing, setFineScrubbing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pendingSeekFraction = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress =
    durationSeconds > 0
      ? Math.min(1, Math.max(0, positionSeconds / durationSeconds))
      : 0;
  const displayedFraction = draftFraction ?? progress;
  const displayedRef = useRef(displayedFraction);
  displayedRef.current = displayedFraction;
  const barFreezeFraction = useRef(0);
  // The bar holds the pre-press position until lift.
  const barFraction = dragging
    ? barFreezeFraction.current
    : displayedFraction;
  const fineSpanSeconds = Math.min(FINE_WINDOW_SECONDS, durationSeconds);
  const fineSpanRef = useRef(fineSpanSeconds);
  fineSpanRef.current = fineSpanSeconds;
  // Centered on the reference second at any position, so ticks can fall outside.
  const fineWindowStart = fineCenterSeconds.current - fineSpanSeconds / 2;
  const fineWindowRef = useRef({ start: 0, end: 0 });
  fineWindowRef.current = {
    start: fineWindowStart,
    end: fineWindowStart + fineSpanSeconds,
  };
  const fineMarker =
    fineSpanSeconds > 0
      ? (displayedFraction * durationSeconds - fineWindowStart) /
        fineSpanSeconds
      : 0;
  // Ticks are offsets from the reference second, so they stay symmetric.
  const fineTicks: { offset: number; label: string }[] = [];
  const fineSecondTicks: number[] = [];
  if (fineScrubbing && fineSpanSeconds > 0) {
    const half = Math.floor(fineSpanSeconds / 2);
    for (let delta = -half; delta <= half; delta += 1) {
      if (delta === 0) continue;
      const time = fineCenterSeconds.current + delta;
      if (time < 0 || time > durationSeconds) continue;
      if (delta % FINE_TICK_SECONDS !== 0) {
        fineSecondTicks.push(0.5 + delta / fineSpanSeconds);
        continue;
      }
      // The edge ticks have no room for a label.
      if (Math.abs(delta) >= fineSpanSeconds / 2) continue;
      fineTicks.push({
        offset: 0.5 + delta / fineSpanSeconds,
        label: `${delta > 0 ? '+' : ''}${delta}`,
      });
    }
  }
  const lastTickRef = useRef<number | null>(null);

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
    if (fineScrubbingRef.current) return;
    clearHoldTimer();
    holdTimer.current = setTimeout(() => {
      // A hold without a drag anchors on the seek position from the press.
      const moved = Math.abs(latestGestureDx.current) > 8;
      const seconds = Math.round(
        (moved ? latestFraction.current : barFreezeFraction.current) *
          durationRef.current,
      );
      const fraction = seconds / Math.max(1, durationRef.current);
      fineCenterSeconds.current = seconds;
      fineStartFraction.current = fraction;
      latestFraction.current = fraction;
      fineStartGestureDx.current = latestGestureDx.current;
      fineScrubbingRef.current = true;
      setFineScrubbing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setDraftFraction(fraction);
    }, 300);
  };

  const tickFor = (fraction: number) =>
    Math.round(
      (fraction * durationRef.current) / (fineScrubbingRef.current ? 1 : 5),
    );

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
          barFreezeFraction.current = displayedRef.current;
          const fraction = clampFraction(
            event.nativeEvent.locationX / Math.max(1, widthRef.current),
          );
          startFraction.current = fraction;
          latestFraction.current = fraction;
          lastTickRef.current = tickFor(fraction);
          latestGestureDx.current = 0;
          fineScrubbingRef.current = false;
          setFineScrubbing(false);
          setDragging(true);
          setDraftFraction(fraction);
          scheduleFineScrub();
        },
        onPanResponderMove: (_event, gesture) => {
          latestGestureDx.current = gesture.dx;
          const rawFraction = clampFraction(
            fineScrubbingRef.current
              ? fineStartFraction.current +
                  ((gesture.dx - fineStartGestureDx.current) /
                    Math.max(1, widthRef.current)) *
                    (fineSpanRef.current /
                      Math.max(1, durationRef.current))
              : startFraction.current +
                  gesture.dx / Math.max(1, widthRef.current),
          );
          let fraction = rawFraction;
          if (fineScrubbingRef.current) {
            const start = Math.max(0, fineWindowRef.current.start);
            const end = Math.min(
              durationRef.current,
              fineWindowRef.current.end,
            );
            fraction =
              Math.min(
                end,
                Math.max(start, Math.round(rawFraction * durationRef.current)),
              ) / Math.max(1, durationRef.current);
          }
          latestFraction.current = fraction;
          const tick = tickFor(fraction);
          if (fineScrubbingRef.current && tick !== lastTickRef.current) {
            lastTickRef.current = tick;
            Haptics.selectionAsync();
          }
          setDraftFraction(fraction);
          scheduleFineScrub();
        },
        onPanResponderRelease: _event => {
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
          setFineScrubbing(false);
          setDragging(false);
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
          setFineScrubbing(false);
          setDragging(false);
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
        {/* Bar must be the touch target, or locationX is thumb-relative. */}
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 h-1.5 overflow-hidden rounded-md3-full"
          style={{
            top: '50%',
            transform: [{ translateY: -3 }],
            backgroundColor: colors.surfaceContainerHigh,
          }}
        >
          <View
            className="h-full rounded-md3-full"
            style={{
              width: `${barFraction * 100}%`,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <View
          pointerEvents="none"
          className="absolute h-3.5 w-3.5 rounded-md3-full"
          style={{
            top: '50%',
            left: `${barFraction * 100}%`,
            transform: [{ translateY: -6 }],
            marginLeft: -7,
            backgroundColor: colors.primary,
            opacity: durationSeconds > 0 ? 1 : 0,
          }}
        />
        {fineScrubbing ? (
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 overflow-hidden rounded-md3-full"
            style={{
              top: -30,
              height: 22,
              backgroundColor: colors.surfaceContainerHigh,
            }}
          >
            {fineSecondTicks.map(offset => (
              <View
                key={offset}
                className="absolute"
                style={{
                  left: `${offset * 100}%`,
                  top: 3,
                  width: 1,
                  height: 3,
                  backgroundColor: colors.onSurfaceVariant,
                  opacity: 0.35,
                }}
              />
            ))}
            {fineTicks.map(tick => (
              <Fragment key={tick.label}>
                <View
                  className="absolute rounded-md3-full"
                  style={{
                    left: `${tick.offset * 100}%`,
                    top: 2,
                    width: 1,
                    height: 5,
                    backgroundColor: colors.onSurfaceVariant,
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    position: 'absolute',
                    left: `${tick.offset * 100}%`,
                    top: 8,
                    width: 26,
                    marginLeft: -13,
                    textAlign: 'center',
                    fontSize: 9,
                    color: colors.onSurfaceVariant,
                    opacity: 0.6,
                  }}
                >
                  {tick.label}
                </Text>
              </Fragment>
            ))}
            <View
              className="absolute rounded-md3-full"
              style={{
                left: `${fineMarker * 100}%`,
                top: 0,
                marginLeft: -2,
                width: 4,
                height: '100%',
                backgroundColor: colors.primary,
              }}
            />
          </View>
        ) : null}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-body-small text-on-surface-variant">
          {formatTime(
            draftFraction === null
              ? positionSeconds
              : displayedFraction * durationSeconds,
          )}
        </Text>
        <Text className="text-body-small text-on-surface-variant">
          {formatTime(durationSeconds)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Keeps the position tick inside the seek bar instead of re-rendering the whole
 * player (and its queue sheet) four times a second.
 */
function SeekBarWithProgress({
  durationSeconds,
  onSeek,
  colors,
}: Pick<FullPlayerProps, 'durationSeconds' | 'onSeek' | 'colors'>) {
  const { positionSeconds } = useAudioProgress();

  return (
    <SeekBar
      positionSeconds={positionSeconds}
      durationSeconds={durationSeconds}
      onSeek={onSeek}
      colors={colors}
    />
  );
}

export function FullPlayer({
  isExpanded,
  title,
  artist,
  artistLinks,
  album,
  artworkUri,
  trackKey,
  artworkSize,
  isPlaying,
  isLoading,
  isShuffling,
  repeatMode,
  durationSeconds,
  onShuffle,
  onLoop,
  onPrevious,
  onToggle,
  onNext,
  onSeek,
  onOpenArtist,
  onOpenAlbum,
  queueTracks,
  onSelectQueueTrack,
  colors,
  rippleColor,
}: FullPlayerProps) {
  const [queueSheetLevel, setQueueSheetLevel] = useState<QueueLevel>('closed');
  const [isQueueDragging, setIsQueueDragging] = useState(false);
  const [isCoverTransitioning, setIsCoverTransitioning] = useState(false);
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
  const [artistBottom, setArtistBottom] = useState(0);
  const [queueRowHeight, setQueueRowHeight] = useState(0);
  const rowHeight = queueRowHeight || QUEUE_ROW_HEIGHT;
  // Peek shows whole rows and stays below the artist, never a clipped row.
  const queuePeekRows = Math.min(
    QUEUE_PEEK_ROWS,
    Math.floor(
      Math.max(
        0,
        windowHeight - insets.bottom - artistBottom - QUEUE_HANDLE_HEIGHT,
      ) / rowHeight,
    ),
  );
  const queuePeekHeight = QUEUE_HANDLE_HEIGHT + queuePeekRows * rowHeight;
  // The mid stop sits halfway between peek and full, in whole rows.
  const queueMidHeight =
    queuePeekHeight +
    Math.floor((queueSheetHeight - queuePeekHeight) / 2 / rowHeight) *
      rowHeight;
  const queueOffsetFor = useCallback(
    (level: QueueLevel) =>
      level === 'full'
        ? 0
        : level === 'peek'
          ? Math.max(0, queueSheetHeight - queuePeekHeight)
          : level === 'mid'
            ? Math.max(0, queueSheetHeight - queueMidHeight)
            : Math.max(0, queueSheetHeight - QUEUE_HANDLE_HEIGHT),
    [queueSheetHeight, queuePeekHeight, queueMidHeight],
  );
  const queueSheetTranslateY = useSharedValue(queueOffsetFor('closed'));
  const queueDragStartY = useRef(0);
  // The shared value is animated on the UI thread, so its JS-side read can lag.
  // Gestures start from this ref instead.
  const queueSettledY = useRef(queueOffsetFor('closed'));
  const queueScrollY = useRef(0);
  const artistRowRef = useRef<ComponentRef<typeof View>>(null);
  const coverOffset = useSharedValue(0);
  const coverSwipeInProgress = useSharedValue(false);
  const coverGestureStart = useSharedValue(0);
  const reducedMotion = useReducedMotion();
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

    const restoreIfTrackDidNotChange = () => {
      if (
        pendingCoverTransition.current !== pending ||
        trackKeyRef.current !== pending.fromTrackKey
      ) {
        return;
      }

      if (pending.timeout) clearTimeout(pending.timeout);
      pendingCoverTransition.current = null;
      if (reducedMotion) {
        coverOffset.value = 0;
        coverSwipeInProgress.set(false);
        setIsCoverTransitioning(false);
        return;
      }

      coverOffset.value = withSpring(
        0,
        { duration: 300, dampingRatio: 1 },
        finished => {
          if (finished) {
            coverSwipeInProgress.set(false);
            scheduleOnRN(setIsCoverTransitioning, false);
          }
        },
      );
    };
    const playbackChange = swipeLeft
      ? onNextRef.current()
      : onPreviousRef.current();

    pending.timeout = setTimeout(restoreIfTrackDidNotChange, 700);
    void Promise.resolve(playbackChange).then(
      () => requestAnimationFrame(restoreIfTrackDidNotChange),
      () => requestAnimationFrame(restoreIfTrackDidNotChange),
    );
  };

  useLayoutEffect(() => {
    const pending = pendingCoverTransition.current;
    if (!pending || pending.fromTrackKey === trackKey) return;

    if (pending.timeout) clearTimeout(pending.timeout);
    pendingCoverTransition.current = null;
    if (reducedMotion) {
      coverOffset.value = 0;
      coverSwipeInProgress.set(false);
      setIsCoverTransitioning(false);
      return;
    }

    coverOffset.value = pending.incomingOffset;
    coverOffset.value = withTiming(
      0,
      { duration: 180, easing: Easing.out(Easing.cubic) },
      finished => {
        if (finished) {
          coverSwipeInProgress.set(false);
          scheduleOnRN(setIsCoverTransitioning, false);
        }
      },
    );
  }, [coverOffset, coverSwipeInProgress, reducedMotion, trackKey]);

  useEffect(
    () => () => {
      const pending = pendingCoverTransition.current;
      if (pending?.timeout) clearTimeout(pending.timeout);
    },
    [],
  );

  const coverPanGesture = usePanGesture({
    enabled: !isLoading && !isCoverTransitioning,
    activeOffsetX: [-10, 10],
    failOffsetY: [-10, 10],
    onActivate: () => {
      coverGestureStart.set(coverOffset.get());
    },
    onUpdate: event => {
      if (isLoading || isCoverTransitioning || coverSwipeInProgress.get()) {
        return;
      }
      const maxOffset = artworkSize * 0.55;
      const nextOffset = coverGestureStart.get() + event.translationX;
      coverOffset.set(Math.max(-maxOffset, Math.min(maxOffset, nextOffset)));
    },
    onDeactivate: event => {
      if (isCoverTransitioning || coverSwipeInProgress.get()) {
        return;
      }
      if (event.canceled || isLoading) {
        coverOffset.set(
          withSpring(0, {
            duration: 300,
            dampingRatio: 0.8,
            velocity: event.velocityX,
            overshootClamping: true,
          }),
        );
        return;
      }

      const threshold = Math.max(44, artworkSize * 0.18);
      const swipeLeft =
        event.translationX < -threshold ||
        (event.velocityX < -500 && event.translationX < -10);
      const swipeRight =
        event.translationX > threshold ||
        (event.velocityX > 500 && event.translationX > 10);

      if (!swipeLeft && !swipeRight) {
        coverOffset.set(
          withSpring(0, {
            duration: 300,
            dampingRatio: 0.8,
            velocity: event.velocityX,
            overshootClamping: true,
          }),
        );
        return;
      }

      coverSwipeInProgress.set(true);
      scheduleOnRN(setIsCoverTransitioning, true);
      if (reducedMotion) {
        coverOffset.set(0);
        scheduleOnRN(completeCoverSwipe, swipeLeft);
        return;
      }

      const destination = (swipeLeft ? -1 : 1) * Math.max(artworkSize, 1);
      const velocity = swipeLeft
        ? Math.min(0, event.velocityX)
        : Math.max(0, event.velocityX);
      coverOffset.set(
        withSpring(
          destination,
          {
            duration: 250,
            dampingRatio: 1,
            velocity,
            overshootClamping: true,
          },
          finished => {
            if (finished) scheduleOnRN(completeCoverSwipe, swipeLeft);
          },
        ),
      );
    },
  });
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

  // The player stays mounted while collapsed. Reopen it with the queue shut.
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
            { level: 'mid', y: queueOffsetFor('mid') },
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
        <GestureDetector gesture={coverPanGesture}>
          <Animated.View
            className="overflow-hidden rounded-md3-xl bg-surface-container-high"
            style={[
              { width: artworkSize, height: artworkSize },
              coverAnimatedStyle,
            ]}
          >
            {artworkUri ? (
              <Image
                source={{ uri: artworkUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                cachePolicy="memory-disk"
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
        </GestureDetector>

        <View className="mt-8 w-full">
          <Text
            className="text-headline-small font-semibold text-on-surface"
            numberOfLines={1}
          >
            {title}
          </Text>
          <View className="mt-1">
            <View
              ref={artistRowRef}
              className="flex-row flex-wrap items-center"
              onLayout={() => {
                // onLayout is parent-relative. The cap uses window space.
                artistRowRef.current?.measureInWindow((_x, y, _w, height) => {
                  if (height > 0) setArtistBottom(y + height);
                });
              }}
            >
              {artistLinks.length > 0 ? (
                artistLinks.map((linkedArtist, index) => (
                  <Fragment key={linkedArtist.id}>
                    {index > 0 ? (
                      <Text className="text-title-medium text-on-surface-variant">
                        {', '}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Open artist ${linkedArtist.name}`}
                      onPress={() => onOpenArtist(linkedArtist.id)}
                    >
                      <Text
                        className="text-title-medium text-on-surface-variant"
                        numberOfLines={1}
                      >
                        {linkedArtist.name}
                      </Text>
                    </Pressable>
                  </Fragment>
                ))
              ) : (
                <Text
                  className="text-title-medium text-on-surface-variant"
                  numberOfLines={1}
                >
                  {artist}
                </Text>
              )}
            </View>

            {album ? (
              album.id ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open album ${album.title}`}
                  onPress={() => onOpenAlbum(album.id as string)}
                >
                  <Text
                    className="text-title-medium text-on-surface-variant"
                    numberOfLines={1}
                  >
                    {album.title}
                  </Text>
                </Pressable>
              ) : (
                <Text
                  className="text-title-medium text-on-surface-variant"
                  numberOfLines={1}
                >
                  {album.title}
                </Text>
              )
            ) : null}
          </View>
        </View>

        <View className="mt-8 w-full flex-row items-center">
          <View className="flex-1 items-center">
            <View
              className="h-12 w-12 overflow-hidden rounded-md3-full"
              style={{ borderRadius: radius.full, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isShuffling ? 'Turn shuffle off' : 'Turn shuffle on'
                }
                accessibilityState={{ selected: isShuffling }}
                onPress={onShuffle}
                className="h-full w-full items-center justify-center rounded-md3-full"
                style={{
                  borderRadius: radius.full,
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
              className="h-12 w-12 overflow-hidden rounded-md3-full"
              style={{ borderRadius: radius.full, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous track"
                disabled={isLoading || isCoverTransitioning}
                onPress={onPrevious}
                className="h-full w-full items-center justify-center rounded-md3-full"
                style={{
                  borderRadius: radius.full,
                  opacity: isLoading ? 0.38 : 1,
                }}
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
              className="h-16 w-16 overflow-hidden rounded-md3-full"
              style={{ borderRadius: radius.full, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isPlaying ? 'Pause playback' : 'Resume playback'
                }
                disabled={isLoading}
                onPress={onToggle}
                className="h-full w-full items-center justify-center rounded-md3-full bg-primary-container"
                style={{
                  borderRadius: radius.full,
                  opacity: isLoading ? 0.38 : 1,
                }}
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
              className="h-12 w-12 overflow-hidden rounded-md3-full"
              style={{ borderRadius: radius.full, overflow: 'hidden' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next track"
                disabled={isLoading || isCoverTransitioning}
                onPress={onNext}
                className="h-full w-full items-center justify-center rounded-md3-full"
                style={{
                  borderRadius: radius.full,
                  opacity: isLoading ? 0.38 : 1,
                }}
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
              className="h-12 w-12 overflow-hidden rounded-md3-full"
              style={{ borderRadius: radius.full, overflow: 'hidden' }}
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
                className="h-full w-full items-center justify-center rounded-md3-full"
                style={{
                  borderRadius: radius.full,
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

        <SeekBarWithProgress
          durationSeconds={durationSeconds}
          onSeek={onSeek}
          colors={colors}
        />
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: insets.bottom,
          left: 0,
          zIndex: 10,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          {...queuePanResponder.panHandlers}
          style={[
            {
              position: 'absolute',
              right: 0,
              bottom: 0,
              left: 0,
              height: queueSheetHeight,
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
              <Text className="text-body-medium font-medium text-on-surface">
                Up next
              </Text>
              <Text className="text-body-small text-on-surface-variant">
                {queueTracks.length}
              </Text>
            </Pressable>
          </View>
          {isQueueOpen && queueTracks.length > 0 ? (
            <FlatList
              style={{ flex: 1 }}
              data={queueTracks}
              keyExtractor={track => `${track.uri}-${track.queueIndex}`}
              initialNumToRender={12}
              windowSize={7}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              scrollEventThrottle={16}
              onScroll={event => {
                queueScrollY.current = event.nativeEvent.contentOffset.y;
              }}
              renderItem={({ item: track, index }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${track.title} by ${track.artist}`}
                  onLayout={
                    index === 0
                      ? event =>
                          setQueueRowHeight(event.nativeEvent.layout.height)
                      : undefined
                  }
                  onPress={() => {
                    onSelectQueueTrack(track.queueIndex);
                    setQueueSheetLevel('closed');
                    setIsQueueDragging(false);
                  }}
                  unstable_pressDelay={80}
                  style={({ pressed }) =>
                    pressed ? { opacity: 0.6 } : undefined
                  }
                  className="min-h-14 flex-row items-center gap-3 px-5 py-2"
                >
                  {track.artworkUri ? (
                    <Image
                      source={{ uri: track.artworkUri }}
                      style={{ width: 40, height: 40, borderRadius: radius.sm }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View className="h-10 w-10 items-center justify-center rounded-md3-sm bg-surface-container-high">
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
                      className="text-body-medium text-on-surface"
                      numberOfLines={1}
                    >
                      {track.title}
                    </Text>
                    <Text
                      className="mt-0.5 text-body-small leading-4 text-on-surface-variant opacity-70"
                      numberOfLines={1}
                    >
                      {track.artist}
                    </Text>
                  </View>
                  {track.durationSeconds != null ? (
                    <Text className="ml-3 text-body-small text-on-surface-variant opacity-70">
                      {formatTime(track.durationSeconds)}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />
          ) : isQueueOpen ? (
            <Text className="px-5 py-4 text-body-medium text-on-surface-variant">
              No upcoming tracks
            </Text>
          ) : null}
        </Animated.View>
      </View>
      {/* The nav bar sits below the clipped sheet, so fill it with the sheet color. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          left: 0,
          height: insets.bottom,
          zIndex: 10,
          backgroundColor: colors.surfaceContainer,
        }}
      />
    </SafeAreaView>
  );
}
