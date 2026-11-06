/** Seed the user-supplied acceptance example privately, with no approvals or AI calls. */
import { readFileSync } from 'node:fs';
import { DraftStore } from '../server/curator/store.js';
const store = new DraftStore(process.cwd());
const existing = store.list().find(d => d.slug === 'eendagsvlieg');
if (existing) console.log(`Eendagsvlieg draft already exists: ${existing.id}`);
else {
  const input = JSON.parse(readFileSync(new URL('../test/fixtures/eendagsvlieg.json', import.meta.url), 'utf8'));
  const draft = store.create(input);
  console.log(`Created private Eendagsvlieg draft: ${draft.id}. Source, translation, illustration and final review remain unapproved.`);
}
