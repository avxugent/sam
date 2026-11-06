import { z } from "zod";
import { Role } from "@/lib/permissions";

/** Admin-managed user accounts: shared by the users API routes and the admin client. */
const userFields = {
  name: z.string().min(1).max(128),
  email: z.email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(Role),
};

export const createUserSchema = z.object({
  ...userFields,
  mustChangePassword: z.boolean().optional().default(true),
  twoFactorRequired: z.boolean().optional().default(false),
});

/** PUT /api/users/[id]: every field optional; an omitted field is left unchanged. */
export const updateUserSchema = z.object({ ...userFields, twoFactorRequired: z.boolean() }).partial();

/** Admin edit form: name, email and role are always sent; an empty password keeps the current one. */
export const editUserFormSchema = z.object({
  ...userFields,
  password: userFields.password.or(z.literal("")).optional(),
  twoFactorRequired: z.boolean().optional(),
});
