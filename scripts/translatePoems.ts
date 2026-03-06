/**
 * Placeholder for poem translation utilities.
 * Can be extended to integrate with translation APIs (e.g. DeepL, Google Translate)
 * or to validate/manage bilingual poem pairs.
 */

import { loadPoems } from "../engine/loadPoems.js";

async function main() {
  const poems = loadPoems();
  console.log(`Found ${poems.length} poems with Afrikaans and English versions.`);
  for (const p of poems) {
    console.log(`  - ${p.id}: ${p.af.length} lines (af), ${p.en.length} lines (en)`);
  }
}

main();
