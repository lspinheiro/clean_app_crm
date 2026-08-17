import { z } from "zod";

import { userMessage } from "@/i18n/user-message";

export const preferredCleanerOrderSchema = z.object({
  clientId: z.string().uuid(userMessage("cleanerOrderInvalid")),
  siteId: z.string().uuid(userMessage("cleanerOrderInvalid")),
  cleanerIds: z
    .array(z.string().uuid(userMessage("cleanerOrderInvalid")))
    .refine((ids) => new Set(ids).size === ids.length, userMessage("cleanerOrderDuplicate")),
});
