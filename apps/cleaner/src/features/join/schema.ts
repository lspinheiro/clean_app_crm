import { z } from "zod";

function requiredText(message: string) {
  return z.string().trim().min(1, message);
}

function countDigits(value: string) {
  return (value.match(/\d/g) ?? []).length;
}

export const registrationSchema = z.object({
  fullName: requiredText("Enter your full name."),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use a password with at least 8 characters."),
  // People write phone numbers with spaces, brackets, and country codes. Count digits
  // instead of imposing a format they would have to fight.
  phone: requiredText("Enter your phone number.").refine(
    (value) => countDigits(value) >= 8,
    "Enter a phone number with at least 8 digits.",
  ),
  suburb: requiredText("Enter the suburb you work from."),
});

export type Registration = z.infer<typeof registrationSchema>;
