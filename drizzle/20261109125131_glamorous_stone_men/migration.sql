ALTER TABLE `songs` ADD `play_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `songs` ADD `last_played_at` integer;