CREATE TABLE `artists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`musicbrainz_id` text
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `release_artists` (
	`release_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`role` text,
	CONSTRAINT `release_artists_pk` PRIMARY KEY(`release_id`, `artist_id`),
	CONSTRAINT `fk_release_artists_release_id_releases_id_fk` FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_release_artists_artist_id_artists_id_fk` FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`musicbrainz_id` text,
	`musicbrainz_release_group_id` text
);
--> statement-breakpoint
CREATE TABLE `song_playlists` (
	`song_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	CONSTRAINT `song_playlists_pk` PRIMARY KEY(`song_id`, `playlist_id`),
	CONSTRAINT `fk_song_playlists_song_id_songs_id_fk` FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_song_playlists_playlist_id_playlists_id_fk` FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`uri` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`musicbrainz_recording_id` text,
	`musicbrainz_track_id` text,
	`release_id` text NOT NULL,
	CONSTRAINT `fk_songs_release_id_releases_id_fk` FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON DELETE CASCADE
);
