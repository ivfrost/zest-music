import {z} from 'zod';

export const MusicLocationSchema = z.object({
  uri: z.string().min(1),
});
export type MusicLocation = z.infer<typeof MusicLocationSchema>;
