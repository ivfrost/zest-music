import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';
import {
  Audio,
  type AudioTagHandle,
  getAudioDuration,
} from 'react-native-audio-api';
import { usePreferences } from '@/hooks/usePreferences';
import type { RepeatMode } from '@/types/playback';
import { maintainAudioCache } from './audioCache';
import { audioEngine } from './audioEngine';
import {
  clearPlaybackSession,
  loadPlaybackPosition,
  loadPlaybackSession,
  normalizeOrder,
  savePlaybackPosition,
  savePlaybackSession,
} from './playbackSession';

const POSITION_SAVE_INTERVAL_MS = 5_000;

export interface PlaybackContext {
  currentRoute: string;
  queue: readonly string[];
}

interface PlaybackQueueState extends PlaybackContext {
  repeatMode: RepeatMode;
  hasRepeatedCurrentTrack: boolean;
  order: string[];
  currentIndex: number;
  isShuffling: boolean;
}

interface AudioReactContextValue {
  currentUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionSeconds: number;
  durationSeconds: number;
  seekTo: (seconds: number) => void;
  playTrack: (uri: string, context: PlaybackContext) => Promise<void>;
  playPrevious: () => Promise<void>;
  playNext: () => Promise<void>;
  queueUris: readonly string[];
  queueIndex: number;
  playQueueTrackAt: (index: number) => Promise<void>;
  isShuffling: boolean;
  repeatMode: RepeatMode;
  toggleShuffle: () => void;
  toggleLoop: () => void;
  togglePlayback: () => Promise<void>;
  pause: () => void;
}

export const AudioReactContext = createContext<AudioReactContextValue | null>(
  null,
);

