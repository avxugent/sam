import { z } from "zod";

/** Self-service password change (profile page and forced change after an admin reset). */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "Password must be at least 8 characters.").max(128),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
    }
  });

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;
