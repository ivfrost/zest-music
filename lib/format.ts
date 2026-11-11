/** Formats a duration in seconds as `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const secondsLabel = String(secs).padStart(2, '0');

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsLabel}`
    : `${minutes}:${secondsLabel}`;
}
