/* Guided ingestion lives inside the existing Curator and never invokes Git. */
(() => {
  const host = document.createElement('div');
  host.id = 'ingestion'; host.className = 'card';
  document.getElementById('messages').after(host);
  const legacy = document.getElementById('add-poem-form');
  legacy.hidden = true;
  if (legacy.previousElementSibling) legacy.previousElementSibling.hidden = true;
  if (legacy.previousElementSibling?.previousElementSibling) legacy.previousElementSibling.previousElementSibling.hidden = true;
  const style = document.createElement('style');
  style.textContent = `#ingestion textarea{min-height:9rem;font:inherit;line-height:1.6}#ingestion .steps{display:flex;gap:.4rem;flex-wrap:wrap;margin:1rem 0}#ingestion .steps button[aria-current=step]{background:var(--accent);color:white}#ingestion .status{padding:.7rem;background:#222b3b;border-radius:5px}#ingestion .draft-row{display:flex;gap:.8rem;align-items:center;margin:.7rem 0}#ingestion .reference{border:1px solid var(--border);padding:.8rem;margin:.7rem 0}#ingestion .reference textarea{min-height:4rem}#ingestion iframe{width:100%;height:65vh;border:1px solid var(--border);background:white}#ingestion img{max-height:28rem;max-width:100%;object-fit:contain}#ingestion .diff{white-space:pre-wrap;border:1px solid var(--border);padding:1rem;max-height:25rem;overflow:auto}#ingestion .added{background:#173d2c;color:#bce9cc;display:block}#ingestion .removed{background:#47252a;color:#f3c4c7;display:block}#ingestion .error{white-space:pre-wrap;color:#ffb6b6}#ingestion .actions{margin-top:1rem}#ingestion .hint{color:var(--muted);font-size:.9rem}`;
  document.head.append(style);
  let draft = null, step = 0, refs = [], busy = false;
  let dirty = false;
  const steps = ['Submit', 'Editorial review', 'Translation', 'Illustration', 'Preview & files', 'Save locally'];
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => document.getElementById('curator-' + id);
  const field = (key, label, value = '', multiline = false, attrs = '') => `<label for="curator-${key}">${label}</label><${multiline ? 'textarea' : 'input'} id="curator-${key}" data-field="${key}" ${attrs}${multiline ? `>${e(value)}</textarea>` : ` value="${e(value)}">`}`;
  async function api(path, options = {}) {
    const response = await fetch('/api/drafts' + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed'); return data;
  }
  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
  function referenceRows() {
    return refs.map((r, i) => `<div class="reference" data-ref="${i}">${field(`ref-id-${i}`, 'Reference ID', r.id)}${field(`ref-citation-${i}`, 'Citation / edition / passage', r.citation)}${field(`ref-url-${i}`, 'Source link (optional)', r.url)}${field(`ref-quote-${i}`, 'Quoted passage (optional)', r.quote, true)}<button type="button" class="secondary" data-remove-ref="${i}">Remove reference</button></div>`).join('');
  }
  function collectRefs() {
    refs = refs.map((r, i) => ({ id: byId(`ref-id-${i}`)?.value ?? r.id, citation: byId(`ref-citation-${i}`)?.value ?? r.citation,
      url: byId(`ref-url-${i}`)?.value ?? r.url ?? '', quote: byId(`ref-quote-${i}`)?.value ?? r.quote ?? '' }));
    return refs;
  }
  function fields() {
    const data = {};
    host.querySelectorAll('[data-field]').forEach(el => { if (!el.dataset.field.startsWith('ref-')) data[el.dataset.field] = el.value; });
    if (byId('references')) data.references = collectRefs();
    return data;
  }
  async function saveFields() {
    if (!draft || draft.saved || !dirty) return;
    draft = await api('/' + draft.id, { method: 'PUT', body: JSON.stringify({ ...fields(), revision: draft.revision }) });
    dirty = false;
  }
  function buttons() { host.querySelectorAll('button').forEach(b => { b.disabled = busy || Boolean(draft?.saved && b.dataset.action && !['back','files'].includes(b.dataset.action)); }); }
  async function run(fn) {
    if (busy) return;
    busy = true; buttons(); byId('error').textContent = ''; byId('progress').textContent = 'Working…';
    try { await fn(); } catch (err) { byId('error').textContent = err.message; }
    finally { busy = false; buttons(); byId('progress').textContent = ''; }
  }
  function diff(before, after) {
    const a = before.split('\n'), b = after.split('\n');
    if (a.length * b.length > 1000000) return `<span class="removed">Original\n${e(before)}</span><span class="added">Proposal\n${e(after)}</span>`;
    const dp = Array.from({length:a.length+1}, () => new Uint32Array(b.length+1));
    for (let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) dp[i][j] = a[i]===b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
    let i=0,j=0,html='';
    while(i<a.length || j<b.length) {
      if(i<a.length && j<b.length && a[i]===b[j]) {html+=e('  '+a[i])+'\n';i++;j++;}
      else if(j<b.length && (i===a.length || dp[i][j+1]>=dp[i+1][j])) html+=`<span class="added">+ ${e(b[j++])}</span>`;
      else html+=`<span class="removed">− ${e(a[i++])}</span>`;
    }
    return html;
  }
  function shell(content) {
    host.innerHTML = `<h2>Add & review a poem</h2>${draft ? `<p class="status">${e(draft.titleAf || draft.titleEn || draft.slug)} · ${e(draft.state)}</p><nav class="steps" aria-label="Poem workflow">${steps.map((label,i) => `<button type="button" class="secondary" data-step="${i}" ${step===i ? 'aria-current="step"' : ''}>${i+1}. ${label}</button>`).join('')}</nav>` : ''}<div id="curator-content">${content}</div><p id="curator-error" class="error" role="alert"></p><p id="curator-progress" role="status"></p>${draft ? '<button type="button" class="secondary" data-action="back">Back to drafts</button>' : ''}`;
    host.querySelectorAll('[data-step]').forEach(b => b.onclick = () => run(async () => { await saveFields(); step = Number(b.dataset.step); render(); }));
    host.querySelectorAll('[data-action]').forEach(b => b.onclick = () => run(() => action(b.dataset.action)));
    host.querySelectorAll('input,textarea,select').forEach(el => el.addEventListener('input', () => { dirty = true; }));
    if (draft?.saved) host.querySelectorAll('input,textarea,select').forEach(el => el.disabled = true);
    const file = byId('import');
    if(file) file.onchange = () => run(async () => { const f=file.files[0]; if(!f)return; if(f.size>100000)throw new Error('Use a text file smaller than 100 KB.'); byId('poem').value = await f.text(); dirty=true; });
    const add = byId('add-reference');
    if(add) add.onclick = () => { collectRefs(); refs.push({id:`ref-${refs.length+1}`,citation:''}); byId('references').innerHTML = referenceRows(); wireReferences(); dirty=true; };
    wireReferences(); buttons();
  }
  function wireReferences() {
    host.querySelectorAll('[data-remove-ref]').forEach(b => b.onclick = () => { collectRefs(); refs.splice(Number(b.dataset.removeRef),1); byId('references').innerHTML=referenceRows(); wireReferences(); dirty=true; });
    byId('references')?.querySelectorAll('input,textarea').forEach(el => el.oninput = () => {dirty=true;});
  }
  async function home() {
    const drafts = await api(''); draft=null; dirty=false; refs=[];
    shell(`<p class="hint">Prepare and inspect a poem here. Saving locally leaves files uncommitted. Pushing later activates the existing deployment workflow.</p><button type="button" data-action="new">New poem</button><div>${drafts.map(d => `<div class="draft-row"><button type="button" class="secondary" data-open="${e(d.id)}">${e(d.titleAf || d.titleEn || d.slug || 'Untitled draft')}</button><span>${e(d.state)}</span></div>`).join('') || '<p>No drafts yet.</p>'}</div>`);
    host.querySelectorAll('[data-open]').forEach(b => b.onclick=()=>run(async()=>{draft=await api('/'+b.dataset.open);refs=draft.references;step=draft.saved?5:0;render();}));
  }
  function submitForm(d) {
    return `${!d ? '<label for="curator-sourceLanguage">Original language</label><select id="curator-sourceLanguage" data-field="sourceLanguage"><option value="af">Afrikaans</option><option value="en">English</option></select>' : `<p>Original language: ${d.sourceLanguage==='af'?'Afrikaans':'English'}</p>`}
      <div class="row"><div>${field('titleAf','Afrikaans title',d?.titleAf)}</div><div>${field('titleEn','English title',d?.titleEn)}</div></div>
      <div class="row"><div>${field('slug','Poem ID (optional; generated from title)',d?.slug || '',false,'placeholder="eendagsvlieg"')}</div><div>${field('author','Author',d?.author ?? 'Ian de Beer')}</div></div>
      <label for="curator-import">Import poem (.md or .txt)</label><input type="file" id="curator-import" accept=".md,.txt,text/plain,text/markdown">
      ${field('poem','Poem — preserve line and stanza breaks',d?.poem,'textarea')}
      <details><summary>Commentary, background & references</summary><p class="hint">Keep philosophical discussion, explanatory notes and biological or historical background here. Add footnote markers and definitions in the poem only where intended.</p>
      ${field('commentaryAf','Afrikaans commentary',d?.commentaryAf,true)}${field('commentaryEn','English commentary',d?.commentaryEn,true)}<div id="curator-references">${referenceRows()}</div><button type="button" id="curator-add-reference" class="secondary">Add reference</button></details>
      <div class="actions"><button type="button" data-action="${d?'save':'create'}">${d?'Save draft':'Create private draft'}</button></div>`;
  }
  function render() {
    refs = draft.references;
    let content='';
    if(step===0)content=submitForm(draft);
    if(step===1)content=`<p class="hint">The original remains archived. Review any proposed changes before accepting them; you can edit the working poem to accept only selected corrections.</p><details><summary>Original submission</summary><pre>${e(draft.original)}</pre></details>${field('poem','Working poem',draft.poem,true)}<div class="actions"><button data-action="editorial">Suggest corrections with AI</button><button data-action="source">Approve working poem as shown</button></div>${draft.editorial?`<h3>Proposed changes</h3><div class="diff">${diff(draft.poem,draft.editorial.text)}</div><div class="actions"><button data-action="accept-editorial">Accept proposed version</button><button class="secondary" data-action="reject-editorial">Reject proposal</button></div>`:''}`;
    if(step===2)content=`<p class="hint">Translation into ${draft.sourceLanguage==='af'?'English':'Afrikaans'}. AI generation sends the poem and supporting context to OpenAI; API charges may apply.</p>${field('translation','Translation candidate',draft.translation,true)}<div class="actions"><button data-action="translate">Generate translation</button><button data-action="translation">Approve translation as shown</button><button class="secondary" data-action="skip-translation">Continue without translation</button></div>`;
    if(step===3)content=`<p class="hint">Upload a still PNG, JPEG or WebP (up to 20 MiB). It will be optimized below 2 MiB while retaining its proportions.</p><input type="file" id="curator-upload" accept="image/png,image/jpeg,image/webp"><button data-action="upload">Upload selected image</button>${field('prompt','Or describe an AI illustration','',true)}<p class="hint">Generation uses the OpenAI API and may incur charges.</p><button data-action="illustrate">Generate portrait illustration</button>${draft.image?`<p><img src="/api/drafts/${draft.id}/image?v=${draft.image.hash}" alt="Illustration candidate"></p><button data-action="image">Approve this illustration</button>`:''}`;
    if(step===4)content=`<p>Inspect both languages, illustration, commentary and references. Changes require a fresh final approval.</p><p><a href="/api/drafts/${draft.id}/preview?v=${draft.revision}" target="_blank" rel="noopener">Open full preview in a new tab</a></p><iframe sandbox="" title="Complete poem preview" src="/api/drafts/${draft.id}/preview?v=${draft.revision}"></iframe><div class="actions"><button data-action="files" class="secondary">Inspect proposed files</button><button data-action="review">Approve complete preview</button></div><div id="curator-files"></div>`;
    if(step===5)content=draft.saved?`<p class="status">Saved locally. Files remain uncommitted. The live website has not been updated.</p><p>Inspect the generated files and Git diff before committing and pushing. A later push triggers the existing deployment workflow.</p><a href="/export/${e(draft.saved.slug)}/${draft.sourceLanguage==='af'?'afrikaans':'english'}.html" target="_blank" rel="noopener">Open saved local poem</a><p><a href="/export/" target="_blank" rel="noopener">Open local anthology</a></p>`:`<p>Save approved files into the repository and rebuild the local anthology. This does not commit, push or deploy.</p>${draft.issues.length||draft.conflicts.length?`<ul>${[...draft.issues,...draft.conflicts].map(x=>`<li>${e(x)}</li>`).join('')}</ul>`:''}<p>State: ${e(draft.state)}</p><button data-action="local">Save approved poem locally</button>`;
    shell(content);
  }
  async function action(name) {
    if(name==='new'){draft=null;refs=[];dirty=false;shell(submitForm(null));return;}
    if(name==='create'){draft=await post('',fields());dirty=false;step=1;render();return;}
    if(name==='back'){await saveFields();await home();return;}
    if(name==='reject-editorial') {
      await saveFields();
      draft=await post('/'+draft.id+'/approve',{revision:draft.revision,action:'reject-editorial'});render();return;
    }
    const prompt=byId('prompt')?.value;
    const upload=byId('upload')?.files[0];
    await saveFields();
    if(name==='save'){render();return;}
    if(name==='editorial'||name==='translate')draft=await post('/'+draft.id+'/ai',{revision:draft.revision,kind:name==='editorial'?'editorial':'translation'});
    else if(name==='illustrate')draft=await post('/'+draft.id+'/illustrate',{revision:draft.revision,prompt});
    else if(name==='upload'){
      if(!upload)throw new Error('Select an image first.');
      if(upload.size>20*1024*1024)throw new Error('Use an image smaller than 20 MiB.');
      draft=await api('/'+draft.id+'/image?revision='+draft.revision,{method:'POST',headers:{'Content-Type':upload.type},body:upload});
    }else if(name==='files'){
      const data=await api('/'+draft.id+'/files');
      byId('files').innerHTML=`<p>New source files, plus ${e(data.image)}. ${e(data.index)}.</p>`+data.files.map(f=>`<details><summary>+ ${e(f.path)}</summary><pre>${e(f.content)}</pre></details>`).join('');return;
    }else if(name==='local')draft=await post('/'+draft.id+'/save-locally',{revision:draft.revision});
    else {
      const approval=name==='accept-editorial'?'editorial':name;
      draft=await post('/'+draft.id+'/approve',{revision:draft.revision,action:approval});
      if(['source','accept-editorial','translation','skip-translation','image','review'].includes(name))step=Math.min(5,step+1);
    }
    dirty=false;render();
  }
  window.addEventListener('beforeunload', event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  // Initialize after login; drafts are never fetched unauthenticated.
  const observer=new MutationObserver(()=>{if(!document.getElementById('admin-view').classList.contains('hidden')&&!host.dataset.loaded){host.dataset.loaded='yes';home().catch(err=>shell(`<p>${e(err.message)}</p>`));}else if(document.getElementById('admin-view').classList.contains('hidden')){delete host.dataset.loaded;host.innerHTML='';draft=null;}});
  observer.observe(document.getElementById('admin-view'),{attributes:true,attributeFilter:['class']});
})();
