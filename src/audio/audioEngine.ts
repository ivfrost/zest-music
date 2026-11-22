import * as Crypto from 'expo-crypto';
import { type Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  AudioContext,
  AudioManager,
  type AudioDeviceList,
  type AudioTagHandle,
  getAudioDuration,
  type MediaElementAudioSourceNode,
} from 'react-native-audio-api';
import {
  closeSafFileDescriptor,
  openSafFileDescriptor,
} from '../../modules/saf-file-descriptor';
import {
  getCacheDirectory,
  maintainAudioCache,
  PARTIAL_SUFFIX,
  touchCacheEntry,
} from './audioCache';

/** Output categories that are the phone itself. Everything else is external. */
const BUILT_IN_OUTPUTS = new Set(['Built-in Speaker', 'Built-in Earpiece']);

interface PlaybackState {
  /** The library URI (often a SAF content:// URI) shown in the UI. */
  currentUri: string | null;
  /** The playable local URI handed to the native Audio element. */
  sourceUri: string | null;
  /** Bumped to rebuild the native source node for the same `sourceUri`. */
  sourceGeneration: number;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
}

/**
 * Plays audio through react-native-audio-api's Audio element, routed through
 * the equalizer graph.
 *
 * The native file source only accepts filesystem paths. A SAF `content://` URI
 * is opened as a file descriptor and played through `/proc/self/fd/<fd>` when
 * the provider allows it. Otherwise the engine copies it into the cache once. Audio
 * streams instead of decoding in full, so long and large files stay playable
 * without a large memory footprint.
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
    sourceGeneration: 0,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
  };
  /** Cached so `useSyncExternalStore` sees a stable object between ticks. */
  private sourceSnapshot: {
    uri: string;
    generation: number;
  } | null = null;
  private listeners = new Set<() => void>();
  private readonly playedListeners = new Set<(uri: string) => void>();
  private readonly cacheJobs = new Map<string, Promise<string>>();
  /** Durations already probed while validating a descriptor source. */
  private readonly knownDurations = new Map<string, number>();
  private playReported = false;
  private pendingStartAt = 0;
  private autoplayOnLoad = true;
  /** Open SAF descriptor for the current track, if the provider supplied one. */
  private fdHandle: number | null = null;
  /**
   * A descriptor path is only accepted after the native decoder can read it.
   * When it cannot, copies remain the only playable source.
   */
  private fdSourceStatus: 'unknown' | 'usable' | 'unusable' = 'unknown';
  /** In-flight output restart, shared by every recovery trigger. */
  private outputRestart: Promise<void> | null = null;
  /** Outputs other than the phone's own speaker/earpiece, by device id. */
  private externalOutputs = new Set<string>();
  /** Serializes device snapshots so overlapping route events compare cleanly. */
  private deviceRefresh: Promise<void> = Promise.resolve();

  constructor() {
    this.eq = this.audioContext.createBiquadFilter();
    this.eq.type = 'peaking';
    this.eq.frequency.value = 1000;
    this.eq.Q.value = 1;
    this.eq.gain.value = 0;
    this.eq.connect(this.audioContext.destination);

    // The native output driver stops rendering when its AAudio stream dies
    // (device removal, USB DAC suspend, OS mutation of the stream) and reports
    // it here. No `Audio` event fires for this, so without a resume the graph
    // stays silent while the UI keeps showing playback.
    this.audioContext.onerror = () => {
      console.warn('[Audio] Output stream failed, restarting');
      void this.restartOutput();
    };

    // Route changes (headphones, USB DACs, speaker handoff) can also leave the
    // driver stopped. Resuming is a no-op while it is healthy.
    AudioManager.addSystemEventListener('routeChange', event => {
      if (__DEV__) console.info('[Audio] Output route changed', event.reason);
      void this.restartOutput();
      this.trackOutputDevices(event.reason);
    });

    void this.trackOutputDevices();
  }

  /**
   * Pauses when the last external output disappears, so unplugging headphones
   * does not keep playing through the phone speaker. Plugging a device in does
   * not interrupt playback, and the native stream follows the new route.
   */
  private trackOutputDevices(reason?: string) {
    this.deviceRefresh = this.deviceRefresh
      .then(async () => {
        let outputs: AudioDeviceList;
        try {
          outputs = (await AudioManager.getDevicesInfo()).availableOutputs;
        } catch (error) {
          if (__DEV__) {
            console.warn('[Audio] Could not read output devices', error);
          }
          return;
        }

        if (Platform.OS === 'ios') {
          // AVAudioSession reports losing the active route as this reason.
          if (reason === 'OldDeviceUnavailable' && this.state.isPlaying) {
            console.info('[Audio] Output route lost, pausing');
            this.releaseOutputFocus();
            this.pause();
          }
          return;
        }

        const external = new Set(
          outputs
            .filter(output => !BUILT_IN_OUTPUTS.has(output.category))
            .map(output => output.id),
        );
        const lostLastExternal =
          this.externalOutputs.size > 0 && external.size === 0;
        this.externalOutputs = external;

        if (lostLastExternal && this.state.isPlaying) {
          console.info('[Audio] External output disconnected, pausing');
          this.releaseOutputFocus();
          this.pause();
        }
      })
      .catch(error => {
        console.warn('[Audio] Could not update output devices', error);
      });
  }

  /** Reopens the native output stream after a driver failure or route change. */
  private async restartOutput(): Promise<void> {
    if (this.outputRestart) return this.outputRestart;

    this.outputRestart = this.audioContext
      .resume()
      .catch(error => {
        console.error('[Audio] Could not restart audio output', error);
      })
      .finally(() => {
        this.outputRestart = null;
      });

    return this.outputRestart;
  }

  /**
   * The engine requests audio focus when playback starts. Whichever app plays
   * next revokes a request made at launch, and the engine never re-requests it,
   * leaving playback without focus.
   */
  private requestOutputFocus() {
    try {
      AudioManager.observeAudioInterruptions('gain');
    } catch (error) {
      console.warn('[Audio] Could not request audio focus', error);
    }
  }

  private releaseOutputFocus() {
    try {
      AudioManager.observeAudioInterruptions(false);
    } catch (error) {
      console.warn('[Audio] Could not release audio focus', error);
    }
  }

  getSnapshot = (): PlaybackState => this.state;

  getSource = () => this.sourceSnapshot;

  getKnownDuration = (sourceUri: string): number | undefined =>
    this.knownDurations.get(sourceUri);

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
    const previous = this.state;
    const next = { ...previous, ...partial };

    if (
      next.currentUri === previous.currentUri &&
      next.sourceUri === previous.sourceUri &&
      next.sourceGeneration === previous.sourceGeneration &&
      next.isPlaying === previous.isPlaying &&
      next.isLoading === previous.isLoading &&
      next.currentTime === previous.currentTime &&
      next.duration === previous.duration
    ) {
      return;
    }

    this.state = next;
    if (
      next.sourceUri !== previous.sourceUri ||
      next.sourceGeneration !== previous.sourceGeneration
    ) {
      this.sourceSnapshot = next.sourceUri
        ? { uri: next.sourceUri, generation: next.sourceGeneration }
        : null;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Prepares a track and starts it. With `announce: false`, the current track
   * stays on screen until this one is ready. This avoids flicker when a queued
   * file is gone.
   */
  async load(
    uri: string,
    options: {
      autoplay?: boolean;
      startAtSeconds?: number;
      announce?: boolean;
    } = {},
  ) {
    const { autoplay = true, startAtSeconds = 0, announce = true } = options;
    const loadId = ++this.loadId;
    this.endedNaturally = false;
    this.playReported = false;
    this.pendingStartAt = Math.max(0, startAtSeconds);
    this.autoplayOnLoad = autoplay;
    this.releaseSource();
    if (announce) {
      this.update({
        currentUri: uri,
        sourceUri: null,
        isPlaying: false,
        isLoading: true,
        currentTime: this.pendingStartAt,
        duration: 0,
      });
    }

    try {
      const sourceUri = await this.resolveSource(uri);
      if (loadId !== this.loadId) return;
      this.update({ currentUri: uri, sourceUri });
    } catch (error) {
      if (loadId !== this.loadId) return;
      if (announce) {
        console.error('[Audio] Could not prepare track', { uri, error });
        this.update({ currentUri: null, isPlaying: false, isLoading: false });
      }
      throw error;
    }
  }

  /** The Audio element calls this once its file source is ready. */
  handleLoaded = (handle: AudioTagHandle | null) => {
    if (!handle) return;
    this.handle = handle;

    if (!this.mediaSource) {
      try {
        this.mediaSource = this.audioContext.createMediaElementSource(handle);
        this.mediaSource.connect(this.eq);
      } catch (error) {
        console.error('[Audio] Could not route audio through equalizer', error);
      }
    }

    if (this.pendingStartAt > 0) {
      handle.seekToTime(this.pendingStartAt);
      this.update({ currentTime: this.pendingStartAt });
      this.pendingStartAt = 0;
    }

    if (this.autoplayOnLoad) {
      this.update({ isPlaying: true, isLoading: false });
      this.requestOutputFocus();
      handle.play();
    } else {
      this.update({ isPlaying: false, isLoading: false });
    }
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

    // Guard a duplicate `ended` until the queue advances, and drop the old
    // adapter so the next source is routed through the equalizer.
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
    this.releaseOutputFocus();
    this.update({ isPlaying: false, isLoading: false });
  };

  async play() {
    // Replaying an ended track must be able to end again and advance the queue.
    this.endedNaturally = false;
    if (!this.handle) {
      // Still preparing the source: play once it loads.
      if (this.state.isLoading) {
        this.autoplayOnLoad = true;
        this.update({ isPlaying: true });
      }
      return;
    }

    this.requestOutputFocus();
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
    this.releaseOutputFocus();
    this.handle?.pause();
    this.handle?.seekToTime(0);
    this.releaseSource();
    this.releaseFileDescriptor();
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
    this.endedNaturally = false;
    this.pendingStartAt = 0;
    this.requestOutputFocus();

    if (!this.handle) {
      // Still preparing the source: start from zero once it loads.
      if (this.state.isLoading) {
        this.autoplayOnLoad = true;
        this.update({ isPlaying: true, currentTime: 0 });
      }
      return;
    }

    this.handle.seekToTime(0);
    this.handle.play();
    this.update({ isPlaying: true, currentTime: 0 });
  }

  /**
   * Restarts the current track by rebuilding its native source node from the
   * already-resolved path. An ended node is disabled and its decoder stopped, so
   * it cannot be rewound in place. This avoids re-opening the SAF descriptor or
   * re-running the cache lookup that a full `load()` would do.
   */
  replay(): boolean {
    if (!this.state.sourceUri) return false;

    this.loadId += 1;
    this.endedNaturally = false;
    this.playReported = false;
    this.pendingStartAt = 0;
    this.autoplayOnLoad = true;
    this.releaseSource();
    this.update({
      sourceGeneration: this.state.sourceGeneration + 1,
      isPlaying: false,
      isLoading: true,
      currentTime: 0,
    });
    return true;
  }

  private releaseSource() {
    this.handle = null;
    // The Audio element owns and disposes its file source. Dropping the
    // reference lets the next onLoad build a fresh media-element source.
    this.mediaSource = null;
  }

  /**
   * Picks the cheapest playable source for a track: an open descriptor when the
   * native decoder can read it, otherwise a cached copy. Never throws.
   */
  private async resolveSource(uri: string): Promise<string> {
    if (uri.startsWith('content://') && this.fdSourceStatus !== 'unusable') {
      const descriptor = await openSafFileDescriptor(uri);
      if (descriptor) {
        const sourceUri = `file://${descriptor.path}`;
        const usable = await this.canPlayDescriptor(sourceUri, descriptor.size);
        if (usable) {
          const previous = this.fdHandle;
          this.fdHandle = descriptor.handle;
          this.fdSourceStatus = 'usable';
          if (previous != null) void closeSafFileDescriptor(previous);
          return sourceUri;
        }

        this.fdSourceStatus = 'unusable';
        await closeSafFileDescriptor(descriptor.handle);
      }
    }

    return this.cacheSource(uri);
  }

  /**
   * The decoder accepts a path, but a SAF descriptor is not always a regular
   * file. Probing it before playback prevents a silent, permanently loading
   * track when the provider exposes a pipe instead.
   */
  private async canPlayDescriptor(
    sourceUri: string,
    size: number,
  ): Promise<boolean> {
    if (size <= 0) return false;

    try {
      const duration = await getAudioDuration(sourceUri);
      if (!Number.isFinite(duration) || duration <= 0) return false;
      this.knownDurations.set(sourceUri, duration);
      return true;
    } catch (error) {
      if (__DEV__) {
        console.warn('[Audio] SAF descriptor is not playable, using cache', {
          sourceUri,
          size,
          error,
        });
      }
      return false;
    }
  }

  private releaseFileDescriptor() {
    const handle = this.fdHandle;
    this.fdHandle = null;
    if (handle != null) void closeSafFileDescriptor(handle);
  }

  /**
   * Warms the cache for a track that will likely play next. This never throws.
   * Once descriptors work there is nothing to copy, so this becomes a no-op.
   */
  async prefetch(uri: string): Promise<void> {
    if (this.fdSourceStatus === 'usable') return;

    try {
      await this.cacheSource(uri);
    } catch (error) {
      if (__DEV__)
        console.warn('[Audio] Could not prefetch track', { uri, error });
    }
  }

  /**
   * Resolves a playable local URI, sharing one copy between concurrent callers
   * so prefetch and a fast skip cannot duplicate the same SAF read.
   */
  private cacheSource(uri: string): Promise<string> {
    if (!uri.startsWith('content://')) return Promise.resolve(uri);

    const existing = this.cacheJobs.get(uri);
    if (existing) return existing;

    const job = this.prepareCache(uri).finally(() => {
      if (this.cacheJobs.get(uri) === job) this.cacheJobs.delete(uri);
    });
    this.cacheJobs.set(uri, job);
    return job;
  }

  private async prepareCache(uri: string): Promise<string> {
    const directory = getCacheDirectory();
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true });
    }

    // Keyed on the URI alone so a cached copy is still findable once its source
    // disappears, e.g. after its folder is removed from the library.
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      uri,
    );
    const key = hash.slice(0, 32);

    const source = new File(uri);
    let expectedSize = 0;
    try {
      expectedSize = source.size;
    } catch {
      // Some providers cannot report a size. Fall back to checking for emptiness.
    }

    const cached = this.findCachedFile(directory, key);
    if (cached && this.isUsableCacheFile(cached, expectedSize)) {
      void touchCacheEntry(cached);
      return cached.uri;
    }
    if (cached) {
      // A truncated copy used to be reused forever, stalling playback at 0:00.
      try {
        cached.delete();
      } catch (error) {
        console.warn('[Audio] Could not discard broken cache entry', {
          name: cached.name,
          error,
        });
      }
    }

    // Keep only a safe extension: the source name can contain characters that
    // are illegal in a file:// URI (e.g. "&", "[", "]"), and it may already be
    // percent-encoded.
    const extension = /\.[A-Za-z0-9]{1,8}$/.exec(source.name ?? '')?.[0] ?? '';
    const destination = new File(directory, `${key}${extension}`);
    const partial = new File(directory, `${key}${extension}${PARTIAL_SUFFIX}`);

    if (__DEV__) console.info('[Audio] Caching track for streaming', { uri });
    try {
      if (partial.exists) partial.delete();
      await source.copy(partial);

      const size = partial.size;
      if (size <= 0 || (expectedSize > 0 && size !== expectedSize)) {
        throw new Error(
          `Incomplete cache copy: ${size} of ${expectedSize} bytes`,
        );
      }

      // Move only once complete, so a lookup can never observe a partial file.
      await partial.move(destination, { overwrite: true });
    } catch (error) {
      try {
        if (partial.exists) partial.delete();
      } catch {
        // Maintenance removes stale partial files if this also fails.
      }
      throw error;
    }

    if (__DEV__)
      console.info('[Audio] Cached track', { sourceUri: destination.uri });
    void touchCacheEntry(destination);
    void maintainAudioCache({ pinnedName: destination.name });

    return destination.uri;
  }

  private isUsableCacheFile(file: File, expectedSize: number): boolean {
    try {
      const size = file.size;
      if (size <= 0) return false;
      return expectedSize <= 0 || size === expectedSize;
    } catch {
      return false;
    }
  }

  /** Cached names are `<uri hash><extension>`, so match on the hash prefix. */
  private findCachedFile(directory: Directory, key: string): File | null {
    for (const entry of directory.list()) {
      if (!(entry instanceof File)) continue;
      if (entry.name.endsWith(PARTIAL_SUFFIX)) continue;
      if (entry.name.startsWith(key)) return entry;
    }
    return null;
  }
}

export const audioEngine = new AudioEngine();
