import z from 'zod';

import { artistSelectSchema } from '@/db/selects';

export const ArtistSchema = artistSelectSchema.extend({
  id: z.uuid(),
  name: z.string().max(255),
  releaseIds: z.array(z.uuid()),
});
export type Artist = z.infer<typeof ArtistSchema>;
