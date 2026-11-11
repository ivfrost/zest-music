import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import {
  AudioContext,
  type AudioTagHandle,
  type MediaElementAudioSourceNode,
} from 'react-native-audio-api';
import {
  getCacheDirectory,
  maintainAudioCache,
  touchCacheEntry,
} from './audioCache';

interface PlaybackState {
  /** The library URI (often a SAF content:// URI) shown in the UI. */
  currentUri: string | null;
  /** The playable local URI handed to the native Audio element. */
  sourceUri: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
}

/**
 * Plays audio through react-native-audio-api's Audio element, routed through
 * the equalizer graph.
 *
 * The native file source only accepts filesystem paths, so SAF `content://`
 * URIs are copied into the cache once and streamed from there. Audio is
 * streamed rather than decoded in full, which keeps long and large files
 * playable without a large memory footprint.
 */
class AudioEngine {
  readonly audioContext = new AudioContext({ latencyHint: 'playback' });

  private readonly eq: ReturnType<AudioContext['createBiquadFilter']>;
  private handle: AudioTagHandle | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private loadId = 0;
  private endedNaturally = false;
  private state: PlaybackState = {
    currentUri: null,
    sourceUri: null,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
  };
  private listeners = new Set<() => void>();
  private readonly playedListeners = new Set<(uri: string) => void>();
  private playReported = false;
  private pendingStartAt = 0;
  private autoplayOnLoad = true;

  constructor() {
    this.eq = this.audioContext.createBiquadFilter();
    this.eq.type = 'peaking';
    this.eq.frequency.value = 1000;
    this.eq.Q.value = 1;
    this.eq.gain.value = 0;
    this.eq.connect(this.audioContext.destination);
  }

  getSnapshot = (): PlaybackState => this.state;

  getSource = (): string | null => this.state.sourceUri;

  getCurrentTime = (): number => this.state.currentTime;

  handlePositionChange = (seconds: number) => {
    if (Number.isFinite(seconds)) {
      this.update({ currentTime: Math.max(0, seconds) });
    }
  };

  handleDurationChange = (sourceUri: string, duration: number) => {
    if (
      this.state.sourceUri === sourceUri &&
      Number.isFinite(duration) &&
      duration > 0
    ) {
      // Starting this late would finish the track at once.
      if (this.pendingStartAt > 0 && this.pendingStartAt >= duration - 3) {
        this.pendingStartAt = 0;
        this.update({ duration, currentTime: 0 });
        return;
      }

      this.update({ duration });
    }
  };

