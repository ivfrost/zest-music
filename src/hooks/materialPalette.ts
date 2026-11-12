/** Neutral Material 3 fallback for devices without Android dynamic colors. */
export const LIGHT_MATERIAL_COLORS = {
  primary: '#515F65',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D5E4E9',
  onPrimaryContainer: '#101D22',
  background: '#F7F9FA',
  onBackground: '#191C1E',
  surface: '#F7F9FA',
  onSurface: '#191C1E',
  surfaceVariant: '#DEE3E6',
  onSurfaceVariant: '#41484B',
  surfaceContainerLow: '#F1F4F5',
  surfaceContainer: '#EBEFF0',
  surfaceContainerHigh: '#E5E9EB',
  outline: '#72787B',
  outlineVariant: '#C2C8CB',
};

type MaterialPalette = typeof LIGHT_MATERIAL_COLORS;

export const DARK_MATERIAL_COLORS: MaterialPalette = {
  primary: '#BBC8CD',
  onPrimary: '#263238',
  primaryContainer: '#3D4A50',
  onPrimaryContainer: '#D5E4E9',
  background: '#111416',
  onBackground: '#E1E3E5',
  surface: '#111416',
  onSurface: '#E1E3E5',
  surfaceVariant: '#41484B',
  onSurfaceVariant: '#C2C8CB',
  surfaceContainerLow: '#191C1E',
  surfaceContainer: '#1D2022',
  surfaceContainerHigh: '#272A2C',
  outline: '#8C9295',
  outlineVariant: '#41484B',
};

export const ICON_SIZES = {
  small: 20,
  medium: 24,
  large: 28,
  xlarge: 30,
  display: 72,
} as const;
