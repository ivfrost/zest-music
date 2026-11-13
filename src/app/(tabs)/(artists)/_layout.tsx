import { Stack } from 'expo-router';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';

export default function ArtistsLayout() {
  const { colors } = useMaterialTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.onBackground,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Artists', headerShown: false }}
      />
      <Stack.Screen name="artists/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
