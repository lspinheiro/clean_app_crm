import { z } from "zod";

import { userMessage } from "@/i18n/user-message";

const optionalCapSchema = z.union([
  z.literal("").transform(() => undefined),
  z.coerce.number<number>().int().positive(userMessage("postingCapPositive")),
]);

const localMinuteSchema = z.iso.datetime({ local: true, precision: -1 });
const optionalExpirySchema = z.string()
  .superRefine((value, context) => {
    if (value && !localMinuteSchema.safeParse(value).success) {
      context.addIssue({
        code: "custom",
        message: userMessage("postingExpiryInvalid"),
      });
    }
  })
  .transform((value) => value
    ? new Date(`${value}:00+10:00`).toISOString()
    : undefined);

const commonPostingFields = {
  applicationCap: optionalCapSchema,
  expiresAt: optionalExpirySchema,
  publicDescription: z.string()
    .trim()
    .min(1, userMessage("postingDescriptionRequired"))
    .max(2000, userMessage("max2000")),
};

export const createPostingSchema = z.discriminatedUnion("intent", [
  z.object({
    ...commonPostingFields,
    intent: z.literal("expression_of_interest"),
    targetId: z.literal("", userMessage("postingTargetMismatch")),
  }),
  z.object({
    ...commonPostingFields,
    intent: z.literal("one_time"),
    targetId: z.uuid(userMessage("postingTargetRequired")),
  }),
  z.object({
    ...commonPostingFields,
    intent: z.literal("regular"),
    targetId: z.uuid(userMessage("postingTargetRequired")),
  }),
]);

export type CreatePostingInput = z.input<typeof createPostingSchema>;
