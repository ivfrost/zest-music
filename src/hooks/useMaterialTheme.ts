import { Color } from 'expo-router';
import { vars } from 'nativewind';
import { useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { withAlpha } from '@/lib/color';
import { DARK_MATERIAL_COLORS, LIGHT_MATERIAL_COLORS } from './materialPalette';

const resolveDynamicColor = (color: unknown, fallback: string) =>
  typeof color === 'string' ? color : fallback;

export function useMaterialTheme() {
  const scheme = useColorScheme();
  const fallbackColors =
    scheme === 'dark' ? DARK_MATERIAL_COLORS : LIGHT_MATERIAL_COLORS;
  const colors =
    Platform.OS === 'android'
      ? {
          primary: resolveDynamicColor(
            Color.android.dynamic.primary,
            fallbackColors.primary,
          ),
          onPrimary: resolveDynamicColor(
            Color.android.dynamic.onPrimary,
            fallbackColors.onPrimary,
          ),
          primaryContainer: resolveDynamicColor(
            Color.android.dynamic.primaryContainer,
            fallbackColors.primaryContainer,
          ),
          onPrimaryContainer: resolveDynamicColor(
            Color.android.dynamic.onPrimaryContainer,
            fallbackColors.onPrimaryContainer,
          ),
          background: resolveDynamicColor(
            Color.android.dynamic.background,
            fallbackColors.background,
          ),
          onBackground: resolveDynamicColor(
            Color.android.dynamic.onBackground,
            fallbackColors.onBackground,
          ),
          surface: resolveDynamicColor(
            Color.android.dynamic.surface,
            fallbackColors.surface,
          ),
          onSurface: resolveDynamicColor(
            Color.android.dynamic.onSurface,
            fallbackColors.onSurface,
          ),
          surfaceVariant: resolveDynamicColor(
            Color.android.dynamic.surfaceVariant,
            fallbackColors.surfaceVariant,
          ),
          onSurfaceVariant: resolveDynamicColor(
            Color.android.dynamic.onSurfaceVariant,
            fallbackColors.onSurfaceVariant,
          ),
          surfaceContainerLow: resolveDynamicColor(
            Color.android.dynamic.surfaceContainerLow,
            fallbackColors.surfaceContainerLow,
          ),
          surfaceContainer: resolveDynamicColor(
            Color.android.dynamic.surfaceContainer,
            fallbackColors.surfaceContainer,
          ),
          surfaceContainerHigh: resolveDynamicColor(
            Color.android.dynamic.surfaceContainerHigh,
            fallbackColors.surfaceContainerHigh,
          ),
          outline: resolveDynamicColor(
            Color.android.dynamic.outline,
            fallbackColors.outline,
          ),
          outlineVariant: resolveDynamicColor(
            Color.android.dynamic.outlineVariant,
            fallbackColors.outlineVariant,
          ),
        }
      : fallbackColors;

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
