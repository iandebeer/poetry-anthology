import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { PoemLanguage } from '../../engine/types.js';
import { validateReferences, type PoemReference } from '../../engine/poemSupporting.js';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export class CuratorError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface Draft {
  version: 1; id: string; revision: number; createdAt: string; updatedAt: string;
  slug: string; sourceLanguage: PoemLanguage; original: string; poem: string;
  titleAf: string; titleEn: string; author: string;
  commentaryAf: string; commentaryEn: string; references: PoemReference[];
  editorial?: { text: string; sourceHash: string };
  translation: string; translationSourceHash?: string;
  image?: { hash: string; origin: 'upload' | 'generated'; prompt?: string };
  approvals: { source?: string; translation?: string; translationSkipped?: string; image?: string; review?: string };
  saved?: { slug: string; fingerprint: string; at: string };
}
export function atomicWrite(path: string, data: string | Buffer) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, data, { flag: 'wx', mode: 0o600 });
  renameSync(temp, path);
}
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function field(value: unknown, name: string, limit = 100000): string {
  if (typeof value !== 'string' || value.length > limit || value.includes('\0')) throw new CuratorError(`Invalid ${name}.`);
  return value;
}
export function reviewFingerprint(d: Draft): string {
  return digest(JSON.stringify({ slug: d.slug, sourceLanguage: d.sourceLanguage, poem: d.poem, titleAf: d.titleAf, titleEn: d.titleEn, author: d.author,
    commentaryAf: d.commentaryAf, commentaryEn: d.commentaryEn, references: d.references, translation: d.approvals.translationSkipped === digest(d.poem) ? '' : d.translation, image: d.image,
    source: d.approvals.source, translationApproval: d.approvals.translation, skipped: d.approvals.translationSkipped, imageApproval: d.approvals.image }));
}
export function readiness(d: Draft): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) errors.push('Choose a lowercase poem ID using letters, numbers and hyphens.');
  if (!d.poem.trim() || !d.author.trim() || !(d.sourceLanguage === 'af' ? d.titleAf : d.titleEn).trim()) errors.push('Poem, source title and author are required.');
  if (d.approvals.source !== digest(d.poem)) errors.push('Approve the current source poem.');
  if (d.approvals.translationSkipped !== digest(d.poem) && (!d.translation.trim() || d.translationSourceHash !== digest(d.poem) || d.approvals.translation !== digest(d.translation))) errors.push('Approve the current translation, or explicitly continue without one.');
  if (!d.image || d.approvals.image !== d.image.hash) errors.push('Choose and approve an illustration.');
  validateReferences(d.references);
  // Footnote definitions stay in the poem; check references without changing the verse.
  for (const text of [d.poem, d.approvals.translationSkipped ? '' : d.translation]) {
    const definitions = new Set(Array.from(text.matchAll(/^\[\^([^\]]+)\]:/gm), m => m[1]));
    for (const match of text.matchAll(/\[\^([^\]]+)\](?!:)/g)) if (!definitions.has(match[1])) errors.push(`Missing footnote definition: ${match[1]}`);
  }
  return [...new Set(errors)];
}
export function draftState(d: Draft): string {
  if (d.saved) return 'Saved locally — not deployed';
  if (!readiness(d).length && d.approvals.review === reviewFingerprint(d)) return 'Ready to save locally';
  return d.approvals.source ? 'In review' : 'Draft';
}
export class DraftStore {
  readonly root: string;
  constructor(readonly repo: string) {
    this.root = join(repo, 'drafts');
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (lstatSync(this.root).isSymbolicLink()) throw new CuratorError('Draft storage cannot be a symlink.');
  }
  dir(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new CuratorError('Invalid draft ID.');
    const dir = join(this.root, id);
    if (existsSync(dir) && (lstatSync(dir).isSymbolicLink() || !realpathSync(dir).startsWith(realpathSync(this.root) + sep))) throw new CuratorError('Unsafe draft directory.');
    return dir;
  }
  read(id: string): Draft {
    const path = join(this.dir(id), 'draft.json');
    if (!existsSync(path)) throw new CuratorError('Draft not found.', 404);
    return JSON.parse(readFileSync(path, 'utf8')) as Draft;
  }
  list(): Draft[] {
    return readdirSync(this.root).filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id => this.read(id)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  create(input: Record<string, unknown>): Draft {
    const original = field(input.poem, 'poem');
    if (!original.trim()) throw new CuratorError('Paste or import a poem first.');
    if (input.sourceLanguage !== 'af' && input.sourceLanguage !== 'en') throw new CuratorError('Choose Afrikaans or English.');
    const id = randomUUID(); const now = new Date().toISOString();
    const draft: Draft = { version: 1, id, revision: 0, createdAt: now, updatedAt: now, original, poem: original,
      sourceLanguage: input.sourceLanguage, slug: '', titleAf: '', titleEn: '', author: '', commentaryAf: '', commentaryEn: '', references: [], translation: '', approvals: {} };
    this.applyFields(draft, input);
    const titleKey = draft.sourceLanguage === 'af' ? 'titleAf' : 'titleEn';
    if (!draft[titleKey].trim()) draft[titleKey] = original.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() || '';
    if (!draft.slug.trim()) draft.slug = (draft.sourceLanguage === 'af' ? draft.titleAf : draft.titleEn).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    mkdirSync(this.dir(id), { mode: 0o700 });
    writeFileSync(join(this.dir(id), 'original.md'), original, { flag: 'wx', mode: 0o600 });
    atomicWrite(join(this.dir(id), 'draft.json'), json(draft));
    return draft;
  }
  private applyFields(d: Draft, input: Record<string, unknown>) {
    for (const key of ['slug','poem','titleAf','titleEn','author','commentaryAf','commentaryEn','translation'] as const) {
      if (input[key] !== undefined) {
        const next = field(input[key], key, ['slug','titleAf','titleEn','author'].includes(key) ? 300 : 100000);
        if (key === 'poem' && next !== d.poem) {
          delete d.approvals.source; delete d.approvals.translation; delete d.approvals.translationSkipped;
          delete d.translationSourceHash; delete d.editorial;
        }
        if (key === 'translation' && next !== d.translation) {
          delete d.approvals.translation; delete d.approvals.translationSkipped;
          d.translationSourceHash = digest(d.poem);
        }
        d[key] = next;
      }
    }
    if (input.references !== undefined) { validateReferences(input.references); d.references = input.references; }
  }
  change(id: string, revision: unknown, mutate: (draft: Draft) => void): Draft {
    const d = this.read(id);
    if (!Number.isInteger(revision) || d.revision !== revision) throw new CuratorError('This draft changed in another tab. Reload it before continuing.', 409);
    if (d.saved) throw new CuratorError('This draft has already been saved locally. Review its files before committing.', 409);
    mutate(d);
    d.revision++; d.updatedAt = new Date().toISOString();
    if (d.approvals.review !== reviewFingerprint(d)) delete d.approvals.review;
    atomicWrite(join(this.dir(id), 'draft.json'), json(d));
    return d;
  }
  update(id: string, revision: unknown, input: Record<string, unknown>): Draft {
    return this.change(id, revision, d => this.applyFields(d, input));
  }
  approve(id: string, revision: unknown, action: string): Draft {
    return this.change(id, revision, d => {
      const sourceHash = digest(d.poem);
      if (action === 'reject-editorial') {
        delete d.editorial;
      } else if (action === 'source') {
        if (!d.poem.trim()) throw new CuratorError('The source poem is empty.');
        d.approvals.source = sourceHash;
      } else if (action === 'editorial') {
        if (!d.editorial || d.editorial.sourceHash !== sourceHash) throw new CuratorError('Generate a fresh editorial proposal.');
        d.poem = d.editorial.text;
        d.approvals = { source: digest(d.poem), image: d.approvals.image };
        delete d.translationSourceHash; delete d.editorial;
      } else if (action === 'translation') {
        if (d.approvals.source !== sourceHash || d.translationSourceHash !== sourceHash || !d.translation.trim()) throw new CuratorError('Review the source and enter or generate its translation first.');
        d.approvals.translation = digest(d.translation); delete d.approvals.translationSkipped;
      } else if (action === 'skip-translation') {
        d.approvals.translationSkipped = sourceHash; delete d.approvals.translation;
      } else if (action === 'image') {
        if (!d.image) throw new CuratorError('Choose an image first.');
        d.approvals.image = d.image.hash;
      } else if (action === 'review') {
        const errors = readiness(d); if (errors.length) throw new CuratorError(errors.join(' '));
        d.approvals.review = reviewFingerprint(d);
      } else throw new CuratorError('Unknown approval.');
    });
  }
  conflicts(d: Draft): string[] {
    const messages: string[] = [];
    if (existsSync(join(this.repo, 'poems', d.slug)) || existsSync(join(this.repo, 'public/media/poems', d.slug))) messages.push(`The ID ${d.slug} already has files. Choose another ID; existing files will not be overwritten.`);
    const normalized = (s: string) => s.normalize('NFKC').toLowerCase().replace(/^#+.*$/gm, '').replace(/[^\p{L}\p{N}]/gu, '');
    const target = normalized(d.poem);
    const root = join(this.repo, 'poems');
    if (!existsSync(root)) return messages;
    for (const id of readdirSync(root)) {
      if (id.toLowerCase() === d.slug.toLowerCase()) { if (id !== d.slug) messages.push(`ID conflicts with ${id}.`); }
      for (const name of ['af.md', 'en.md', 'af-translate.md', 'en.generated.md']) {
        const path = join(root, id, name);
        if (existsSync(path) && normalized(readFileSync(path, 'utf8')) === target) { messages.push(`This poem matches existing text in ${id}/${name}.`); break; }
      }
    }
    for (const other of this.list()) if (other.id !== d.id && !other.saved && (other.slug === d.slug || normalized(other.poem) === target)) messages.push(`Another draft already uses this ID or poem: ${other.slug || other.id}.`);
    return messages;
  }
}
// Resolve a single safe child; drafts use UUIDs, published IDs use strict slugs.
export function safeChild(root: string, name: string): string {
  const path = resolve(root, name);
  if (path === resolve(root) || !path.startsWith(resolve(root) + sep)) throw new CuratorError('Unsafe path.');
  return path;
}
