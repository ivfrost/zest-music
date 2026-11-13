import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import type { File } from 'expo-file-system';
import { type IAudioMetadata, parseFromTokenizer } from 'music-metadata';
import { fromBlob } from 'strtok3';
import {
  findOrCreateArtists,
  findOrCreateRelease,
  type LibraryDatabase,
} from '@/db/library';
import * as schema from '@/db/schema';
import { AudioFileBlob } from './audioFileBlob';
import {
  firstTagValue,
  releaseTypeFromTags,
  tagValues,
  titleFromFilename,
} from './musicMetadata';
import { storeArtwork } from './musicScan';

/**
 * Reads the tags of one audio file and upserts its release, artists and song rows.
 * Returns the song title so callers can report progress. Throws when the file
 * cannot be parsed or written; callers keep scanning.
 */
export async function indexAudioFile(
  db: LibraryDatabase,
  file: File,
): Promise<string> {
  const tokenizer = fromBlob(new AudioFileBlob(file) as unknown as Blob, {
    fileInfo: { path: file.name, size: file.size },
  });
  let metadata: IAudioMetadata;
  try {
    metadata = await parseFromTokenizer(tokenizer);
  } finally {
    await tokenizer.close();
  }

  const tags = metadata.common;
  const rawDuration = metadata.format.duration;
  const duration =
    typeof rawDuration === 'number' && Number.isFinite(rawDuration)
      ? Math.round(rawDuration)
      : null;
  const title = tags.title?.trim() || titleFromFilename(file.name);

  const releaseTitle = tags.album?.trim() || 'Unknown Album';
  const musicBrainzReleaseId = firstTagValue(tags.musicbrainz_albumid);
  const musicBrainzReleaseGroupId = firstTagValue(
    tags.musicbrainz_releasegroupid,
  );
  const artworkUri = await storeArtwork(tags.picture?.[0]);
  const releaseId = await findOrCreateRelease(db, {
    title: releaseTitle,
    type: releaseTypeFromTags(tags),
    musicBrainzId: musicBrainzReleaseId,
    musicBrainzReleaseGroupId,
    artworkUri,
  });

  const albumArtistNames = tagValues(tags.albumartists ?? tags.albumartist);
  const trackArtistNames = tagValues(tags.artists ?? tags.artist);
  const tagArtistNames = albumArtistNames.length
    ? albumArtistNames
    : trackArtistNames;
  const names = tagArtistNames.length ? tagArtistNames : ['Unknown Artist'];
  const rawArtistIds = tagValues(
    albumArtistNames.length
      ? tags.musicbrainz_albumartistid
      : tags.musicbrainz_artistid,
  );
  const artistMusicBrainzIds =
    rawArtistIds.length === names.length
      ? rawArtistIds
      : names.length === 1
        ? [rawArtistIds[0] ?? null]
        : [];
  const artistIds = await findOrCreateArtists(db, names, artistMusicBrainzIds);

  for (const artistId of artistIds) {
    await db
      .insert(schema.releaseArtists)
      .values({
        releaseId,
        artistId,
        role: albumArtistNames.length ? 'albumArtist' : 'artist',
      })
      .onConflictDoNothing();
  }

  const musicBrainzRecordingId = firstTagValue(tags.musicbrainz_recordingid);
  const musicBrainzTrackId = firstTagValue(tags.musicbrainz_trackid);
  const trackNumber = tags.track?.no ?? null;
  const byMusicBrainzId = musicBrainzRecordingId
    ? await db
        .select({ id: schema.songs.id })
        .from(schema.songs)
        .where(eq(schema.songs.musicBrainzRecordingId, musicBrainzRecordingId))
        .limit(1)
    : [];
  const existingSong =
    byMusicBrainzId[0] ??
    (
      await db
        .select({ id: schema.songs.id })
        .from(schema.songs)
        .where(eq(schema.songs.uri, file.uri))
        .limit(1)
    )[0];
  const songValues = {
    title,
    uri: file.uri,
    size: file.size,
    duration,
    trackNumber,
    releaseId,
    musicBrainzRecordingId,
    musicBrainzTrackId,
  };

  if (existingSong) {
    await db
      .update(schema.songs)
      .set(songValues)
      .where(eq(schema.songs.id, existingSong.id));
    return title;
  }

  const id = randomUUID();
  await db.insert(schema.songs).values({ id, ...songValues });
  if (__DEV__)
    console.info('[MusicLibrary] Created song', {
      id,
      title,
      releaseId,
      musicBrainzRecordingId,
      musicBrainzTrackId,
    });
  return title;
}
