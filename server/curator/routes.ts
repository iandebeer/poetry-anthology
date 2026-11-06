import express from 'express';
import { readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CuratorError, DraftStore, digest, draftState, readiness, reviewFingerprint, type Draft } from './store.js';
import { proposeText, illustrate } from './ai.js';
import { saveDraftImage } from './images.js';
import { publicationFiles, saveLocally } from './publish.js';
import { escapeHtml, poemMarkdownToHtmlBody } from '../../engine/poemMarkdownHtml.js';
import { supportingHtml } from '../../engine/poemSupporting.js';
import { wrapHtmlWithPoemBackground } from '../../engine/poemHtmlDocument.js';

export function curatorRouter(store: DraftStore, ai = { proposeText, illustrate }): express.Router {
  const router = express.Router();
  const present = (d: Draft) => ({ ...d, state: draftState(d), issues: readiness(d), conflicts: d.saved ? [] : store.conflicts(d) });
  const idOf = (req: express.Request) => String(req.params.id);
  // Existing session auth is mounted before this router. Same-origin checks also prevent cross-site mutation.
  router.use((req, res, next) => {
    if (!['GET','HEAD'].includes(req.method)) {
      if (req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: 'Open the Curator directly to make changes.' });
      const origin = req.get('Origin');
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: 'Origin mismatch.' });
    }
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  router.get('/', (_req, res) => res.json(store.list().map(present)));
  router.post('/', (req, res) => res.status(201).json(present(store.create(req.body))));
  router.get('/:id', (req, res) => res.json(present(store.read(idOf(req)))));
  router.put('/:id', (req, res) => res.json(present(store.update(idOf(req), req.body.revision, req.body))));
  router.post('/:id/approve', (req, res) => res.json(present(store.approve(idOf(req), req.body.revision, req.body.action))));
  router.post('/:id/ai', async (req, res) => {
    const id = idOf(req), d = store.read(id), revision = req.body.revision;
    if (revision !== d.revision || d.saved) throw new CuratorError('Reload the current editable draft first.', 409);
    const kind = req.body.kind;
    if (kind !== 'editorial' && kind !== 'translation') throw new CuratorError('Unknown AI operation.');
    if (kind === 'translation' && d.approvals.source !== digest(d.poem)) throw new CuratorError('Approve the source before translating.');
    const text = await ai.proposeText(kind, d.poem, d.sourceLanguage, [d.commentaryAf, d.commentaryEn, JSON.stringify(d.references)].join('\n'));
    res.json(present(store.change(id, revision, draft => {
      if (kind === 'editorial') draft.editorial = { text, sourceHash: digest(draft.poem) };
      else {
        const titleKey = draft.sourceLanguage === 'af' ? 'titleEn' : 'titleAf';
        if (!draft[titleKey].trim()) draft[titleKey] = text.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() || '';
        draft.translation = text; draft.translationSourceHash = digest(draft.poem); delete draft.approvals.translation; delete draft.approvals.translationSkipped; }
    })));
  });
  async function setImage(id: string, revision: number, bytes: Buffer, origin: 'upload' | 'generated', prompt?: string) {
    const temp = join(store.dir(id), `image-${randomUUID()}.png`);
    try {
      await saveDraftImage(bytes, temp);
      const hash = digest(readFileSync(temp));
      // Persist the candidate under a content address before the manifest so stale async requests cannot replace the active image.
      const candidate = join(store.dir(id), `${hash}.png`);
      renameSync(temp, candidate);
      const changed = store.change(id, revision, d => { d.image = { hash, origin, ...(prompt ? { prompt } : {}) }; delete d.approvals.image; });
      return changed;
    } finally { rmSync(temp, { force: true }); }
  }
  router.post('/:id/image', express.raw({ type: ['image/png','image/jpeg','image/webp'], limit: '20mb' }), async (req, res) => {
    const id = idOf(req), d = store.read(id), revision = Number(req.query.revision);
    if (d.saved || d.revision !== revision) throw new CuratorError('Reload before uploading.', 409);
    if (!Buffer.isBuffer(req.body)) throw new CuratorError('Upload a PNG, JPEG or WebP image.');
    res.json(present(await setImage(id, revision, req.body, 'upload')));
  });
  router.post('/:id/illustrate', async (req, res) => {
    const id = idOf(req), d = store.read(id);
    if (d.saved || d.revision !== req.body.revision) throw new CuratorError('Reload before generating.', 409);
    const prompt = req.body.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new CuratorError('Enter an illustration brief (up to 8,000 characters).');
    res.json(present(await setImage(id, d.revision, await ai.illustrate(prompt), 'generated', prompt)));
  });
  router.get('/:id/image', (req, res) => {
    const d = store.read(idOf(req));
    if (!d.image) throw new CuratorError('No illustration yet.', 404);
    res.type('png').send(readFileSync(join(store.dir(d.id), `${d.image.hash}.png`)));
  });
  router.get('/:id/preview', (req, res) => {
    const d = store.read(idOf(req));
    const source = d.sourceLanguage;
    const translation = source === 'af' ? 'en' : 'af';
    const blocks: [typeof source, string][] = [[source, d.poem]];
    if (d.translation && !d.approvals.translationSkipped) blocks.push([translation, d.translation]);
    const body = blocks.map(([lang, text]) => `<section lang="${lang}"><h2>${lang === 'af' ? 'Afrikaans' : 'English'}</h2>${poemMarkdownToHtmlBody(text).replace(/(id="|href="#)(fn(?:ref)?-)/g, `$1${lang}-$2`)}${supportingHtml(lang === 'af' ? d.commentaryAf : d.commentaryEn, d.references, lang)}</section>`).join('<hr>');
    const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(d.titleAf || d.titleEn)}</title></head><body><p>${escapeHtml(d.author)} · Local preview · ${escapeHtml(draftState(d))}</p>${body}</body></html>`;
    const imagePath = d.image ? join(store.dir(d.id), `${d.image.hash}.png`) : null;
    const imageUrl = d.image ? `/api/drafts/${d.id}/image?v=${d.image.hash}` : null;
    res.type('html').send(wrapHtmlWithPoemBackground(shell, d.image ? 'o-image.png' : undefined, '', imageUrl, imagePath, null, '/admin'));
  });
  router.get('/:id/files', (req, res) => {
    const d = store.read(idOf(req));
    const image = d.image ? readFileSync(join(store.dir(d.id), `${d.image.hash}.png`)) : Buffer.alloc(0);
    const files = Object.entries(publicationFiles(d, image)).map(([name, content]) => ({ path: `poems/${d.slug}/${name}`, content }));
    res.json({ files, image: `public/media/poems/${d.slug}/o-image.png`, index: 'src/poemsData.json (regenerated)', fingerprint: reviewFingerprint(d) });
  });
  router.post('/:id/save-locally', async (req, res) => {
    const d = store.read(idOf(req));
    res.json(present(await saveLocally(store, d.id, req.body.revision)));
  });
  router.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof CuratorError ? err.status : (err as { status?: number })?.status === 413 ? 413 : 400;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Curator operation failed.' });
  });
  return router;
}
