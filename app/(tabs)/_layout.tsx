import {
  Text as ComposeText,
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import { router, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
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
import { scheduleOnRN } from 'react-native-worklets';
import { getCurrentTrackInfo, getSongDisplayInfo } from '@/audio/trackHelpers';
import { FullPlayer } from '@/components/player/FullPlayer';
import { MiniPlayer, MiniPlayerContent } from '@/components/player/MiniPlayer';
import { SearchOverlay } from '@/components/SearchOverlay';
import { TabBarContext } from '@/context/TabBarContext';
import { useAudio } from '@/hooks/useAudio';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import {
  MINI_PLAYER_GAP,
  MINI_PLAYER_HEIGHT,
  TAB_BAR_HEIGHT,
} from '@/lib/layout';

const TAB_TITLES: Record<string, string> = {
  '/artists': 'Artists',
  '/songs': 'Songs',
  '/albums': 'Albums',
  '/playlists': 'Playlists',
  '/tests': 'Tests',
};

export default function TabsLayout() {
  const [isTabBarHidden, setIsTabBarHidden] = useState(false);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const pathname = usePathname();
  const { vars: themeVars, colors, rippleColor } = useMaterialTheme();
  const path = pathname.replace(/\/$/, '');
  const title = TAB_TITLES[path] ?? 'Artists';
  // Screens pushed inside a tab render their own stack header.
  const isTabRoot = path in TAB_TITLES;
  const {
    isPlaying,
    isLoading,
    isShuffling,
    repeatMode,
    currentUri,
    positionSeconds,
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
  const { songs, artistNameById, releaseById } = useMusicLocations();
  const { currentSong, currentTitle, currentArtist } = getCurrentTrackInfo(
    songs,
    currentUri,
    artistNameById,
    isLoading,
  );
  const currentArtworkUri = currentSong
    ? (releaseById.get(currentSong.releaseId)?.artworkUri ?? null)
    : null;
  const songByUri = new Map(songs.map(song => [song.uri, song]));
  const queueTracks = queueUris.slice(queueIndex + 1).flatMap((uri, index) => {
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
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const expandedProgress = useSharedValue(0);
  const dragX = useSharedValue(0);
  // With the native tab bar hidden the player drops to the safe-area edge.
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
      right: interpolate(progress, [0, 1], [6, 0]),
      height: Math.max(
        MINI_PLAYER_HEIGHT,
        interpolate(progress, [0, 1], [MINI_PLAYER_HEIGHT, layoutHeight]),
      ),
      left: interpolate(progress, [0, 1], [6, 0]),
      borderRadius: interpolate(progress, [0, 1], [20, 0]),
      shadowColor: '#000',
      shadowOpacity: interpolate(progress, [0, 1], [0.15, 0]),
      shadowRadius: interpolate(progress, [0, 1], [5, 0]),
      shadowOffset: { width: 0, height: 3 },
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        [colors.surfaceContainer, colors.background],
      ),
      transform: [{ translateX: dragX.value }],
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
          if (gesture.x0 >= windowWidth - 32) return false;
          if (!isPlayerExpanded) {
            return (
              gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
            );
          }

          const draggingLeft =
            gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
          const draggingDown =
            gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
          return draggingLeft || draggingDown;
        },
        onPanResponderMove: (_event, gesture) => {
          if (isPlayerExpanded && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            dragX.value = Math.min(0, gesture.dx);
          } else {
            const travelDistance = Math.max(
              1,
              layoutHeight - miniPlayerBottom - MINI_PLAYER_HEIGHT,
            );
            expandedProgress.value = isPlayerExpanded
              ? Math.max(0, 1 - gesture.dy / travelDistance)
              : Math.min(1, Math.max(0, -gesture.dy / travelDistance));
          }
        },
        onPanResponderRelease: (_event, gesture) => {
          if (isPlayerExpanded) {
            const draggingLeft = Math.abs(gesture.dx) > Math.abs(gesture.dy);
            if (draggingLeft) {
              if (gesture.dx < -windowWidth * 0.2 || gesture.vx < -0.75) {
                dragX.value = withTiming(
                  -windowWidth,
                  { duration: 220 },
                  finished => {
                    if (finished) {
                      dragX.value = 0;
                      expandedProgress.value = 0;
                      runOnJS(setIsPlayerExpanded)(false);
                    }
                  },
                );
              } else {
                dragX.value = withSpring(0);
              }
            } else if (gesture.dy > 72 || gesture.vy > 0.65) {
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
          dragX.value = withTiming(0, { duration: 160 });
          expandedProgress.value = withTiming(isPlayerExpanded ? 1 : 0, {
            duration: 180,
          });
        },
      }),
    [
      dragX,
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
        dragX.value = withTiming(0, { duration: 180 });
        expandedProgress.value = withTiming(0, { duration: 220 }, finished => {
          if (finished) scheduleOnRN(setIsPlayerExpanded, false);
        });
        return true;
      },
    );

    return () => subscription.remove();
  }, [dragX, expandedProgress, isPlayerExpanded]);

  return (
    <View
      onLayout={event => setLayoutHeight(event.nativeEvent.layout.height)}
      style={[themeVars, { flex: 1 }]}
    >
      {isTabRoot ? (
        <SafeAreaView
          edges={['top']}
          className="bg-background flex-row justify-between items-center px-4"
        >
          <View>
            <Text
              accessibilityRole="header"
              className="text-2xl font-medium text-on-surface"
            >
              {title}
            </Text>
          </View>
          <View className="rounded-2xl overflow-hidden">
            {Platform.OS === 'android' ? (
              <Host matchContents>
                <DropdownMenu
                  expanded={isMenuExpanded}
                  onDismissRequest={() => setIsMenuExpanded(false)}
                >
                  <DropdownMenu.Trigger>
                    <RNHostView matchContents>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open menu"
                        onPress={() => setIsMenuExpanded(true)}
                        className="p-3"
                        android_ripple={{
                          color: rippleColor,
                          borderless: false,
                        }}
                      >
                        <SymbolView
                          name={{
                            ios: 'info.circle',
                            android: 'more_vert',
                            web: 'info',
                          }}
                          tintColor={colors.onSurface}
                        />
                      </Pressable>
                    </RNHostView>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Items>
                    <DropdownMenuItem
                      onClick={() => {
                        setIsMenuExpanded(false);
                        router.push('/(settings)/settings');
                      }}
                    >
                      <DropdownMenuItem.Text>
                        <ComposeText>Settings</ComposeText>
                      </DropdownMenuItem.Text>
                    </DropdownMenuItem>
                  </DropdownMenu.Items>
                </DropdownMenu>
              </Host>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More information"
                className="p-3"
              >
                <SymbolView
                  name={{
                    ios: 'info.circle',
                    android: 'more_vert',
                    web: 'info',
                  }}
                  tintColor={colors.onSurface}
                />
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      ) : null}

      <TabBarContext value={{ setIsTabBarHidden }}>
        <View className="flex-1">
          <NativeTabs hidden={isTabBarHidden}>
            {Platform.OS === 'ios' && currentUri ? (
              <NativeTabs.BottomAccessory>
                <MiniPlayer
                  title={currentTitle}
                  artist={currentArtist}
                  artworkUri={currentArtworkUri}
                  isPlaying={isPlaying}
                  isLoading={isLoading}
                  onToggle={togglePlayback}
                  iconColor={colors.onSurface}
                  rippleColor={rippleColor}
                />
              </NativeTabs.BottomAccessory>
            ) : null}
            <NativeTabs.Trigger name="artists">
              <NativeTabs.Trigger.Label>Artists</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'person', selected: 'person' }}
              />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="songs">
              <NativeTabs.Trigger.Label>Songs</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'music_note', selected: 'music_note' }}
              />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="albums">
              <NativeTabs.Trigger.Label>Albums</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'album', selected: 'album' }}
              />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="playlists">
              <NativeTabs.Trigger.Label>Playlists</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                md={{ default: 'queue_music', selected: 'queue_music' }}
              />
            </NativeTabs.Trigger>
            {__DEV__ ? (
              <NativeTabs.Trigger name="tests">
                <NativeTabs.Trigger.Label>Tests</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                  md={{ default: 'science', selected: 'science' }}
                />
              </NativeTabs.Trigger>
            ) : null}
          </NativeTabs>
        </View>
      </TabBarContext>

      {Platform.OS === 'android' && currentUri ? (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            {
              zIndex: 100,
              elevation: 8,
            },
            playerAnimatedStyle,
          ]}
        >
          <Animated.View
            pointerEvents={isPlayerExpanded ? 'none' : 'auto'}
            style={[{ flex: 1 }, playerContentAnimatedStyle]}
          >
            <MiniPlayerContent
              title={currentTitle}
              artist={currentArtist}
              artworkUri={currentArtworkUri}
              isPlaying={isPlaying}
              isLoading={isLoading}
              onToggle={togglePlayback}
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
              title={currentTitle}
              artist={currentArtist}
              artworkUri={currentArtworkUri}
              trackKey={currentUri}
              artworkSize={Math.min(windowWidth - 64, layoutHeight * 0.44)}
              isPlaying={isPlaying}
              isLoading={isLoading}
              isShuffling={isShuffling}
              repeatMode={repeatMode}
              positionSeconds={positionSeconds}
              durationSeconds={durationSeconds}
              onShuffle={toggleShuffle}
              onLoop={toggleLoop}
              onPrevious={() => void playPrevious()}
              onToggle={() => void togglePlayback()}
              onNext={() => void playNext()}
              onSeek={seekTo}
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

      {isTabRoot && !isPlayerExpanded && !isSearchOpen && path !== '/tests' ? (
        <View
          style={{
            position: 'absolute',
            right: 16,
            bottom: miniPlayerBottom + 16 + (currentUri ? MINI_PLAYER_HEIGHT : 0),
            zIndex: 120,
            elevation: 18,
          }}
          className="h-14 w-14 overflow-hidden rounded-2xl"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search library"
            onPress={() => setIsSearchOpen(true)}
            android_ripple={{ color: rippleColor, borderless: true }}
            className="h-full w-full items-center justify-center bg-primary-container"
          >
            <SymbolView
              name={{
                ios: 'magnifyingglass',
                android: 'search',
                web: 'search',
              }}
              size={24}
              tintColor={colors.onPrimaryContainer}
            />
          </Pressable>
        </View>
      ) : null}

      {isSearchOpen ? (
        <SearchOverlay
          initialScope={
            path.startsWith('/artists')
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
