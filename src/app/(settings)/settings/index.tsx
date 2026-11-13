import { pickDirectory } from '@react-native-documents/picker';
import { SymbolView } from 'expo-symbols';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RowSeparator from '@/components/RowSeparator';
import { ICON_SIZES } from '@/hooks/materialPalette';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import useMusicLocations from '@/hooks/useMusicLocation';
import { usePreferences } from '@/hooks/usePreferences';
import type { MusicLocation } from '@/types/musicLocation';
import type { TapBehavior } from '@/types/preferences';

const TAP_OPTIONS: { value: TapBehavior; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'start-over', label: 'Start over' },
  { value: 'pause', label: 'Pause' },
];

/** Splits a tree URI into the folder name and the storage volume it lives on. */
function folderInfo(uri: string) {
  const treeMarker = '/tree/';
  const treeIndex = uri.indexOf(treeMarker);
  const raw = treeIndex >= 0 ? uri.slice(treeIndex + treeMarker.length) : uri;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Keep the raw segment when the URI is malformed.
  }

  const segments = decoded.replace(/\/+$/, '').split(/[/:]/);
  const name = segments[segments.length - 1] || decoded;
  const root = decoded.split('/')[0];
  const volume = root.includes(':') ? root.split(':')[0] : null;
  return { name, volume };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text className="mb-2 px-1 text-body-medium font-medium text-on-surface-variant">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { preferences, updatePreferences } = usePreferences();
  const {
    addLocation,
    isScanning,
    locations,
    removeLocation,
    scanningAction,
    scanningLocationUri,
    scanningSongTitle,
  } = useMusicLocations();
  const {
    colors,
    vars: themeVars,
    rippleColor,
    dividerColor,
  } = useMaterialTheme();
  const [isAdding, setIsAdding] = useState(false);
  const imagesDisabled = preferences.artistImages === 'off';

  const addMusicFolder = async () => {
    setIsAdding(true);
    try {
      const directory = await pickDirectory({ requestLongTermAccess: true });
      if (directory.uri) await addLocation({ uri: directory.uri });
    } catch (error) {
      console.error('Could not select music folder:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const confirmRemoveLocation = (location: MusicLocation, name: string) => {
    Alert.alert(
      'Remove folder from library?',
      `"${name}" will no longer be scanned and its songs will be removed from the app. The files stay on your device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeLocation(location).catch(error =>
              console.error('Could not remove music folder:', error),
            );
          },
        },
      ],
    );
  };

  return (
    <View style={[themeVars, { flex: 1 }]} className="bg-background">
      <SafeAreaView edges={['bottom']} className="flex-1">
        <ScrollView contentContainerClassName="px-4 py-4 pb-10">
          <View className="gap-6">
            <Section title="Playback">
              <View className="rounded-md3-xl bg-surface-container p-4">
                <Text className="text-body-large text-on-surface">
                  Tapping the current song
                </Text>
                <Text className="mt-1 text-body-medium text-on-surface-variant opacity-70">
                  Choose what happens when you tap the song that is already
                  playing.
                </Text>
                <View className="mt-4 flex-row gap-1">
                  {TAP_OPTIONS.map(option => {
                    const selected =
                      preferences.currentPlayingTapBehavior === option.value;
                    return (
                      <View
                        key={option.value}
                        className="flex-1 overflow-hidden rounded-md3-full"
                      >
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() =>
                            void updatePreferences({
                              currentPlayingTapBehavior: option.value,
                            })
                          }
                          android_ripple={{
                            color: rippleColor,
                            borderless: true,
                          }}
                          className={`items-center py-2 ${
                            selected ? 'bg-primary-container' : ''
                          }`}
                        >
                          <Text
                            numberOfLines={1}
                            className={`text-body-medium font-medium ${
                              selected
                                ? 'text-on-primary-container'
                                : 'text-on-surface-variant'
                            }`}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            </Section>

            <Section title="Artist images">
              <View className="overflow-hidden rounded-md3-xl bg-surface-container">
                <View className="flex-row items-center gap-4 px-4 py-3">
                  <View className="flex-1">
                    <Text className="text-body-large text-on-surface">
                      Show artist images
                    </Text>
                    <Text className="mt-0.5 text-body-medium text-on-surface-variant opacity-70">
                      Portraits from Wikimedia Commons
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Show artist images"
                    value={!imagesDisabled}
                    onValueChange={value =>
                      void updatePreferences({
                        artistImages: value ? 'wikimedia' : 'off',
                      })
                    }
                    trackColor={{
                      false: colors.surfaceContainerHigh,
                      true: colors.primary,
                    }}
                    thumbColor={
                      !imagesDisabled ? colors.onPrimary : colors.outline
                    }
                    ios_backgroundColor={colors.surfaceContainerHigh}
                  />
                </View>
                <RowSeparator dividerColor={dividerColor} />
                <View
                  className="flex-row items-center gap-4 px-4 py-3"
                  style={{ opacity: imagesDisabled ? 0.4 : 1 }}
                >
                  <View className="flex-1">
                    <Text className="text-body-large text-on-surface">
                      Deezer fallback
                    </Text>
                    <Text className="mt-0.5 text-body-medium text-on-surface-variant opacity-70">
                      Look up artists missing from Wikimedia. Sends their names
                      to Deezer.
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="Look up missing artists on Deezer"
                    disabled={imagesDisabled}
                    value={preferences.artistImageDeezerFallback}
                    onValueChange={value =>
                      void updatePreferences({
                        artistImageDeezerFallback: value,
                      })
                    }
                    trackColor={{
                      false: colors.surfaceContainerHigh,
                      true: colors.primary,
                    }}
                    thumbColor={
                      preferences.artistImageDeezerFallback
                        ? colors.onPrimary
                        : colors.outline
                    }
                    ios_backgroundColor={colors.surfaceContainerHigh}
                  />
                </View>
              </View>
            </Section>

            <Section title="Library">
              <View className="overflow-hidden rounded-md3-xl bg-surface-container">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add music folder"
                  disabled={isAdding}
                  onPress={() => void addMusicFolder()}
                  android_ripple={{ color: rippleColor, foreground: true }}
                  style={({ pressed }) =>
                    pressed ? { opacity: 0.6 } : undefined
                  }
                  className="flex-row items-center gap-4 px-4 py-2"
                >
                  <View className="h-14 w-14 items-center justify-center rounded-md3-sm bg-surface-variant">
                    <SymbolView
                      name={{
                        ios: 'folder.badge.plus',
                        android: 'create_new_folder',
                        web: 'create_new_folder',
                      }}
                      size={ICON_SIZES.large}
                      tintColor={colors.onSurfaceVariant}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-body-large text-on-surface">
                      Add music folder
                    </Text>
                    <Text className="mt-0.5 text-body-medium text-on-surface-variant opacity-60">
                      {isAdding
                        ? 'Opening folder picker…'
                        : 'Choose a folder to scan for music'}
                    </Text>
                  </View>
                </Pressable>

                {locations.map(location => {
                  const { name, volume } = folderInfo(location.uri);
                  const isScanningThis =
                    isScanning && scanningLocationUri === location.uri;
                  return (
                    <View key={location.uri}>
                      <RowSeparator dividerColor={dividerColor} />
                      <View className="flex-row items-center gap-4 px-4 py-2">
                        <View className="h-14 w-14 items-center justify-center rounded-md3-sm bg-surface-variant">
                          <SymbolView
                            name={{
                              ios: 'folder',
                              android: 'folder',
                              web: 'folder',
                            }}
                            size={ICON_SIZES.large}
                            tintColor={colors.onSurfaceVariant}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-body-large text-on-surface"
                          >
                            {name}
                          </Text>
                          {isScanningThis ? (
                            <Text
                              numberOfLines={1}
                              className="mt-0.5 text-body-medium text-on-surface-variant opacity-60"
                            >
                              {scanningSongTitle ??
                                (scanningAction === 'remove'
                                  ? 'Removing…'
                                  : 'Scanning…')}
                            </Text>
                          ) : volume ? (
                            <Text
                              numberOfLines={1}
                              className="mt-0.5 text-body-medium text-on-surface-variant opacity-60"
                            >
                              {`${volume.charAt(0).toUpperCase()}${volume.slice(1)} storage`}
                            </Text>
                          ) : null}
                        </View>
                        {isScanningThis ? (
                          <View className="h-10 w-10 items-center justify-center">
                            <ActivityIndicator
                              size="small"
                              color={colors.onSurfaceVariant}
                            />
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${name}`}
                            hitSlop={8}
                            android_ripple={{
                              color: rippleColor,
                              borderless: true,
                            }}
                            onPress={() =>
                              confirmRemoveLocation(location, name)
                            }
                            className="h-10 w-10 items-center justify-center rounded-md3-full"
                          >
                            <SymbolView
                              name={{
                                ios: 'trash',
                                android: 'delete',
                                web: 'delete',
                              }}
                              size={ICON_SIZES.medium}
                              tintColor={colors.onSurfaceVariant}
                            />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}

                {locations.length === 0 ? (
                  <>
                    <RowSeparator dividerColor={dividerColor} />
                    <Text className="px-4 py-3 text-body-medium text-on-surface-variant opacity-70">
                      No folders added yet
                    </Text>
                  </>
                ) : null}
              </View>
            </Section>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
