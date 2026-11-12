import { z } from 'zod';

import { songSelectSchema } from '@/db/selects';

export const SongSchema = songSelectSchema.extend({
  id: z.uuid(),
  releaseId: z.uuid(),
  title: z.string().max(255),
  artistIds: z.array(z.uuid()),
});
export type Song = z.infer<typeof SongSchema>;
