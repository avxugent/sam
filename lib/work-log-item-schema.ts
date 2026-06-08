import { z } from "zod";

export const createWorkLogItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(2000).optional().nullable(),
});

export const updateWorkLogItemSchema = createWorkLogItemSchema.partial();
