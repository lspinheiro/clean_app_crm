import { z } from "zod";

export const preferredCleanerOrderSchema = z.object({
  clientId: z.string().uuid(),
  siteId: z.string().uuid(),
  cleanerIds: z
    .array(z.string().uuid())
    .refine((ids) => new Set(ids).size === ids.length, "Cleaner order cannot contain duplicates."),
});
