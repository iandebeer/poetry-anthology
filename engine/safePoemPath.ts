/**
 * Resolve a poem directory only if it stays under poemsRoot (blocks path traversal).
 */

import { join, resolve, sep } from "path";

export function safePoemDir(poemsRoot: string, id: string): string | null {
  if (typeof id !== "string" || !id.trim()) return null;
  const root = resolve(poemsRoot);
  const candidate = resolve(join(root, id));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}
