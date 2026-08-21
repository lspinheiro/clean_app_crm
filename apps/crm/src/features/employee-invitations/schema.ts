import { z } from "zod";

import { userMessage } from "@/i18n/user-message";

export const employeeInvitationIdSchema = z.uuid();

export const employeeInvitationListRowsSchema = z.array(z.object({
  created_at: z.iso.datetime({ offset: true }),
  email: z.email(),
  id: employeeInvitationIdSchema,
  invitation_state: z.enum(["accepted", "expired", "pending", "revoked"]),
  role: z.enum(["owner", "staff"]),
}));

export const employeeInvitationInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(
    z.email(userMessage("employeeEmailInvalid")).max(320, userMessage("employeeEmailInvalid")),
  ),
  locale: z.enum(["en-AU", "pt-BR"]),
  role: z.enum(["owner", "staff"], userMessage("employeeRoleInvalid")),
});

export const newEmployeeAccountSchema = z.object({
  confirmPassword: z.string(),
  fullName: z.string().trim()
    .min(1, userMessage("employeeFullNameRequired"))
    .max(120, userMessage("employeeFullNameRequired")),
  locale: z.enum(["en-AU", "pt-BR"]),
  password: z.string()
    .min(8, userMessage("employeePasswordLength"))
    .max(72, userMessage("employeePasswordLength")),
}).refine((value) => value.password === value.confirmPassword, {
  message: userMessage("employeePasswordsMatch"),
  path: ["confirmPassword"],
});

export type EmployeeInvitationInput = z.infer<typeof employeeInvitationInputSchema>;
