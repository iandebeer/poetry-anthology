/** Strict approval checks for Curator poems; legacy content is reported without migration. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { validateReferences } from './poemSupporting.js';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function validatePoems(repo: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const root = join(repo, 'poems');
  if (!existsSync(root)) return { errors, warnings };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    let config;
    try { config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')); }
    catch {
      if (existsSync(join(dir, 'approval.json'))) errors.push(`${entry.name}: invalid Curator config.json.`);
      else warnings.push(`${entry.name}: invalid legacy config.json (repair separately).`);
      continue;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      if (existsSync(join(dir, 'approval.json'))) errors.push(`${entry.name}: invalid Curator configuration.`);
      else warnings.push(`${entry.name}: invalid legacy configuration.`);
      continue;
    }
    if (!config.curator && !existsSync(join(dir, 'approval.json'))) continue;
    try {
      const audit = config.curator;
      if (!audit || !existsSync(join(dir, 'approval.json')) || JSON.stringify(JSON.parse(readFileSync(join(dir, 'approval.json'), 'utf8'))) !== JSON.stringify(audit)) throw new Error('Missing or inconsistent approval record.');
      if (audit.version !== 1 || !['af','en'].includes(audit.sourceLanguage) || !audit.approvedFiles || typeof audit.approvedFiles !== 'object') throw new Error('Invalid approval record.');
      const { curator: _curator, ...metadata } = config;
      if (hash(JSON.stringify(metadata)) !== audit.metadataHash) throw new Error('Metadata changed after final review.');
      for (const name of [`${audit.sourceLanguage}.md`, 'references.json']) if (!audit.approvedFiles[name]) throw new Error(`Missing approved ${name}.`);
      for (const name of ['af.md','en.md','commentary.af.md','commentary.en.md','references.json']) {
        const path = join(dir, name);
        if (existsSync(path) !== Boolean(audit.approvedFiles[name])) throw new Error(`Unapproved or missing ${name}.`);
        if (existsSync(path) && (lstatSync(path).isSymbolicLink() || hash(readFileSync(path)) !== audit.approvedFiles[name])) throw new Error(`${name} changed after final review.`);
      }
      if (existsSync(join(dir, 'en.generated.md')) || existsSync(join(dir, 'af-translate.md'))) throw new Error('Unapproved generated translation in a Curator poem.');
      validateReferences(JSON.parse(readFileSync(join(dir, 'references.json'), 'utf8')));
      if (!['af','en'].some(lang => typeof config[lang === 'af' ? 'titleAf' : 'titleEn'] === 'string' && config[lang === 'af' ? 'titleAf' : 'titleEn'].trim()) || typeof config.author !== 'string' || !config.author.trim()) throw new Error('Missing title or author.');
      if (!/^poems\/[a-z0-9-]+\/o-image\.png$/.test(config.image) || config.image !== `poems/${entry.name}/o-image.png`) throw new Error('Invalid illustration path.');
      const image = join(repo, 'public/media', config.image);
      if (!existsSync(image) || lstatSync(image).isSymbolicLink()) throw new Error('Missing illustration.');
      const bytes = readFileSync(image);
      if (bytes.length >= 2 * 1024 * 1024 || hash(bytes) !== audit.imageHash) throw new Error('Illustration is oversized or changed after final review.');
    } catch (err) { errors.push(`${entry.name}: ${err instanceof Error ? err.message : err}`); }
  }
  return { errors, warnings };
}
