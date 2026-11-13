import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { Stack } from 'expo-router';
import {
  openDatabaseSync,
  SQLiteProvider,
  useSQLiteContext,
} from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Suspense, useEffect, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AudioProvider } from '@/audio/AudioProvider';
import { PlaybackNotificationSync } from '@/audio/PlaybackNotificationSync';
import { PlayStatsSync } from '@/audio/PlayStatsSync';
import migrations from '../../drizzle/migrations';
import './global.css';
import { MusicLocationsProvider } from '@/context/MusicLocationContext';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import { spacing } from '@/theme';

const DB_NAME = 'zestmusic';

function DrizzleStudioBridge() {
  useDrizzleStudio(useSQLiteContext());
  return null;
}

export default function RootLayout() {
  const { colors: themeColors, vars: themeVars } = useMaterialTheme();
  const backgroundColor = themeColors.background;
  const db = useMemo(() => drizzle(openDatabaseSync(DB_NAME)), []);
  const { success: dbMigrateSuccess, error: dbMigrateError } = useMigrations(
    db,
    {
      ...migrations,
      journal: { entries: [] },
    },
  );

  // Keeps the native window behind React in step with the theme, including dark mode.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(backgroundColor);
  }, [backgroundColor]);

  if (dbMigrateError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xxl,
          backgroundColor,
        }}
      >
        <Text style={{ color: themeColors.onBackground }}>
          Could not migrate the database.
        </Text>
        {__DEV__ ? (
          <Text style={{ color: themeColors.onBackground }}>
            {dbMigrateError.message}
          </Text>
        ) : (
          <Text style={{ color: themeColors.onBackground }}>
            Please restart the app. If the problem persists, reinstall it.
          </Text>
        )}
      </View>
    );
  }

  if (!dbMigrateSuccess) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor,
        }}
      >
        <ActivityIndicator color={themeColors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense>
        <AudioProvider>
          <SQLiteProvider
            databaseName={DB_NAME}
            options={{ enableChangeListener: true }}
            useSuspense
          >
            {__DEV__ && <DrizzleStudioBridge />}
            <PlayStatsSync />
            <MusicLocationsProvider>
              <PlaybackNotificationSync />
              <StatusBar style="auto" />
              {/* Keeps the Material palette available to every route. */}
              <View style={[themeVars, { flex: 1 }]}>
                <Stack
                  id={'root'}
                  screenOptions={{ contentStyle: { backgroundColor } }}
                >
                  <Stack.Screen
                    name="(tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="(settings)"
                    options={{ headerShown: false }}
                  />
                </Stack>
              </View>
            </MusicLocationsProvider>
          </SQLiteProvider>
        </AudioProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
