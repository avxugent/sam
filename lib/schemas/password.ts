import { z } from "zod";

export type PasswordChangeMessages = {
  currentRequired: string;
  tooShort: string;
  confirmRequired: string;
  mismatch: string;
};

const ENGLISH: PasswordChangeMessages = {
  currentRequired: "Current password is required.",
  tooShort: "Password must be at least 8 characters.",
  confirmRequired: "Please confirm your new password.",
  mismatch: "Passwords do not match.",
};

/**
 * Self-service password change (profile page and forced change after an admin
 * reset). The API uses the English messages; forms pass translated ones.
 */
export function buildPasswordChangeSchema(messages: PasswordChangeMessages = ENGLISH) {
  return z
    .object({
      currentPassword: z.string().min(1, messages.currentRequired),
      newPassword: z.string().min(8, messages.tooShort).max(128),
      confirmPassword: z.string().min(1, messages.confirmRequired),
    })
    .superRefine(({ newPassword, confirmPassword }, ctx) => {
      if (newPassword !== confirmPassword) {
        ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: messages.mismatch });
      }
    });
}

export const passwordChangeSchema = buildPasswordChangeSchema();

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;
