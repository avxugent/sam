/** Command-line flag parsing shared by the maintenance scripts. */

/**
 * The value that follows `flag` on the command line (`--batch 500`), or
 * `fallback` when the flag is absent or has no value.
 * @template {string | undefined} [F=undefined]
 * @param {string} flag
 * @param {F} [fallback]
 * @returns {string | F}
 */
export function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return /** @type {F} */ (fallback);
  return process.argv[idx + 1] ?? /** @type {F} */ (fallback);
}
