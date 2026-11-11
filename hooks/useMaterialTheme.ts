import { vars } from 'nativewind';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { withAlpha } from '@/lib/color';
import { DARK_MATERIAL_COLORS, LIGHT_MATERIAL_COLORS } from './materialPalette';

export function useMaterialTheme() {
  const scheme = useColorScheme();
  const colors =
    scheme === 'dark' ? DARK_MATERIAL_COLORS : LIGHT_MATERIAL_COLORS;

  const themeVars = useMemo(
    () =>
      vars({
        '--color-primary': colors.primary,
        '--color-on-primary': colors.onPrimary,
        '--color-primary-container': colors.primaryContainer,
        '--color-on-primary-container': colors.onPrimaryContainer,
        '--color-background': colors.background,
        '--color-on-background': colors.onBackground,
        '--color-surface': colors.surface,
        '--color-on-surface': colors.onSurface,
        '--color-surface-variant': colors.surfaceVariant,
        '--color-on-surface-variant': colors.onSurfaceVariant,
        '--color-surface-container-low': colors.surfaceContainerLow,
        '--color-surface-container': colors.surfaceContainer,
        '--color-surface-container-high': colors.surfaceContainerHigh,
        '--color-outline': colors.outline,
        '--color-outline-variant': colors.outlineVariant,
      }),
    [
      colors.primary,
      colors.onPrimary,
      colors.primaryContainer,
      colors.onPrimaryContainer,
      colors.background,
      colors.onBackground,
      colors.surface,
      colors.onSurface,
      colors.surfaceVariant,
      colors.onSurfaceVariant,
      colors.surfaceContainerLow,
      colors.surfaceContainer,
      colors.surfaceContainerHigh,
      colors.outline,
      colors.outlineVariant,
    ],
  );

  return {
    colors,
    vars: themeVars,
    rippleColor: withAlpha(colors.onSurface, 0.2),
    dividerColor: colors.outlineVariant,
  };
}
