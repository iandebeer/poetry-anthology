import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import express from 'express';
import { DraftStore, digest, readiness, reviewFingerprint } from '../server/curator/store.js';
import { saveLocally, recoverTransaction, buildStage } from '../server/curator/publish.js';
import { curatorRouter } from '../server/curator/routes.js';
import { saveDraftImage } from '../server/curator/images.js';
import { validatePoems } from '../engine/validatePoems.js';
import { supportingHtml } from '../engine/poemSupporting.js';

function fixture(t: { after: (fn: () => void) => void }) {
  const repo = mkdtempSync(join(tmpdir(), 'poetry-curator-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo,'poems')); mkdirSync(join(repo,'public/media/poems'),{recursive:true}); mkdirSync(join(repo,'src'));
  return { repo, store: new DraftStore(repo) };
}
function create(store: DraftStore, language: 'af'|'en' = 'af') {
  const input = JSON.parse(readFileSync(new URL('./fixtures/eendagsvlieg.json', import.meta.url), 'utf8'));
  return store.create({ ...input, sourceLanguage: language, ...(language === 'en' ? {titleEn:'Mayfly',poem:'# Mayfly\n\nFor a fleeting moment between heaven and earth.'} : {}) });
}
async function approved(store: DraftStore, language: 'af'|'en' = 'af') {
  let d = create(store, language);
  d = store.approve(d.id,d.revision,'source');
  d = store.update(d.id,d.revision,{translation:language === 'en' ? '# Eendagsvlieg\n\n’n Vlietende oomblik.' : '# Mayfly\n\nA fleeting moment.'});
  d = store.approve(d.id,d.revision,'translation');
  const bytes=await sharp({create:{width:80,height:120,channels:3,background:'#728b8d'}}).png().toBuffer();
  const hash=digest(bytes); writeFileSync(join(store.dir(d.id),hash+'.png'),bytes);
  d=store.change(d.id,d.revision,draft=>{draft.image={hash,origin:'upload'};});
  d=store.approve(d.id,d.revision,'image'); d=store.approve(d.id,d.revision,'review'); return d;
}

test('original text remains exact; proposals do not change it and source edits revoke dependent approvals',async t=>{
  const {store}=fixture(t); let d=await approved(store); const original=d.original;
  d=store.change(d.id,d.revision,next=>{next.editorial={text:next.poem.replace('fladder','sweef'),sourceHash:digest(next.poem)};});
  assert.equal(d.poem,original); assert.equal(d.approvals.review,reviewFingerprint(d));
  d=store.approve(d.id,d.revision,'editorial');
  assert.equal(d.original,original); assert.equal(readFileSync(join(store.dir(d.id),'original.md'),'utf8'),original);
  assert.match(d.poem,/sweef/); assert.equal(d.approvals.translation,undefined); assert.equal(d.approvals.review,undefined);
  assert.ok(readiness(d).some(x=>x.includes('translation')));
  assert.throws(()=>store.update(d.id,0,{poem:'stale'}),/another tab/);
});

test('rejected proposals and explicitly omitted translations never replace source or reach publication files',async t=>{
  const {store}=fixture(t); let d=await approved(store);
  d=store.change(d.id,d.revision,next=>{next.editorial={text:'Rewritten',sourceHash:digest(next.poem)};});
  d=store.approve(d.id,d.revision,'reject-editorial'); assert.equal(d.poem,d.original);
  d=store.approve(d.id,d.revision,'skip-translation');
  d=store.approve(d.id,d.revision,'review'); assert.equal(readiness(d).length,0);
});

test('drafts stay out of published folders, duplicate IDs and normalized text are reported',t=>{
  const {store,repo}=fixture(t); const d=create(store);
  assert.deepEqual(readdirSync(join(repo,'poems')),[]);
  mkdirSync(join(repo,'poems/other'));writeFileSync(join(repo,'poems/other/af.md'),d.poem.replace('fladder','FLADDER'));
  assert.ok(store.conflicts(d).some(x=>x.includes('matches existing')));
  mkdirSync(join(repo,'public/media/poems/eendagsvlieg'));
  assert.ok(store.conflicts(d).some(x=>x.includes('already has files')));
  assert.throws(()=>store.read('../escape'),/Invalid draft ID/);
  assert.throws(()=>store.update(d.id,d.revision,{references:[{id:'unsafe',citation:'Unsafe',url:'javascript:alert(1)'}]}),/http/);
});

test('real staged build saves an English-first poem, updates indices, preserves legacy files, and is idempotent',async t=>{
  const {store,repo}=fixture(t); let d=await approved(store,'en');
  mkdirSync(join(repo,'poems/legacy'));writeFileSync(join(repo,'poems/legacy/af.md'),'# Legacy\n\nKeep me exact.');
  writeFileSync(join(repo,'poems/legacy/config.json'),'{}');writeFileSync(join(repo,'poems/legacy/af.html'),'<html><body><p>Keep me exact.</p></body></html>');
  writeFileSync(join(repo,'src/poemsData.json'),'[]');
  for(const name of ['scripts','node_modules'])symlinkSync(resolve(name),join(repo,name));
  const original=readFileSync(join(repo,'poems/legacy/af.md'));
  const calls: string[]=[];
  d=await saveLocally(store,d.id,d.revision,async (...args)=>{calls.push('build');await buildStage(...args);});
  assert.ok(d.saved); assert.equal(validatePoems(repo).errors.length,0);
  const index=JSON.parse(readFileSync(join(repo,'src/poemsData.json'),'utf8'));
  assert.equal(index.filter((p:{id:string})=>p.id==='eendagsvlieg').length,1);
  assert.deepEqual(readFileSync(join(repo,'poems/legacy/af.md')),original);
  assert.equal(existsSync(join(repo,'poems/eendagsvlieg/en.generated.md')),false);
  const html=readFileSync(join(repo,'export/eendagsvlieg/afrikaans.html'),'utf8');
  assert.match(html,/Toeligting/);assert.match(html,/Upaniṣad/);assert.match(html,/media\/o-image.png/);
  await saveLocally(store,d.id,d.revision,async()=>{throw new Error('Must not rebuild');}); assert.equal(calls.length,1);
  writeFileSync(join(repo,'poems/eendagsvlieg/en.md'),'Changed after review');
  assert.ok(validatePoems(repo).errors.some(x=>x.includes('changed after final review')));
  writeFileSync(join(repo,'poems/eendagsvlieg/config.json'),'{');
  assert.ok(validatePoems(repo).errors.some(x=>x.includes('invalid Curator')));
});

test('build failure and concurrent edits leave published data and JSON untouched',async t=>{
  const {store,repo}=fixture(t);const d=await approved(store);writeFileSync(join(repo,'src/poemsData.json'),'previous index');
  await assert.rejects(()=>saveLocally(store,d.id,d.revision,async()=>{throw new Error('failed build');}),/failed build/);
  assert.equal(existsSync(join(repo,'poems/eendagsvlieg')),false);assert.equal(readFileSync(join(repo,'src/poemsData.json'),'utf8'),'previous index');
  await assert.rejects(()=>saveLocally(store,d.id,d.revision,async()=>{store.update(d.id,d.revision,{titleAf:'New title'});}),/changed during the build/);
  assert.equal(existsSync(join(repo,'poems/eendagsvlieg')),false);
});

test('write-ahead recovery restores replaced files and removes partially promoted new files',t=>{
  const {repo}=fixture(t);const stage=join(repo,'stage');mkdirSync(stage);
  const to=join(repo,'src/poemsData.json'),backup=join(stage,'backup'),from=join(stage,'index');
  writeFileSync(backup,'original');writeFileSync(to,'replacement');
  const newTo=join(repo,'new-poem');writeFileSync(newTo,'partial');
  const journal=join(repo,'journal.json');writeFileSync(journal,JSON.stringify({phase:'moving',moves:[{from,to,backup,hadOriginal:true},{from:join(stage,'new'),to:newTo,backup:join(stage,'b2'),hadOriginal:false}]}));
  recoverTransaction(journal);assert.equal(readFileSync(to,'utf8'),'original');assert.equal(existsSync(newTo),false);
});

test('image handling decodes uploads, preserves portrait dimensions and rejects non-images',async t=>{
  const {repo}=fixture(t);const path=join(repo,'image.png');
  const bytes=await sharp({create:{width:120,height:180,channels:3,background:'#aabbcc'}}).jpeg().toBuffer();
  await saveDraftImage(bytes,path);const meta=await sharp(path).metadata();assert.equal(meta.width,120);assert.equal(meta.height,180);assert.equal(meta.format,'png');
  const noise=await sharp(randomBytes(900*900*3),{raw:{width:900,height:900,channels:3}}).png().toBuffer();
  assert.ok(noise.length>2*1024*1024);
  await saveDraftImage(noise,join(repo,'large.png'));
  assert.ok(readFileSync(join(repo,'large.png')).length<2*1024*1024);
  await assert.rejects(()=>saveDraftImage(Buffer.from('<svg></svg>'),path));
  assert.ok(readFileSync(path).length<2*1024*1024);
});

test('supporting material is escaped and appears separately from verse',()=>{
  const html=supportingHtml('Biology <script>bad()</script>',[{id:'su-shi',citation:'Su Shi',url:'https://example.org/source',quote:'<unsafe>'}],'en');
  assert.match(html,/poem-commentary/);assert.match(html,/poem-references/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;unsafe&gt;/);
});

test('draft API requires auth middleware, rejects cross-origin mutations and stale saves, and keeps images private',async t=>{
  const {store}=fixture(t);const app=express();app.use(express.json());
  app.use('/api/drafts',(req,res,next)=>{if(req.get('x-test-auth')!=='yes')return res.status(401).json({error:'Unauthorized'});next();},curatorRouter(store));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));t.after(()=>server.close());
  const addr=server.address();assert.ok(addr&&typeof addr==='object');const base=`http://127.0.0.1:${addr.port}/api/drafts`;
  assert.equal((await fetch(base)).status,401);
  assert.equal((await fetch(base,{method:'POST',headers:{'x-test-auth':'yes','content-type':'application/json',Origin:'https://attacker.example'},body:'{}'})).status,403);
  const d=create(store);
  assert.equal((await fetch(`${base}/${d.id}/image`)).status,401);
  assert.equal((await fetch(`${base}/${d.id}`,{method:'PUT',headers:{'x-test-auth':'yes','content-type':'application/json'},body:JSON.stringify({revision:999,poem:'overwrite'})})).status,409);
  assert.equal((await fetch(`${base}/${d.id}/save-locally`,{method:'POST',headers:{'x-test-auth':'yes','content-type':'application/json'},body:JSON.stringify({revision:d.revision})})).status,400);
});