  seekTo = (seconds: number) => {
    const maximum = this.state.duration > 0 ? this.state.duration : seconds;
    const currentTime = Math.max(0, Math.min(seconds, maximum));
    this.handle?.seekToTime(currentTime);
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Subscribe to the first actual start of playback for each loaded track.
   * Returns an unsubscribe function.
   */
  onTrackPlayed = (listener: (uri: string) => void) => {
    this.playedListeners.add(listener);
    return () => {
      this.playedListeners.delete(listener);
    };
  };

  private reportTrackPlayed() {
    if (this.playReported) return;

    const uri = this.state.currentUri;
    if (!uri) return;

    this.playReported = true;
    for (const listener of this.playedListeners) listener(uri);
  }

  private update(partial: Partial<PlaybackState>) {
    const next = { ...this.state, ...partial };

    if (
      next.currentUri === this.state.currentUri &&
      next.sourceUri === this.state.sourceUri &&
      next.isPlaying === this.state.isPlaying &&
      next.isLoading === this.state.isLoading &&
      next.currentTime === this.state.currentTime &&
      next.duration === this.state.duration
    ) {
      return;
    }

    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }

  async load(
    uri: string,
    options: { autoplay?: boolean; startAtSeconds?: number } = {},
  ) {
    const { autoplay = true, startAtSeconds = 0 } = options;
    const loadId = ++this.loadId;
    this.endedNaturally = false;
    this.playReported = false;
    this.pendingStartAt = Math.max(0, startAtSeconds);
    this.autoplayOnLoad = autoplay;
    this.releaseSource();
    this.update({
      currentUri: uri,
      sourceUri: null,
      isPlaying: false,
      isLoading: true,
      currentTime: this.pendingStartAt,
      duration: 0,
    });

    try {
      const sourceUri = await this.cacheSource(uri);
      if (loadId !== this.loadId) return;
      this.update({ sourceUri });
    } catch (error) {
      if (loadId !== this.loadId) return;
      console.error('[Audio] Could not prepare track', { uri, error });
      this.update({ currentUri: null, isPlaying: false, isLoading: false });
      throw error;
    }
  }

  /** Called by the Audio element once its file source is ready. */
  handleLoaded = (handle: AudioTagHandle | null): boolean => {
    if (!handle) return false;
    this.handle = handle;

    if (!this.mediaSource) {
      try {
        this.mediaSource = this.audioContext.createMediaElementSource(handle);
        this.mediaSource.connect(this.eq);
      } catch (error) {
        console.error('[Audio] Could not route audio through equalizer', error);
      }
    }

    if (this.endedNaturally) {
      this.endedNaturally = false;
      return true;
    }

    if (this.pendingStartAt > 0) {
      handle.seekToTime(this.pendingStartAt);
      this.update({ currentTime: this.pendingStartAt });
      this.pendingStartAt = 0;
    }

    if (this.autoplayOnLoad) {
      this.update({ isPlaying: true, isLoading: false });
      handle.play();
    } else {
      this.update({ isPlaying: false, isLoading: false });
    }
    return false;
  };

  handlePlayState = (isPlaying: boolean) => {
    this.update({ isPlaying });
    if (isPlaying) this.reportTrackPlayed();
  };

  handleLoading = (isLoading: boolean) => {
    this.update({ isLoading });
  };

  handleEnded = (): boolean => {
    if (this.endedNaturally) return false;

    // The library recreates the file source and fires onLoad after `ended`.
    // Mark it so handleLoaded leaves the respawned source paused, and drop the
    // old adapter so the new source gets routed through the equalizer.
    this.endedNaturally = true;
    this.playReported = false;
    this.mediaSource?.disconnect();
    this.mediaSource = null;
    this.handle?.seekToTime(0);
    this.update({ isPlaying: false, isLoading: false, currentTime: 0 });
    return true;
  };

  handleError = (error: Error) => {
    console.error('[Audio] Playback error', error);
    this.update({ isPlaying: false, isLoading: false });
  };

  async play() {
    if (!this.handle) {
      // Still preparing the source: play once it loads.
      if (this.state.isLoading) {
        this.autoplayOnLoad = true;
        this.update({ isPlaying: true });
      }
      return;
    }

    this.handle.play();
    this.update({ isPlaying: true });
  }

  pause() {
    this.handle?.pause();
    this.update({ isPlaying: false });
  }

  stop() {
    this.loadId += 1;
    this.playReported = false;
    this.handle?.pause();
    this.handle?.seekToTime(0);
    this.releaseSource();
    this.pendingStartAt = 0;
    this.update({
      currentUri: null,
      sourceUri: null,
      isPlaying: false,
      isLoading: false,
      currentTime: 0,
      duration: 0,
    });
  }

  async togglePlayback() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
  }

  async startOver() {
    this.handle?.seekToTime(0);
    this.handle?.play();
    this.update({ isPlaying: true, currentTime: 0 });
  }

  private releaseSource() {
    this.handle = null;
    // The Audio element owns and disposes its file source; dropping the
    // reference lets the next onLoad build a fresh media-element source.
    this.mediaSource = null;
  }

  private async cacheSource(uri: string): Promise<string> {
    if (!uri.startsWith('content://')) {
      return uri;
    }

    const directory = getCacheDirectory();
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true });
    }

    const source = new File(uri);
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${uri}:${source.size}`,
    );

    // Keep only a safe extension: the source name can contain characters that
    // are illegal in a file:// URI (e.g. "&", "[", "]"), and it may already be
    // percent-encoded.
    const extension = /\.[A-Za-z0-9]{1,8}$/.exec(source.name ?? '')?.[0] ?? '';
    const destination = new File(directory, `${hash.slice(0, 32)}${extension}`);

    if (!destination.exists) {
      if (__DEV__) console.info('[Audio] Caching track for streaming', { uri });
      await source.copy(destination);
      if (__DEV__) console.info('[Audio] Cached track', { sourceUri: destination.uri });
      void touchCacheEntry(destination);
      void maintainAudioCache({ pinnedName: destination.name });
    } else {
      void touchCacheEntry(destination);
    }

    return destination.uri;
  }
}

export const audioEngine = new AudioEngine();
