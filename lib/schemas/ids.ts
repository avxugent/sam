import { z } from "zod";

/** Longest record id a request body or query string may carry; cuid and uuid ids are well below it. */
export const MAX_ID_LENGTH = 64;

/** A record id in a request body or query string. */
export const idSchema = z.string().min(1).max(MAX_ID_LENGTH);
