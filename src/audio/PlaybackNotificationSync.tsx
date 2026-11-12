import { useEffect, useMemo, useRef } from 'react';
import {
  AudioManager,
  PlaybackNotificationManager,
} from 'react-native-audio-api';
import { getSongDisplayInfo } from '@/audio/trackHelpers';
import { useAudio } from '@/hooks/useAudio';
import useMusicLocations from '@/hooks/useMusicLocation';

const PROGRESS_UPDATE_MS = 5000;

const CONTROLS = [
  'play',
  'pause',
  'stop',
  'nextTrack',
  'previousTrack',
  'seekTo',
] as const;

function enablePlaybackControls() {
  for (const control of CONTROLS) {
    void PlaybackNotificationManager.enableControl(control, true).catch(() => {});
  }
}

/**
 * Mirrors playback state into the system media notification.
 */
export function PlaybackNotificationSync() {
  const {
    currentUri,
    isPlaying,
    positionSeconds,
    durationSeconds,
    seekTo,
    playNext,
    playPrevious,
    togglePlayback,
  } = useAudio();
  const { songs, artistNameById, releaseById } = useMusicLocations();

  const currentSong = useMemo(
    () =>
      currentUri ? (songs.find(song => song.uri === currentUri) ?? null) : null,
    [songs, currentUri],
  );
  const release = currentSong
    ? (releaseById.get(currentSong.releaseId) ?? null)
    : null;
  const display = currentSong
    ? getSongDisplayInfo(currentSong, artistNameById)
    : null;

  // Long-lived native listeners read the latest state through refs.
  const positionRef = useRef(positionSeconds);
  positionRef.current = positionSeconds;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const togglePlaybackRef = useRef(togglePlayback);
  togglePlaybackRef.current = togglePlayback;
  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;
  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;
  const playPreviousRef = useRef(playPrevious);
  playPreviousRef.current = playPrevious;
  const wasPlayingBeforeInterruption = useRef(false);
  const controlsApplied = useRef(false);

  useEffect(() => {
    void AudioManager.requestNotificationPermissions().catch(() => {});
    AudioManager.observeAudioInterruptions('gain');
    AudioManager.setSystemOptions({
      ios: { category: 'playback', mode: 'default' },
    });

    enablePlaybackControls();
  }, []);

  useEffect(() => {
    const interruption = AudioManager.addSystemEventListener(
      'interruption',
      event => {
        if (event.type === 'began') {
          wasPlayingBeforeInterruption.current = isPlayingRef.current;
          if (isPlayingRef.current) void togglePlaybackRef.current();
        } else if (event.type === 'ended' && event.shouldResume) {
          if (wasPlayingBeforeInterruption.current && !isPlayingRef.current) {
            void togglePlaybackRef.current();
          }
        }
      },
    );

    const play = PlaybackNotificationManager.addEventListener(
      'playbackNotificationPlay',
      () => {
        if (!isPlayingRef.current) void togglePlaybackRef.current();
      },
    );
    const pause = PlaybackNotificationManager.addEventListener(
      'playbackNotificationPause',
      () => {
        if (isPlayingRef.current) void togglePlaybackRef.current();
      },
    );
    const stop = PlaybackNotificationManager.addEventListener(
      'playbackNotificationStop',
      () => {
        if (isPlayingRef.current) void togglePlaybackRef.current();
      },
    );
    const next = PlaybackNotificationManager.addEventListener(
      'playbackNotificationNextTrack',
      () => void playNextRef.current(),
    );
    const previous = PlaybackNotificationManager.addEventListener(
      'playbackNotificationPreviousTrack',
      () => void playPreviousRef.current(),
    );
    const seek = PlaybackNotificationManager.addEventListener(
      'playbackNotificationSeekTo',
      event => {
        seekToRef.current(event.value);
        // Push the new position back so the session/slider doesn't snap back.
        void PlaybackNotificationManager.show({
          elapsedTime: event.value,
        }).catch(() => {});
      },
    );

    return () => {
      interruption?.remove();
      play.remove();
      pause.remove();
      stop.remove();
      next.remove();
      previous.remove();
      seek.remove();
    };
  }, []);

  useEffect(() => {
    if (!currentUri) {
      controlsApplied.current = false;
      void PlaybackNotificationManager.hide().catch(() => {});
      return;
    }

    void PlaybackNotificationManager.show({
      title: display?.title ?? 'Unknown track',
      artist: display?.artist ?? 'Unknown Artist',
      album: release?.title,
      artwork: release?.artworkUri ?? undefined,
      duration: durationSeconds,
      elapsedTime: positionSeconds,
      state: isPlaying ? 'playing' : 'paused',
    })
      .then(() => {
        // Some Android versions only apply control flags once a session exists.
        if (!controlsApplied.current) {
          controlsApplied.current = true;
          enablePlaybackControls();
        }
      })
      .catch(error => {
        console.warn(
          '[PlaybackNotification] Could not update notification',
          error,
        );
      });
    // positionSeconds seeds the first frame only; ticking it would call show()
    // every second, so it is intentionally omitted from the dependencies.
  }, [
    currentUri,
    isPlaying,
    durationSeconds,
    display?.title,
    display?.artist,
    release?.title,
    release?.artworkUri,
  ]);

  useEffect(() => {
    if (!currentUri || !isPlaying) return;

    const interval = setInterval(() => {
      void PlaybackNotificationManager.show({
        elapsedTime: positionRef.current,
      }).catch(() => {});
    }, PROGRESS_UPDATE_MS);

    return () => clearInterval(interval);
  }, [currentUri, isPlaying]);

  return null;
}
