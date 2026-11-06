/** Optional real-browser smoke test using the existing Remotion browser driver. No AI/network services or Git. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import express from 'express';
import { openBrowser } from '@remotion/renderer';
import sharp from 'sharp';
import { DraftStore } from '../server/curator/store.js';
import { curatorRouter } from '../server/curator/routes.js';

const repo = mkdtempSync(join(tmpdir(), 'poetry-browser-'));
mkdirSync(join(repo,'poems'));mkdirSync(join(repo,'public/media/poems'),{recursive:true});mkdirSync(join(repo,'src'));
for(const name of ['scripts','node_modules'])symlinkSync(resolve(name),join(repo,name));
const store=new DraftStore(repo);
const app=express();app.use(express.json());app.get('/api/me',(_req,res)=>res.json({authenticated:true}));app.get('/api/poems',(_req,res)=>res.json([]));
app.use('/api/drafts',curatorRouter(store));app.use('/admin',express.static(resolve('server/public')));app.use('/export',express.static(join(repo,'export')));
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const addr=server.address();assert.ok(addr&&typeof addr==='object');const origin=`http://127.0.0.1:${addr.port}`;
const browser=await openBrowser('chrome',{browserExecutable:process.env.BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',logLevel:'error'});
try {
  const page=await browser.newPage({context:'browser-smoke',logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
  await page.setViewport({width:1100,height:900,deviceScaleFactor:1});
  const errors: string[]=[];page.on('pageerror',err=>errors.push(String(err)));
  await page.goto({url:origin+'/admin/index.html',timeout:10000});
  const until=async(expression:string)=>{
    for(let i=0;i<160;i++) { if(await page.evaluate(expression))return; await new Promise(r=>setTimeout(r,50)); }
    throw new Error(`Browser timed out: ${expression}\n${await page.evaluate('document.getElementById("ingestion").innerText')}`);
  };
  const click=async(selector:string)=>{await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
  await until('!!document.querySelector("[data-action=new]")');await click('[data-action=new]');
  const input=JSON.parse(readFileSync(new URL('./fixtures/eendagsvlieg.json',import.meta.url),'utf8'));
  await page.evaluate(`(() => {const input=${JSON.stringify(input)};for(const key of ['slug','titleAf','author','poem','commentaryAf']){const el=document.getElementById('curator-'+key);el.value=input[key];el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await click('[data-action=create]');await until('!!document.querySelector("[data-action=source]")');
  assert.equal(store.list()[0].original,input.poem);
  await click('[data-action=source]');await until('!!document.querySelector("[data-action=translation]")');
  await page.evaluate(`document.getElementById('curator-translation').value='# Mayfly\\n\\nA fleeting moment between heaven and earth.';document.getElementById('curator-translation').dispatchEvent(new Event('input',{bubbles:true}))`);
  await click('[data-action=translation]');await until('!!document.getElementById("curator-upload")');
  const bytes=await sharp({create:{width:120,height:180,channels:3,background:'#92a9a6'}}).png().toBuffer();
  await page.evaluate(`(() => {const bytes=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'portrait.png',{type:'image/png'}));document.getElementById('curator-upload').files=transfer.files;})()`);
  await click('[data-action=upload]');await until('!!document.querySelector("[data-action=image]")');
  await until('document.querySelector("#ingestion img").complete && document.querySelector("#ingestion img").naturalWidth>0');
  await click('[data-action=image]');await until('!!document.querySelector("[data-action=review]")');
  const preview=await page.evaluate('fetch(document.querySelector("#ingestion iframe").src).then(r=>r.text())');
  assert.match(preview,/Na maande in modderslik/);assert.match(preview,/Filosofiese verwysings/);assert.match(preview,/Ephemeroptera/);assert.match(preview,/A fleeting moment/);
  await click('[data-action=files]');await until('document.getElementById("curator-files").innerText.includes("config.json")');
  {
    const screenshotPath=process.env.CURATOR_SCREENSHOT || join(tmpdir(),'poetry-curator-browser.png');
    const screenshot=await page._client().send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(screenshotPath,Buffer.from(screenshot.value.data,'base64'));
  }
  await click('[data-action=review]');await until('!!document.querySelector("[data-action=local]")');
  await click('[data-action=local]');await until('document.getElementById("ingestion").innerText.includes("Files remain uncommitted")');
  assert.ok(store.list()[0].saved);assert.deepEqual(errors,[]);
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  assert.equal(await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);
  console.log('Browser smoke passed: create, source approval, manual translation approval, upload, preview, files, local save and mobile width. No AI calls or Git operations.');
} finally {await browser.close({silent:true});server.close();rmSync(repo,{recursive:true,force:true});}
