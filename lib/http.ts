export const USER_AGENT = 'lemomuse/1.0 (local music player)';

/** Wikimedia rejects requests without a descriptive User-Agent, including images. */
export function imageSource(uri: string) {
  return uri.startsWith('http')
    ? { uri, headers: { 'User-Agent': USER_AGENT } }
    : { uri };
}
