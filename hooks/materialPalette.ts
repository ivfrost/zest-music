/**
 * Material 3 baseline palette used on platforms where the Jetpack Compose
 * color hook is unavailable (iOS/web).
 */
export const LIGHT_MATERIAL_COLORS = {
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  background: '#FEF7FF',
  onBackground: '#1D1B20',
  surface: '#FEF7FF',
  onSurface: '#1D1B20',
  surfaceVariant: '#E7E0EC',
  onSurfaceVariant: '#49454F',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
};

type MaterialPalette = typeof LIGHT_MATERIAL_COLORS;

export const DARK_MATERIAL_COLORS: MaterialPalette = {
  primary: '#D0BCFF',
  onPrimary: '#381E72',
  primaryContainer: '#4F378B',
  onPrimaryContainer: '#EADDFF',
  background: '#141218',
  onBackground: '#E6E0E9',
  surface: '#141218',
  onSurface: '#E6E0E9',
  surfaceVariant: '#49454F',
  onSurfaceVariant: '#CAC4D0',
  surfaceContainerLow: '#1D1B20',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  outline: '#938F99',
  outlineVariant: '#49454F',
};

export const ICON_SIZES = {
  small: 20,
  medium: 24,
  large: 28,
  xlarge: 30,
  display: 72,
} as const;
