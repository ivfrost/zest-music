import z from 'zod';
import { releaseSelectSchema } from '@/db/selects';

export const ReleaseSchema = releaseSelectSchema.extend({
  id: z.uuid(),
  title: z.string().max(255),
  type: z.enum(['single', 'album', 'ep', 'unknown']).default('unknown'),
  songIds: z.array(z.uuid()),
  artistIds: z.array(z.uuid()),
});
export type Release = z.infer<typeof ReleaseSchema>;
export type ReleaseType = Release['type'];
export type ReleaseSummary = {
  id: string;
  title: string;
  artworkUri: string | null;
};
