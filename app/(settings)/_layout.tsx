import { Stack } from 'expo-router';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';

export default function SettingsLayout() {
  const { colors } = useMaterialTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.onBackground,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
    </Stack>
  );
}
