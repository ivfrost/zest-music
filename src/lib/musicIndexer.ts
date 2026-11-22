import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import type { File } from 'expo-file-system';
import { parseFromTokenizer } from 'music-metadata';
import { fromBlob } from 'strtok3';
import {
  findOrCreateArtists,
  findOrCreateRelease,
  type LibraryDatabase,
} from '@/db/library';
import * as schema from '@/db/schema';
import { readAudioTags as readNativeAudioTags } from '../../modules/audio-tags';
import { AudioFileBlob } from './audioFileBlob';
import {
  firstTagValue,
  releaseTypeFromTags,
  tagValues,
  titleFromFilename,
} from './musicMetadata';
import { storeArtwork } from './musicScan';

/** Tag values the row builder needs, whichever parser produced them. */
type AudioTags = {
  title: string | null;
  album: string | null;
  albumArtists: string[];
  artists: string[];
  trackNumber: number | null;
  duration: number | null;
  releaseTypes: string[];
  musicBrainzAlbumId: string | null;
  musicBrainzReleaseGroupId: string | null;
  musicBrainzRecordingId: string | null;
  musicBrainzTrackId: string | null;
  musicBrainzArtistIds: (string | null)[];
  musicBrainzAlbumArtistIds: (string | null)[];
  artworkUri: string | null;
};

/** Runs the native reader first. Formats it does not cover use `music-metadata`. */
async function readTags(file: File): Promise<AudioTags> {
  const native = await readNativeAudioTags(file.uri);
  if (native) {
    return {
      title: native.title || null,
      album: native.album || null,
      albumArtists: native.albumArtists,
      artists: native.artists,
      trackNumber: native.trackNumber || null,
      duration:
        native.durationSeconds > 0 ? Math.round(native.durationSeconds) : null,
      releaseTypes: native.releaseType,
      musicBrainzAlbumId: native.musicBrainzAlbumId || null,
      musicBrainzReleaseGroupId: native.musicBrainzReleaseGroupId || null,
      musicBrainzRecordingId: native.musicBrainzRecordingId || null,
      musicBrainzTrackId: native.musicBrainzTrackId || null,
      musicBrainzArtistIds: native.musicBrainzArtistIds,
      musicBrainzAlbumArtistIds: native.musicBrainzAlbumArtistIds,
      artworkUri: native.artworkUri || null,
    };
  }

  return readTagsWithMusicMetadata(file);
}

/** The original JS parser, used where the native reader has no format support. */
async function readTagsWithMusicMetadata(file: File): Promise<AudioTags> {
  const tokenizer = fromBlob(new AudioFileBlob(file) as unknown as Blob, {
    fileInfo: { path: file.name, size: file.size },
  });
  let metadata;
  try {
    metadata = await parseFromTokenizer(tokenizer);
  } finally {
    await tokenizer.close();
  }

  const tags = metadata.common;
  const rawDuration = metadata.format.duration;

  return {
    title: tags.title?.trim() || null,
    album: tags.album?.trim() || null,
    albumArtists: tagValues(tags.albumartists ?? tags.albumartist),
    artists: tagValues(tags.artists ?? tags.artist),
    trackNumber: tags.track?.no ?? null,
    duration:
      typeof rawDuration === 'number' && Number.isFinite(rawDuration)
        ? Math.round(rawDuration)
        : null,
    releaseTypes: tagValues(tags.releasetype),
    musicBrainzAlbumId: firstTagValue(tags.musicbrainz_albumid),
    musicBrainzReleaseGroupId: firstTagValue(tags.musicbrainz_releasegroupid),
    musicBrainzRecordingId: firstTagValue(tags.musicbrainz_recordingid),
    musicBrainzTrackId: firstTagValue(tags.musicbrainz_trackid),
    musicBrainzArtistIds: tagValues(tags.musicbrainz_artistid),
    musicBrainzAlbumArtistIds: tagValues(tags.musicbrainz_albumartistid),
    artworkUri: await storeArtwork(tags.picture?.[0]),
  };
}

/**
 * Reads the tags of one audio file and upserts its release, artists and song rows.
 * Returns the song title so callers can report progress. Throws when the file
 * cannot be parsed or written. Callers keep scanning.
 */
export async function indexAudioFile(
  db: LibraryDatabase,
  file: File,
): Promise<string> {
  const tags = await readTags(file);
  const title = tags.title || titleFromFilename(file.name);

  const albumArtistNames = tags.albumArtists;
  const tagArtistNames = albumArtistNames.length
    ? albumArtistNames
    : tags.artists;
  const names = tagArtistNames.length ? tagArtistNames : ['Unknown Artist'];
  const rawArtistIds = albumArtistNames.length
    ? tags.musicBrainzAlbumArtistIds
    : tags.musicBrainzArtistIds;
  const artistMusicBrainzIds =
    rawArtistIds.length === names.length
      ? rawArtistIds
      : names.length === 1
        ? [rawArtistIds[0] ?? null]
        : [];

  const releaseId = await findOrCreateRelease(db, {
    title: tags.album || 'Unknown Album',
    type: releaseTypeFromTags(tags.releaseTypes),
    musicBrainzId: tags.musicBrainzAlbumId,
    musicBrainzReleaseGroupId: tags.musicBrainzReleaseGroupId,
    artworkUri: tags.artworkUri,
  });
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

  const musicBrainzRecordingId = tags.musicBrainzRecordingId;
  const musicBrainzTrackId = tags.musicBrainzTrackId;
  const trackNumber = tags.trackNumber;
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
    lastModified: file.lastModified,
    duration: tags.duration,
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

/**
 * Indexes files in batches. SQLite commits and fsyncs once per batch, not once per
 * row. One unreadable file does not abort the batch.
 */
export async function indexAudioFiles(
  db: LibraryDatabase,
  files: readonly File[],
  report: (title: string) => void,
): Promise<void> {
  // Drizzle queries share the expo-sqlite connection, so they run inside this
  // transaction. Drizzle's own `transaction` type rejects async callbacks.
  await db.$client.withTransactionAsync(async () => {
    for (const file of files) {
      try {
        report(await indexAudioFile(db, file));
      } catch (error) {
        console.warn(`Could not index music file ${file.uri}:`, error);
      }
    }
  });
}
