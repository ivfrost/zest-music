import { Stack } from 'expo-router';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';

export default function PlaylistsLayout() {
  const { colors } = useMaterialTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.onBackground,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
