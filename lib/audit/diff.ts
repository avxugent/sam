/** Pure helpers for building the `changes` detail of UPDATE audit entries. */

export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

/** One candidate entry for an UPDATE diff; `false` skips a field the request did not touch. */
export type FieldChange =
  | false
  | {
      label: string;
      /** Values compared to decide whether the field changed (e.g. ids). */
      before: unknown;
      after: unknown;
      /** What to record instead of before/after (e.g. names for ids). */
      display?: [from: unknown, to: unknown];
    };

/** Builds the `changes` detail for an UPDATE entry from the fields whose values differ. */
export function auditChanges(fields: FieldChange[]): AuditChanges {
  const changes: AuditChanges = {};
  for (const field of fields) {
    if (!field || field.before === field.after) continue;
    const [from, to] = field.display ?? [field.before, field.after];
    changes[field.label] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}