function shuffledCopy(items: readonly string[]): string[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

/** Native Audio element output, routed through the engine's equalizer. */
function StreamingAudio({
  onEnded,
  onEndedRespawned,
}: {
  onEnded: () => void;
  onEndedRespawned: () => void;
}) {
  const sourceUri = useSyncExternalStore(
    audioEngine.subscribe,
    audioEngine.getSource,
  );
  const handleRef = useRef<AudioTagHandle>(null);

  const source = useMemo(
    () => (sourceUri ? { uri: sourceUri } : null),
    [sourceUri],
  );

  useEffect(() => {
    if (!sourceUri) return;

    let cancelled = false;
    void getAudioDuration(sourceUri)
      .then(duration => {
        if (!cancelled) audioEngine.handleDurationChange(sourceUri, duration);
      })
      .catch(error => {
        console.warn('[Audio] Could not determine track duration', {
          sourceUri,
          error,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sourceUri]);

  const handleLoaded = useCallback(() => {
    if (audioEngine.handleLoaded(handleRef.current)) {
      onEndedRespawned();
    }
  }, [onEndedRespawned]);

  if (!source) return null;

  return (
    <Audio
      ref={handleRef}
      source={source}
      context={audioEngine.audioContext}
      onLoad={handleLoaded}
      onPlay={() => audioEngine.handlePlayState(true)}
      onPause={() => audioEngine.handlePlayState(false)}
      onEnded={onEnded}
      onPositionChange={audioEngine.handlePositionChange}
      onWaiting={() => audioEngine.handleLoading(true)}
      onPlaying={() => audioEngine.handleLoading(false)}
      onError={audioEngine.handleError}
    />
  );
}

export function AudioProvider({ children }: PropsWithChildren) {
  const { preferences } = usePreferences();
  const playback = useSyncExternalStore(
    audioEngine.subscribe,
    audioEngine.getSnapshot,
  );
  const playbackQueue = useRef<PlaybackQueueState | null>(null);
  const pendingNextUri = useRef<string | null>(null);
  const [isShuffling, setIsShuffling] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isRestoring, setIsRestoring] = useState(true);
  const restoreAborted = useRef(false);
  const lastSavedPosition = useRef({
    uri: null as string | null,
    seconds: 0,
    at: 0,
  });

  const persistSession = useCallback((next: PlaybackQueueState | null) => {
    if (!next) {
      void clearPlaybackSession();
      return;
    }
    void savePlaybackSession({
      currentRoute: next.currentRoute,
      queue: [...next.queue],
      order: [...next.order],
      currentIndex: next.currentIndex,
      repeatMode: next.repeatMode,
      isShuffling: next.isShuffling,
    });
  }, []);

  const commitQueue = useCallback(
    (next: PlaybackQueueState | null) => {
      restoreAborted.current = true;
      playbackQueue.current = next;
      setIsShuffling(next?.isShuffling ?? false);
      setRepeatMode(next?.repeatMode ?? 'off');
      persistSession(next);
    },
    [persistSession],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [session, position] = await Promise.all([
          loadPlaybackSession(),
          loadPlaybackPosition(),
        ]);

        if (cancelled || restoreAborted.current || !session) return;

        const savedUri = session.order[session.currentIndex];
        if (!savedUri) return;

        const { order, currentIndex, fallback } = normalizeOrder(
          session.queue,
          session.order,
          session.currentIndex,
          savedUri,
        );
        const uri = order[currentIndex];
        if (!uri) return;

        // A fallback order means the saved queue changed, so shuffle is dropped.
        const isShuffling = fallback ? false : session.isShuffling;

        playbackQueue.current = {
          currentRoute: session.currentRoute,
          queue: session.queue,
          order,
          currentIndex,
          repeatMode: session.repeatMode,
          isShuffling,
          hasRepeatedCurrentTrack: false,
        };
        setIsShuffling(isShuffling);
        setRepeatMode(session.repeatMode);

        // Never autoplay on cold start.
        await audioEngine.load(uri, {
          autoplay: false,
          startAtSeconds: position?.uri === uri ? position.positionSeconds : 0,
        });
      } catch (error) {
        if (cancelled || restoreAborted.current) return;

        console.warn('[Audio] Could not restore playback session', error);
        playbackQueue.current = null;
        await clearPlaybackSession();
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTrackEnded = useCallback(() => {
    if (!audioEngine.handleEnded()) return;

    const activeQueue = playbackQueue.current;
    if (!activeQueue) return;

    if (
      activeQueue.repeatMode === 'one' &&
      !activeQueue.hasRepeatedCurrentTrack
    ) {
      const currentUri =
        activeQueue.order[activeQueue.currentIndex] ??
        audioEngine.getSnapshot().currentUri;
      if (currentUri) {
        commitQueue({
          ...activeQueue,
          hasRepeatedCurrentTrack: true,
        });
        pendingNextUri.current = currentUri;
        return;
      }
    }

    const repeatMode =
      activeQueue.repeatMode === 'one' ? 'off' : activeQueue.repeatMode;
    const nextIndex = activeQueue.currentIndex + 1;
    const resolvedNextIndex =
      nextIndex < activeQueue.order.length
        ? nextIndex
        : repeatMode === 'all'
          ? 0
          : -1;
    const nextUri = activeQueue.order[resolvedNextIndex];
    if (!nextUri) {
      commitQueue(null);
      return;
    }

    commitQueue({
      ...activeQueue,
      currentIndex: resolvedNextIndex,
      repeatMode,
      hasRepeatedCurrentTrack: false,
    });
    pendingNextUri.current = nextUri;
  }, [commitQueue]);

  const handleEndedRespawned = useCallback(() => {
    const nextUri = pendingNextUri.current;
    if (!nextUri) return;

    pendingNextUri.current = null;
    const currentRoute = playbackQueue.current?.currentRoute;
    void audioEngine.load(nextUri).catch(error => {
      console.error('[Audio] Could not play next queued track', {
        currentRoute,
        uri: nextUri,
        error,
      });
    });
  }, []);

  useEffect(() => {
    // Defer the synchronous directory scan until after the first render.
    const timer = setTimeout(() => {
      void maintainAudioCache();
    }, 1_000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const { currentUri, currentTime, isPlaying } = playback;
    if (!currentUri || isRestoring) return;

    const last = lastSavedPosition.current;
    const now = Date.now();
    const trackChanged = last.uri !== currentUri;
    const pausedAfterProgress =
      !isPlaying && Math.abs(currentTime - last.seconds) >= 0.25;

    if (
      !trackChanged &&
      !pausedAfterProgress &&
      now - last.at < POSITION_SAVE_INTERVAL_MS
    ) {
      return;
    }

    lastSavedPosition.current = {
      uri: currentUri,
      seconds: currentTime,
      at: now,
    };
    void savePlaybackPosition(currentUri, currentTime);
  }, [playback, isRestoring]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'background' && state !== 'inactive') return;

      // The queue is still null while restoring, so this would erase it.
      if (isRestoring) return;

      const snapshot = audioEngine.getSnapshot();
      if (snapshot.currentUri) {
        void savePlaybackPosition(snapshot.currentUri, snapshot.currentTime);
      }
      persistSession(playbackQueue.current);
    });

    return () => subscription.remove();
  }, [persistSession, isRestoring]);

  async function playTrack(uri: string, context: PlaybackContext) {
    pendingNextUri.current = null;
    const requestedQueue = context.queue.includes(uri) ? context.queue : [uri];
    const currentIndex = requestedQueue.indexOf(uri);
    const queue = requestedQueue.slice(currentIndex);
    commitQueue({
      currentRoute: context.currentRoute,
      queue,
      repeatMode: 'off',
      hasRepeatedCurrentTrack: false,
      order: [...queue],
      currentIndex: 0,
      isShuffling: false,
    });

    try {
      if (playback.currentUri === uri) {
        if (!playback.isPlaying) {
          await audioEngine.play();
          return;
        }

        switch (preferences.currentPlayingTapBehavior) {
          case 'pause':
            audioEngine.pause();
            break;
          case 'start-over':
            await audioEngine.startOver();
            break;
          case 'none':
            break;
        }
        return;
      }

      audioEngine.stop();
      await audioEngine.load(uri);
    } catch (error) {
      console.error('[Audio] Failed to play track', { uri, error });
    }
  }

  async function playQueueTrackAt(index: number) {
    pendingNextUri.current = null;
    const activeQueue = playbackQueue.current;
    const uri = activeQueue?.order[index];
    if (!activeQueue || !uri) return;

    const repeatMode =
      activeQueue.repeatMode === 'one' ? 'off' : activeQueue.repeatMode;
    commitQueue({
      ...activeQueue,
      currentIndex: index,
      repeatMode,
      hasRepeatedCurrentTrack: false,
    });
    try {
      await audioEngine.load(uri);
    } catch (error) {
      console.error('[Audio] Could not play queued track', {
        currentRoute: activeQueue.currentRoute,
        uri,
        error,
      });
    }
  }

  async function playPrevious() {
    if (audioEngine.getCurrentTime() >= 3) {
      await audioEngine.startOver();
      return;
    }

    const activeQueue = playbackQueue.current;
    if (!activeQueue || activeQueue.currentIndex === 0) {
      await audioEngine.startOver();
      return;
    }

    await playQueueTrackAt(activeQueue.currentIndex - 1);
  }

  async function playNext() {
    const activeQueue = playbackQueue.current;
    if (!activeQueue) return;

    const nextIndex = activeQueue.currentIndex + 1;
    if (nextIndex < activeQueue.order.length) {
      await playQueueTrackAt(nextIndex);
    } else if (activeQueue.repeatMode === 'all') {
      await playQueueTrackAt(0);
    }
  }

  function toggleShuffle() {
    const activeQueue = playbackQueue.current;
    if (!activeQueue) return;

    const currentUri = activeQueue.order[activeQueue.currentIndex];
    if (!currentUri) return;
    const originalIndex = activeQueue.queue.indexOf(currentUri);
    if (originalIndex < 0) return;
    if (activeQueue.isShuffling) {
      commitQueue({
        ...activeQueue,
        order: [...activeQueue.queue],
        currentIndex: Math.max(0, originalIndex),
        isShuffling: false,
      });
      return;
    }

    const currentIndex = Math.max(0, originalIndex);
    const order = [
      ...activeQueue.queue.slice(0, currentIndex),
      currentUri,
      ...shuffledCopy(activeQueue.queue.slice(currentIndex + 1)),
    ];
    commitQueue({
      ...activeQueue,
      order,
      currentIndex,
      isShuffling: true,
    });
  }

  function toggleLoop() {
    const activeQueue = playbackQueue.current;
    if (!activeQueue) return;

    const nextRepeatMode: RepeatMode =
      activeQueue.repeatMode === 'off'
        ? 'one'
        : activeQueue.repeatMode === 'one'
          ? 'all'
          : 'off';
    commitQueue({
      ...activeQueue,
      repeatMode: nextRepeatMode,
      hasRepeatedCurrentTrack: false,
    });
  }

  async function togglePlayback() {
    await audioEngine.togglePlayback();
  }

  function pause() {
    audioEngine.pause();
  }

  return (
    <AudioReactContext.Provider
      value={{
        currentUri: playback.currentUri,
        isPlaying: playback.isPlaying,
        isLoading: playback.isLoading,
        positionSeconds: playback.currentTime,
        durationSeconds: playback.duration,
        seekTo: audioEngine.seekTo,
        playTrack,
        playPrevious,
        playNext,
        queueUris: playbackQueue.current?.order ?? [],
        queueIndex: playbackQueue.current?.currentIndex ?? -1,
        playQueueTrackAt,
        isShuffling,
        repeatMode,
        toggleShuffle,
        toggleLoop,
        togglePlayback,
        pause,
      }}
    >
      <StreamingAudio
        onEnded={handleTrackEnded}
        onEndedRespawned={handleEndedRespawned}
      />
      {children}
    </AudioReactContext.Provider>
  );
}
