/**
 * Material 3 neutral fallback for devices without Android dynamic colors. Values
 * follow the standard role-to-tone mapping for a neutral (achromatic) seed.
 */
export const LIGHT_MATERIAL_COLORS = {
  primary: '#5E5E5E',
  onPrimary: '#FFFFFF',
  primaryContainer: '#E2E2E2',
  onPrimaryContainer: '#1B1B1B',
  background: '#F9F9F9',
  onBackground: '#1B1B1B',
  surface: '#F9F9F9',
  onSurface: '#1B1B1B',
  surfaceVariant: '#E2E2E2',
  onSurfaceVariant: '#474747',
  surfaceContainerLow: '#F3F3F3',
  surfaceContainer: '#EEEEEE',
  surfaceContainerHigh: '#E8E8E8',
  outline: '#777777',
  outlineVariant: '#C6C6C6',
};

type MaterialPalette = typeof LIGHT_MATERIAL_COLORS;

export const DARK_MATERIAL_COLORS: MaterialPalette = {
  primary: '#C6C6C6',
  onPrimary: '#303030',
  primaryContainer: '#474747',
  onPrimaryContainer: '#E2E2E2',
  background: '#141414',
  onBackground: '#E2E2E2',
  surface: '#141414',
  onSurface: '#E2E2E2',
  surfaceVariant: '#474747',
  onSurfaceVariant: '#C6C6C6',
  surfaceContainerLow: '#1B1B1B',
  surfaceContainer: '#202020',
  surfaceContainerHigh: '#2A2A2A',
  outline: '#919191',
  outlineVariant: '#474747',
};

export const ICON_SIZES = {
  small: 20,
  medium: 24,
  large: 28,
  xlarge: 30,
  display: 72,
} as const;
