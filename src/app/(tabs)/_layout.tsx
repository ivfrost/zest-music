import { router, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { getCurrentTrackInfo, getSongDisplayInfo } from '@/audio/trackHelpers';
import { FullPlayer } from '@/components/player/FullPlayer';
import { MiniPlayer, MiniPlayerContent } from '@/components/player/MiniPlayer';
import { SearchOverlay } from '@/components/SearchOverlay';
import { TabBarContext } from '@/context/TabBarContext';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { radius } from '@/theme';
import {
  MINI_PLAYER_GAP,
  MINI_PLAYER_HEIGHT,
  TAB_BAR_HEIGHT,
} from '@/lib/layout';

export default function TabsLayout() {
  const [isTabBarHidden, setIsTabBarHidden] = useState(false);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const pathname = usePathname();
  const { vars: themeVars, colors, rippleColor } = useMaterialTheme();
  const path = pathname.replace(/\/$/, '') || '/';
  const {
    isPlaying,
    isLoading,
    isShuffling,
    repeatMode,
    currentUri,
    durationSeconds,
    seekTo,
    togglePlayback,
    toggleShuffle,
    toggleLoop,
    playPrevious,
    playNext,
    queueUris,
    queueIndex,
    playQueueTrackAt,
  } = useAudio();
  const { songs, artistNameById, releaseById, removedNowPlaying } =
    useMusicLocations();
  const { currentSong, currentTitle, currentArtist } = useMemo(
    () => getCurrentTrackInfo(songs, currentUri, artistNameById, isLoading),
    [songs, currentUri, artistNameById, isLoading],
  );
  const currentArtworkUri = useMemo(
    () =>
      currentSong
        ? (releaseById.get(currentSong.releaseId)?.artworkUri ?? null)
        : null,
    [currentSong, releaseById],
  );
  // A removed folder no longer contains the playing track, so its captured data
  // stands in for the library lookup until playback moves on.
  const playingTitle = removedNowPlaying?.title ?? currentTitle;
  const playingArtist = removedNowPlaying?.artist ?? currentArtist;
  const playingArtistLinks = useMemo(() => {
    if (removedNowPlaying || !currentSong) return [];
    return currentSong.artistIds.flatMap(artistId => {
      const name = artistNameById.get(artistId);
      return name ? [{ id: artistId, name }] : [];
    });
  }, [currentSong, artistNameById, removedNowPlaying]);
  const playingArtworkUri = removedNowPlaying?.artworkUri ?? currentArtworkUri;
  const hasTrack = Boolean(currentUri || removedNowPlaying);
  const queueTracks = useMemo(() => {
    if (queueUris.length === 0) return [];
    const songByUri = new Map(songs.map(song => [song.uri, song]));
    return queueUris.slice(queueIndex + 1).flatMap((uri, index) => {
      const song = songByUri.get(uri);
      if (!song) return [];
      const displayInfo = getSongDisplayInfo(song, artistNameById);
      return [
        {
          queueIndex: queueIndex + index + 1,
          uri,
          title: displayInfo.title,
          artist: displayInfo.artist,
          artworkUri: releaseById.get(song.releaseId)?.artworkUri ?? null,
          durationSeconds: song.duration,
        },
      ];
    });
  }, [queueUris, queueIndex, songs, artistNameById, releaseById]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const expandedProgress = useSharedValue(0);

  const openArtist = useCallback(
    (artistId: string) => {
      expandedProgress.value = withTiming(0, { duration: 220 }, finished => {
        if (finished) scheduleOnRN(setIsPlayerExpanded, false);
      });
      router.push({ pathname: '/artists/[id]', params: { id: artistId } });
    },
    [expandedProgress],
  );
  // Docked island above the tab bar: narrower gutter than the content cards
  // so it reads as chrome, but the same rounded-container language.
  const miniPlayerBottom =
    insets.bottom + (isTabBarHidden ? 0 : TAB_BAR_HEIGHT) + MINI_PLAYER_GAP;
  const miniPlayerTop = Math.max(
    0,
    layoutHeight - miniPlayerBottom - MINI_PLAYER_HEIGHT,
  );

  const playerAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, expandedProgress.value));

    return {
      position: 'absolute',
      top: interpolate(progress, [0, 1], [miniPlayerTop, 0]),
      right: interpolate(progress, [0, 1], [8, 0]),
      height: Math.max(
        MINI_PLAYER_HEIGHT,
        interpolate(progress, [0, 1], [MINI_PLAYER_HEIGHT, layoutHeight]),
      ),
      left: interpolate(progress, [0, 1], [8, 0]),
      borderRadius: interpolate(progress, [0, 1], [radius.lg, 0]),
      overflow: 'hidden',
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        [colors.surfaceContainer, colors.background],
      ),
    };
  });
  const playerContentAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, expandedProgress.value));
    return {
      opacity: interpolate(progress, [0, 0.35, 1], [1, 0, 0]),
    };
  });
  const fullPlayerContentAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, expandedProgress.value));
    return {
      opacity: interpolate(progress, [0, 0.55, 1], [0, 0, 1]),
    };
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => {
          if (!currentUri) return false;
          if (gesture.x0 >= windowWidth - 32) return false;
          if (!isPlayerExpanded) {
            return (
              gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
            );
          }

          return gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
        },
        onPanResponderMove: (_event, gesture) => {
          const travelDistance = Math.max(
            1,
            layoutHeight - miniPlayerBottom - MINI_PLAYER_HEIGHT,
          );
          expandedProgress.value = isPlayerExpanded
            ? Math.max(0, 1 - gesture.dy / travelDistance)
            : Math.min(1, Math.max(0, -gesture.dy / travelDistance));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (isPlayerExpanded) {
            if (gesture.dy > 72 || gesture.vy > 0.65) {
              expandedProgress.value = withTiming(
                0,
                { duration: 220 },
                finished => {
                  if (finished) runOnJS(setIsPlayerExpanded)(false);
                },
              );
            } else {
              expandedProgress.value = withTiming(1, { duration: 240 });
            }
            return;
          }

          if (gesture.dy < -72 || gesture.vy < -0.65) {
            expandedProgress.value = withTiming(1, { duration: 240 });
            setIsPlayerExpanded(true);
          } else {
            expandedProgress.value = withTiming(0, { duration: 160 });
          }
        },
        onPanResponderTerminate: () => {
          expandedProgress.value = withTiming(isPlayerExpanded ? 1 : 0, {
            duration: 180,
          });
        },
      }),
    [
      currentUri,
      expandedProgress,
      isPlayerExpanded,
      layoutHeight,
      miniPlayerBottom,
      windowWidth,
    ],
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || !isPlayerExpanded) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        expandedProgress.value = withTiming(0, { duration: 220 }, finished => {
          if (finished) scheduleOnRN(setIsPlayerExpanded, false);
        });
        return true;
      },
    );

    return () => subscription.remove();
  }, [expandedProgress, isPlayerExpanded]);

  return (
    <View
      onLayout={event => setLayoutHeight(event.nativeEvent.layout.height)}
      style={[themeVars, { flex: 1 }]}
    >
      <TabBarContext
        value={{
          setIsTabBarHidden,
        }}
      >
        <View className="flex-1">
          <NativeTabs hidden={isTabBarHidden}>
            {Platform.OS === 'ios' ? (
              <NativeTabs.BottomAccessory>
                <MiniPlayer
                  title={hasTrack ? playingTitle : 'Nothing playing'}
                  artist={hasTrack ? playingArtist : 'Choose a song to start'}
                  artworkUri={playingArtworkUri}
                  isPlaying={isPlaying}
                  isLoading={isLoading}
                  hasTrack={hasTrack}
                  onToggle={togglePlayback}
                  onSearch={() => setIsSearchOpen(true)}
                  iconColor={colors.onSurface}
                  rippleColor={rippleColor}
                />
              </NativeTabs.BottomAccessory>
            ) : null}
            <NativeTabs.Trigger name="(artists)" accessibilityLabel="Artists">
              <NativeTabs.Trigger.Label>Artists</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'person', selected: 'person' }}
              />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="songs" accessibilityLabel="Songs">
              <NativeTabs.Trigger.Label>Songs</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'music_note', selected: 'music_note' }}
              />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="albums" accessibilityLabel="Albums">
              <NativeTabs.Trigger.Label>Albums</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'album', selected: 'album' }}
              />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="playlists" accessibilityLabel="Playlists">
              <NativeTabs.Trigger.Label>Playlists</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'queue_music', selected: 'queue_music' }}
              />
            </NativeTabs.Trigger>
            {__DEV__ ? (
              <NativeTabs.Trigger name="tests" accessibilityLabel="Tests">
                <NativeTabs.Trigger.Label>Tests</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                  md={{ default: 'science', selected: 'science' }}
                />
              </NativeTabs.Trigger>
            ) : null}
          </NativeTabs>
        </View>
      </TabBarContext>

      {Platform.OS === 'android' ? (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            {
              zIndex: 100,
            },
            playerAnimatedStyle,
          ]}
        >
          <Animated.View
            pointerEvents={isPlayerExpanded ? 'none' : 'auto'}
            style={[{ flex: 1 }, playerContentAnimatedStyle]}
          >
            <MiniPlayerContent
              title={hasTrack ? playingTitle : 'Nothing playing'}
              artist={hasTrack ? playingArtist : 'Choose a song to start'}
              artworkUri={playingArtworkUri}
              isPlaying={isPlaying}
              isLoading={isLoading}
              hasTrack={hasTrack}
              onToggle={togglePlayback}
              onSearch={() => setIsSearchOpen(true)}
              onExpand={() => {
                expandedProgress.value = withTiming(1, { duration: 240 });
                setIsPlayerExpanded(true);
              }}
              iconColor={colors.onSurface}
              rippleColor={rippleColor}
            />
          </Animated.View>
          <Animated.View
            pointerEvents={isPlayerExpanded ? 'auto' : 'none'}
            style={[
              {
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
              fullPlayerContentAnimatedStyle,
            ]}
          >
            <FullPlayer
              isExpanded={isPlayerExpanded}
              title={playingTitle}
              artist={playingArtist}
              artistLinks={playingArtistLinks}
              artworkUri={playingArtworkUri}
              trackKey={currentUri}
              artworkSize={Math.min(windowWidth - 64, layoutHeight * 0.44)}
              isPlaying={isPlaying}
              isLoading={isLoading}
              isShuffling={isShuffling}
              repeatMode={repeatMode}
              durationSeconds={durationSeconds}
              onShuffle={toggleShuffle}
              onLoop={toggleLoop}
              onPrevious={() => void playPrevious()}
              onToggle={() => void togglePlayback()}
              onNext={() => void playNext()}
              onSeek={seekTo}
              onOpenArtist={openArtist}
              queueTracks={queueTracks}
              onSelectQueueTrack={index => {
                void playQueueTrackAt(index);
              }}
              colors={colors}
              rippleColor={rippleColor}
            />
          </Animated.View>
        </Animated.View>
      ) : null}

      {isSearchOpen ? (
        <SearchOverlay
          initialScope={
            path === '/' || path.startsWith('/artists')
              ? 'artists'
              : path.startsWith('/albums')
                ? 'albums'
                : 'songs'
          }
          onClose={() => setIsSearchOpen(false)}
        />
      ) : null}
    </View>
  );
}
