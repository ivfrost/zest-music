import { createSelectSchema } from 'drizzle-orm/zod';
import { artists, releases, songs } from './schema';

export const artistSelectSchema = createSelectSchema(artists);
export const releaseSelectSchema = createSelectSchema(releases);
export const songSelectSchema = createSelectSchema(songs);
