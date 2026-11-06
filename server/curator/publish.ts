/** Local preparation only. This module never invokes git or deployment APIs. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync, openSync, closeSync, lstatSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { validatePoems } from '../../engine/validatePoems.js';
import { atomicWrite, CuratorError, digest, DraftStore, readiness, reviewFingerprint, type Draft } from './store.js';
const execFileAsync = promisify(execFile);
interface Move { from: string; to: string; backup: string; hadOriginal: boolean }
interface Journal { phase: 'prepared' | 'moving' | 'complete'; moves: Move[] }
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export function publicationFiles(d: Draft, image: Buffer): Record<string, string | Buffer> {
  const files: Record<string, string | Buffer> = { [`${d.sourceLanguage}.md`]: d.poem, 'references.json': json(d.references) };
  if (d.approvals.translationSkipped !== digest(d.poem)) files[d.sourceLanguage === 'af' ? 'en.md' : 'af.md'] = d.translation;
  if (d.commentaryAf.trim()) files['commentary.af.md'] = d.commentaryAf;
  if (d.commentaryEn.trim()) files['commentary.en.md'] = d.commentaryEn;
  const metadata = { titleAf: d.titleAf, titleEn: d.titleEn, author: d.author, image: `poems/${d.slug}/o-image.png`, lineDuration: 5, linePause: 1, introDuration: 3, outroDuration: 5 };
  const audit = { version: 1, sourceLanguage: d.sourceLanguage,
    metadataHash: digest(JSON.stringify(metadata)), originalHash: digest(d.original), imageHash: digest(image),
    approvedFiles: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, digest(bytes)])) };
  files['approval.json'] = json(audit);
  files['config.json'] = json({ ...metadata, curator: audit });
  return files;
}
export async function buildStage(repo: string, stage: string, draft: Draft, image: Buffer): Promise<void> {
  mkdirSync(join(stage, 'poems'), { recursive: true });
  mkdirSync(join(stage, 'public/media/poems'), { recursive: true });
  mkdirSync(join(stage, 'src'), { recursive: true });
  // Copy text and config, but regenerate the new poem only. Export syncs portable media in this private snapshot.
  const poemRoot = join(repo, 'poems');
  if (existsSync(poemRoot)) cpSync(poemRoot, join(stage, 'poems'), { recursive: true, filter: src => !src.split('/').slice(poemRoot.split('/').length).includes('media') });
  const mediaRoot = join(repo, 'public/media');
  if (existsSync(mediaRoot)) for (const name of readdirSync(mediaRoot)) {
    if (name === 'poems') {
      for (const id of readdirSync(join(mediaRoot, name))) symlinkSync(join(mediaRoot, name, id), join(stage, 'public/media/poems', id));
    } else symlinkSync(join(mediaRoot, name), join(stage, 'public/media', name));
  }
  const poemDir = join(stage, 'poems', draft.slug);
  const imageDir = join(stage, 'public/media/poems', draft.slug);
  mkdirSync(poemDir); mkdirSync(imageDir);
  for (const [name, bytes] of Object.entries(publicationFiles(draft, image))) writeFileSync(join(poemDir, name), bytes);
  writeFileSync(join(imageDir, 'o-image.png'), image);
  for (const name of ['bio.md', 'o-photo.png']) if (existsSync(join(repo, name))) cpSync(join(repo, name), join(stage, name));
  const validation = validatePoems(stage);
  if (validation.errors.length) throw new CuratorError(validation.errors.join('\n'));
  for (const script of ['convertPoemsToHtmlAndText.ts', 'generatePoemsData.ts', 'exportHtml.ts']) {
    await execFileAsync(process.execPath, ['--import', resolve(repo, 'node_modules/tsx/dist/loader.mjs'), resolve(repo, 'scripts', script)], {
      cwd: stage, timeout: 180000, maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, POEM_IDS: script === 'convertPoemsToHtmlAndText.ts' ? draft.slug : '', EXPORT_HTML_LANG: 'all' },
    });
  }
  for (const name of ['index.html', `${draft.slug}/${draft.sourceLanguage === 'af' ? 'afrikaans' : 'english'}.html`]) {
    if (!existsSync(join(stage, 'export', name))) throw new Error(`Build did not produce ${name}.`);
  }
  const index = JSON.parse(readFileSync(join(stage, 'src/poemsData.json'), 'utf8')) as { id: string }[];
  if (index.filter(p => p.id === draft.slug).length !== 1) throw new Error('The JSON index does not contain exactly one new poem.');
}

/** Roll back an interrupted promotion using write-ahead records. Only paths created by this service are touched. */
export function recoverTransaction(path: string): void {
  if (!existsSync(path)) return;
  const journal = JSON.parse(readFileSync(path, 'utf8')) as Journal;
  if (journal.phase !== 'complete') for (const move of [...journal.moves].reverse()) {
    if (existsSync(move.backup)) { rmSync(move.to, { recursive: true, force: true }); renameSync(move.backup, move.to); }
    else if (!move.hadOriginal && !existsSync(move.from) && existsSync(move.to)) rmSync(move.to, { recursive: true, force: true });
  }
  for (const move of journal.moves) rmSync(move.backup, { recursive: true, force: true });
  rmSync(path);
}
function acquireLock(store: DraftStore): () => void {
  const path = join(store.root, '.publish-lock');
  try {
    const fd = openSync(path, 'wx', 0o600); writeFileSync(fd, String(process.pid)); closeSync(fd);
  } catch {
    let pid: number;
    try { pid = Number(readFileSync(path, 'utf8')); } catch { throw new CuratorError('Publication is locked. Try again shortly.', 409); }
    try { process.kill(pid, 0); } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH' && pid > 0) { rmSync(path); return acquireLock(store); }
    }
    throw new CuratorError('Another local save is running. Try again shortly.', 409);
  }
  return () => rmSync(path, { force: true });
}
export async function saveLocally(store: DraftStore, id: string, revision: unknown,
  builder: typeof buildStage = buildStage): Promise<Draft> {
  const unlock = acquireLock(store);
  const journalPath = join(store.root, '.publish-journal.json');
  let stage = '';
  try {
    recoverTransaction(journalPath);
    const d = store.read(id);
    if (d.saved) return d;
    if (revision !== d.revision) throw new CuratorError('Draft changed. Reload before saving.', 409);
    const errors = [...readiness(d), ...store.conflicts(d)];
    if (d.approvals.review !== reviewFingerprint(d)) errors.push('Preview and approve the complete current draft first.');
    if (errors.length) throw new CuratorError(errors.join('\n'));
    const image = readFileSync(join(store.dir(id), `${d.image?.hash}.png`));
    if (digest(image) !== d.image?.hash || image.length >= 2 * 1024 * 1024) throw new CuratorError('Illustration changed. Upload and review it again.');
    stage = join(store.root, `.stage-${randomUUID()}`);
    await builder(store.repo, stage, d, image);
    // Recheck after the asynchronous build; a browser may have edited the draft meanwhile.
    if (store.read(id).revision !== revision) throw new CuratorError('Draft changed during the build. Preview it again.', 409);
    if (store.conflicts(d).length) throw new CuratorError('A conflicting poem appeared during the build.', 409);
    const saved: Draft = { ...d, revision: d.revision + 1, saved: { slug: d.slug, fingerprint: reviewFingerprint(d), at: new Date().toISOString() } };
    writeFileSync(join(stage, 'saved-draft.json'), json(saved));
    const pairs = [
      ['poems/' + d.slug, 'poems/' + d.slug], ['public/media/poems/' + d.slug, 'public/media/poems/' + d.slug],
      ['src/poemsData.json', 'src/poemsData.json'], ['export', 'export'], ['saved-draft.json', `drafts/${id}/draft.json`],
    ];
    const moves = pairs.map(([from, to], i) => ({ from: join(stage, from), to: join(store.repo, to), backup: join(stage, `backup-${i}`), hadOriginal: existsSync(join(store.repo, to)) }));
    for (const move of moves) {
      mkdirSync(dirname(move.to), { recursive: true });
      if (existsSync(move.to) && lstatSync(move.to).isSymbolicLink()) throw new CuratorError('A destination is a symbolic link. Local save stopped.');
    }
    const journal: Journal = { phase: 'prepared', moves };
    atomicWrite(journalPath, json(journal));
    journal.phase = 'moving'; atomicWrite(journalPath, json(journal));
    for (const move of moves) {
      if (move.hadOriginal) renameSync(move.to, move.backup);
      renameSync(move.from, move.to);
    }
    journal.phase = 'complete'; atomicWrite(journalPath, json(journal));
    recoverTransaction(journalPath);
    return saved;
  } catch (err) { recoverTransaction(journalPath); throw err; }
  finally { if (stage && !existsSync(journalPath)) rmSync(stage, { recursive: true, force: true }); unlock(); }
}