test('AI results stay proposals; failed calls and results arriving after source edits do not overwrite a draft',async t=>{
  const {store}=fixture(t);let d=create(store);d=store.approve(d.id,d.revision,'source');
  let resolveProposal: (value:string)=>void=()=>{};
  let started: (()=>void)|undefined;
  let pendingStart = new Promise<void>(resolve=>{started=resolve;});
  const app=express();app.use(express.json());app.use('/api/drafts',curatorRouter(store,{
    proposeText:()=>new Promise<string>(resolve=>{resolveProposal=resolve;started?.();}),
    illustrate:async()=>{throw new Error('Image service unavailable');},
  }));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));t.after(()=>server.close());
  const addr=server.address();assert.ok(addr&&typeof addr==='object');const base=`http://127.0.0.1:${addr.port}/api/drafts/${d.id}`;
  const request=fetch(base+'/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:d.revision,kind:'editorial'})});
  await pendingStart;
  // Complete the request with a proposal, then verify it has no editorial approval side effect.
  resolveProposal('Proposed spelling correction');const response=await request;assert.equal(response.status,200);
  d=store.read(d.id);assert.equal(d.poem,d.original);assert.equal(d.editorial?.text,'Proposed spelling correction');
  pendingStart = new Promise<void>(resolve=>{started=resolve;});
  const stale=fetch(base+'/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:d.revision,kind:'translation'})});
  await pendingStart;
  const changed=store.update(d.id,d.revision,{poem:d.poem+'\nA new line.'});
  resolveProposal('A translation of the older poem');assert.equal((await stale).status,409);
  assert.equal(store.read(d.id).poem,changed.poem);assert.equal(store.read(d.id).translation,'');
  const imageFailure=await fetch(base+'/illustrate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:changed.revision,prompt:'Mayfly swarm'})});
  assert.equal(imageFailure.status,400);assert.equal(store.read(d.id).image,undefined);
});
