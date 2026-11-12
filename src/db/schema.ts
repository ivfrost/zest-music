import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const artists = sqliteTable('artists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  musicBrainzId: text('musicbrainz_id'),
});

export const releases = sqliteTable('releases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type', { enum: ['single', 'album', 'ep', 'unknown'] }).notNull(),
  artworkUri: text('artwork_uri'),
  musicBrainzId: text('musicbrainz_id'),
  musicBrainzReleaseGroupId: text('musicbrainz_release_group_id'),
});

export const songs = sqliteTable('songs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  uri: text('uri').notNull(),
  size: integer('size_bytes').notNull(),
  duration: integer('duration'),
  playCount: integer('play_count').notNull().default(0),
  lastPlayedAt: integer('last_played_at'),
  trackNumber: integer('track_number'),
  musicBrainzRecordingId: text('musicbrainz_recording_id'),
  musicBrainzTrackId: text('musicbrainz_track_id'),
  releaseId: text('release_id')
    .notNull()
    .references(() => releases.id, { onDelete: 'cascade' }),
});

export const playlists = sqliteTable('playlists', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
});

export const releaseArtists = sqliteTable(
  'release_artists',
  {
    releaseId: text('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    artistId: text('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    role: text('role'),
  },
  t => [primaryKey({ columns: [t.releaseId, t.artistId] })],
);

export const songPlaylists = sqliteTable(
  'song_playlists',
  {
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    playlistId: text('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.songId, t.playlistId] })],
);
