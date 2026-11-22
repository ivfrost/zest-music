import type { ReleaseType } from '@/types/releases';

export function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

export function tagValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function firstTagValue(
  value: string | string[] | undefined,
): string | null {
  return tagValues(value)[0] ?? null;
}

export function releaseTypeFromTags(
  releaseTypes: readonly string[],
): ReleaseType {
  const joined = releaseTypes.join(' ').toLowerCase();
  if (joined.includes('single')) return 'single';
  if (joined.includes('ep')) return 'ep';
  if (joined.includes('album')) return 'album';
  return 'unknown';
}
