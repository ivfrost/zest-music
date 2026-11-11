/**
 * Applies an alpha channel to a #RRGGBB or #RRGGBBAA color and returns
 * #RRGGBBAA. Used where React Native props need a concrete ColorValue instead
 * of a NativeWind CSS variable (e.g. ripple and divider colors).
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = color.slice(0, 7);
  const alphaHex = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');

  return `${rgb}${alphaHex}`;
}
