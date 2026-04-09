/**
 * Optional filter for CLI scripts: POEM_IDS=id1,id2 (comma-separated poem folder names).
 * When unset or empty, scripts process all poems.
 */

export function getPoemIdsFilterFromEnv(): string[] | null {
  const raw = process.env.POEM_IDS;
  if (raw === undefined || raw === "") return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : null;
}
