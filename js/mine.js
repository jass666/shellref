/* ==========================================================================
   shellref — your library: saved commands + File-builder presets
   ==========================================================================
   Two layers, merged at load time:
     1. js/my-commands.js (MY_LIBRARY_FILE) — the permanent copy, shipped with
        the site. Edited only by replacing that file ("Export for repo").
     2. localStorage — what you save/edit/delete in the browser. Instant, but
        browser-only until you export it.

   Saved commands are injected into DATA as section 'mine', so search, Browse,
   Merge, and the "All commands" view all pick them up with no special cases.
   Presets are only read by the File builder (js/filebuilder.js).

   Loads after data.js / my-commands.js / sections.js and before generators.js.
   Uses escapeHtml, doCopy, copyToClipboard, showAddFeedback, setStats from
   app.js and refKey/combineOrder from generators.js — only at call time.
   ========================================================================== */

const MINE_LS_KEY = 'shellref-my-commands';
const MINE_DEL_KEY = 'shellref-my-deleted';
const PRESET_LS_KEY = 'shellref-fb-presets';
const PRESET_DEL_KEY = 'shellref-fb-presets-deleted';
const MINE_SHELLS = ['', 'cmd', 'powershell', 'unix'];

function lsGetJSON(key, fallback){
  try{ const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch(e){ return fallback; }
}
function lsSetJSON(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e){ return false; }
}

// escapeHtml (app.js) leaves quotes alone, which is fine for text nodes but not
// for attribute values — user-entered URLs go through this one instead.
function escapeAttr(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const FILE_LIB = (typeof MY_LIBRARY_FILE !== 'undefined' && MY_LIBRARY_FILE) || {};
const FILE_COMMANDS = Array.isArray(FILE_LIB.commands) ? FILE_LIB.commands : [];
const FILE_PRESETS = Array.isArray(FILE_LIB.presets) ? FILE_LIB.presets : [];

let mineLocal = lsGetJSON(MINE_LS_KEY, []);
let mineDeleted = lsGetJSON(MINE_DEL_KEY, []);
let presetLocal = lsGetJSON(PRESET_LS_KEY, []);
let presetDeleted = lsGetJSON(PRESET_DEL_KEY, []);
if(!Array.isArray(mineLocal)) mineLocal = [];
if(!Array.isArray(mineDeleted)) mineDeleted = [];
if(!Array.isArray(presetLocal)) presetLocal = [];
if(!Array.isArray(presetDeleted)) presetDeleted = [];
let libStorageOk = true;
let persistAsked = false;

function mineNormalize(raw){
  if(!raw || typeof raw !== 'object') return null;
  const command = String(raw.command == null ? '' : raw.command).replace(/\r\n?/g, '\n').replace(/\s+$/,'');
  if(!command.trim()) return null;
  let uid = Number(raw.uid);
  if(!isFinite(uid) || uid < 100000) uid = 0; // 0 = needs a fresh uid (kept clear of built-in DATA ids)
  const shell = MINE_SHELLS.includes(raw.shell) ? raw.shell : '';
  return {
    uid,
    title: String(raw.title || '').trim().slice(0, 120),
    command,
    desc: String(raw.desc || '').trim().slice(0, 600),
    shell,
    group: String(raw.group || '').trim().slice(0, 60),
    src: String(raw.src || '').trim().slice(0, 500),
    ts: Number(raw.ts) || Date.now(),
  };
}

function mineSame(a, b){
  return a.title===b.title && a.command===b.command && a.desc===b.desc && a.shell===b.shell && a.group===b.group && a.src===b.src;
}

function mineNextUid(){
  let max = Math.max(100000, Date.now());
  mineLocal.concat(FILE_COMMANDS).forEach(e=>{ const u = Number(e && e.uid); if(isFinite(u) && u >= max) max = u + 1; });
  return max;
}

// File entries (minus anything you deleted) overlaid by your local edits, newest first.
function mineEffective(){
  const map = new Map();
  FILE_COMMANDS.map(mineNormalize).filter(e=>e && e.uid).forEach(e=>{
    if(!mineDeleted.includes(e.uid)) map.set(e.uid, Object.assign({}, e, {inFile:true, dirty:false}));
  });
  mineLocal.map(mineNormalize).filter(e=>e && e.uid).forEach(e=>{
    const f = map.get(e.uid);
    if(f) map.set(e.uid, Object.assign({}, e, {inFile:true, dirty: !mineSame(e, f)}));
    else map.set(e.uid, Object.assign({}, e, {inFile:false, dirty:false}));
  });
  return [...map.values()].sort((a,b)=>b.ts - a.ts);
}

function mineToDataItem(e){
  const firstLine = (e.command.split('\n').find(l=>l.trim()) || e.command).trim();
  return {
    s:'mine', t: e.group || 'Saved from web', sh: e.shell || undefined,
    cmd: e.title || firstLine.slice(0, 100),
    tpl: e.command,                       // token template (see itemTemplate in generators.js)
    desc: e.desc || '', ex: e.command,
    kw: (e.src || '') + ' saved custom mine',
    src: e.src, mine: true, inFile: e.inFile, dirty: e.dirty,
    _id: e.uid, uid: e.uid,
  };
}

function mineSync(){
  for(let i = DATA.length - 1; i >= 0; i--){ if(DATA[i].s === 'mine') DATA.splice(i, 1); }
  mineEffective().forEach(e=>DATA.push(mineToDataItem(e)));
}

function mineRequestPersist(){
  if(persistAsked) return;
  persistAsked = true;
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
}

function libSaveAll(){
  libStorageOk = lsSetJSON(MINE_LS_KEY, mineLocal)
    && lsSetJSON(MINE_DEL_KEY, mineDeleted)
    && lsSetJSON(PRESET_LS_KEY, presetLocal)
    && lsSetJSON(PRESET_DEL_KEY, presetDeleted);
  mineRequestPersist();
  mineSync();
  if(typeof setStats === 'function') setStats();
}

// Returns 'ok' | 'dup' | 'empty'.
function mineAddEntry(raw){
  const e = mineNormalize(raw);
  if(!e) return 'empty';
  const dup = mineEffective().some(x=>x.command.trim() === e.command.trim() && x.shell === e.shell);
  if(dup) return 'dup';
  e.uid = mineNextUid();
  e.ts = Date.now();
  mineLocal.push(e);
  libSaveAll();
  return 'ok';
}

function mineUpdateEntry(uid, raw){
  const e = mineNormalize(Object.assign({}, raw, {uid}));
  if(!e) return false;
  const cur = mineEffective().find(x=>x.uid === uid);
  e.ts = cur ? cur.ts : Date.now();
  const i = mineLocal.findIndex(x=>Number(x.uid) === uid);
  if(i === -1) mineLocal.push(e); else mineLocal[i] = e;
  libSaveAll();
  return true;
}

function mineRemoveEntry(uid){
  mineLocal = mineLocal.filter(x=>Number(x.uid) !== uid);
  if(FILE_COMMANDS.some(x=>Number(x.uid) === uid) && !mineDeleted.includes(uid)) mineDeleted.push(uid);
  // drop any dangling reference from the Merge list
  const key = 'ref:' + uid;
  if(typeof combineOrder !== 'undefined'){
    combineOrder = combineOrder.filter(k=>k !== key);
    if(typeof combineTokenValues !== 'undefined') delete combineTokenValues[uid];
  }
  libSaveAll();
}

// ---------- presets (File builder) ----------
function presetsEffective(){
  const map = new Map();
  FILE_PRESETS.forEach(p=>{
    if(p && p.id && p.tpl && p.values && !presetDeleted.includes(p.id)) map.set(p.id, Object.assign({}, p, {inFile:true}));
  });
  presetLocal.forEach(p=>{
    if(p && p.id && p.tpl && p.values) map.set(p.id, Object.assign({}, p, {inFile: map.has(p.id)}));
  });
  return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}

function presetList(tplId){ return presetsEffective().filter(p=>p.tpl === tplId); }

// Saving under an existing name for the same template overwrites it.
function presetSave(tplId, name, values){
  name = String(name || '').trim().slice(0, 60) || 'Untitled preset';
  const existing = presetList(tplId).find(p=>p.name.toLowerCase() === name.toLowerCase());
  const id = existing ? existing.id : 'p' + mineNextUid();
  const entry = { id, tpl: tplId, name, values: JSON.parse(JSON.stringify(values)), ts: Date.now() };
  const i = presetLocal.findIndex(p=>p.id === id);
  if(i === -1) presetLocal.push(entry); else presetLocal[i] = entry;
  libSaveAll();
  return id;
}

function presetRemove(id){
  presetLocal = presetLocal.filter(p=>p.id !== id);
  if(FILE_PRESETS.some(p=>p && p.id === id) && !presetDeleted.includes(id)) presetDeleted.push(id);
  libSaveAll();
}

// ---------- export / import ----------
function libSnapshot(){
  return {
    commands: mineEffective().map(e=>({uid:e.uid, title:e.title, command:e.command, desc:e.desc, shell:e.shell, group:e.group, src:e.src, ts:e.ts})),
    presets: presetsEffective().map(p=>({id:p.id, tpl:p.tpl, name:p.name, values:p.values, ts:p.ts})),
  };
}

function libDateStamp(){ return new Date().toISOString().slice(0, 10); }

function exportLibraryJson(){
  const lib = Object.assign({app:'shellref', version:1, exported:new Date().toISOString()}, libSnapshot());
  downloadTextFile('shellref-library-' + libDateStamp() + '.json', JSON.stringify(lib, null, 2) + '\n');
  mineMsg = {ok:true, text:'Backup downloaded. Re-import it any time with "Import".'};
  renderMine();
}

function exportLibraryForRepo(){
  const header = '/* shellref — your permanent library (exported ' + libDateStamp() + ').\n   Replace js/my-commands.js with this file, then run Push_Launcher.bat. */\n\n';
  downloadTextFile('my-commands.js', header + 'const MY_LIBRARY_FILE = ' + JSON.stringify(libSnapshot(), null, 2) + ';\n');
  mineMsg = {ok:true, text:'Downloaded my-commands.js. Put it in your project\'s js/ folder (replace the old one), then push.'};
  renderMine();
}

function mineImportFile(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    let data = null;
    const text = String(reader.result || '');
    try{ data = JSON.parse(text); }
    catch(e){
      try{ data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }catch(e2){ data = null; }
    }
    if(!data || (!Array.isArray(data.commands) && !Array.isArray(data.presets))){
      mineMsg = {ok:false, text:'That file is not a shellref library (.json from "Export backup" or my-commands.js).'};
      renderMine();
      return;
    }
    let added = 0, updated = 0, skipped = 0, pAdded = 0;
    (data.commands || []).forEach(raw=>{
      const e = mineNormalize(raw);
      if(!e){ skipped++; return; }
      const eff = mineEffective();
      const byUid = e.uid ? eff.find(x=>x.uid === e.uid) : null;
      if(byUid){
        if(mineSame(byUid, e)){ skipped++; return; }
        mineUpdateEntry(e.uid, e); updated++; return;
      }
      if(eff.some(x=>x.command.trim() === e.command.trim() && x.shell === e.shell)){ skipped++; return; }
      const uidFree = e.uid && !eff.some(x=>x.uid === e.uid);
      e.uid = uidFree ? e.uid : mineNextUid();
      mineLocal.push(e);
      libSaveAll();
      added++;
    });
    (data.presets || []).forEach(p=>{
      if(!p || !p.id || !p.tpl || !p.values || typeof p.values !== 'object') return;
      const cur = presetsEffective().find(x=>x.id === p.id);
      if(cur && JSON.stringify(cur.values) === JSON.stringify(p.values) && cur.name === p.name) return;
      const i = presetLocal.findIndex(x=>x.id === p.id);
      const entry = {id:String(p.id), tpl:String(p.tpl), name:String(p.name||'Imported preset').slice(0,60), values:p.values, ts:Number(p.ts)||Date.now()};
      if(i === -1) presetLocal.push(entry); else presetLocal[i] = entry;
      libSaveAll();
      pAdded++;
    });
    mineMsg = {ok:true, text:`Import done — ${added} added, ${updated} updated, ${skipped} skipped${pAdded ? `, ${pAdded} preset${pAdded!==1?'s':''} merged` : ''}.`};
    renderMine();
  };
  reader.onerror = ()=>{ mineMsg = {ok:false, text:'Could not read that file.'}; renderMine(); };
  reader.readAsText(file);
}

// ---------- quick-save from the generator ----------
function mineQuickSave(title, shell, command, group, btn){
  const r = mineAddEntry({title, shell: shell === 'unix' || shell === 'cmd' || shell === 'powershell' ? shell : '', command, group});
  if(btn){
    btn.textContent = r === 'dup' ? 'already saved' : (r === 'ok' ? 'saved ✓' : 'nothing to save');
    btn.classList.toggle('copied', r === 'ok');
    setTimeout(()=>{ btn.textContent = '★ save'; btn.classList.remove('copied'); }, 1500);
  }
}

function saveGenToMine(btn){
  const task = GENERATORS.find(t=>t.id === genState.taskId);
  const command = currentGenOutput();
  if(!task || !command) return;
  mineQuickSave(task.label, genState.shell, command, 'Saved from generator', btn);
}

function saveGenBrowseToMine(btn){
  const item = currentBrowseItem();
  const command = currentBrowseOutput();
  if(!item || !command) return;
  // A filled-in template (e.g. "ping <Host>" -> "ping google.com") must not keep the
  // template as its title, or it looks identical to the unfilled entry. Blank title =
  // first line of the resolved command.
  const hasTokens = extractTokens(itemTemplate(item)).length > 0;
  mineQuickSave(hasTokens ? '' : item.cmd, item.sh || '', command, 'Saved from generator', btn);
}

// ---------- the "My saved commands" view ----------
let mineDraft = {title:'', command:'', desc:'', shell:'', group:'', src:''};
let mineEditUid = null;
let mineFormOpen = false;
let mineMsg = null; // {ok, text}

function mineResetDraft(){
  mineDraft = {title:'', command:'', desc:'', shell:'', group:'', src:''};
  mineEditUid = null;
}

function mineOriginTag(item){
  if(item.inFile && !item.dirty) return {cls:'repo', label:'in repo', tip:'Saved in js/my-commands.js — permanent and on every device.'};
  if(item.inFile && item.dirty) return {cls:'dirty', label:'edited — re-export', tip:'You changed a repo entry in this browser. Export for repo to make the edit permanent.'};
  return {cls:'local', label:'browser only', tip:'Saved in this browser. Use "Export for repo" to make it permanent.'};
}

function mineCardHtml(item, meta){
  const shellTag = item.sh ? `<span class="shell-tag" style="--shell-color:${SHELL_COLORS[item.sh]}">${SHELL_LABELS[item.sh]}</span>` : '';
  const cmdStyle = item.sh ? ` style="color:${SHELL_COLORS[item.sh]}"` : '';
  let srcHtml = '';
  if(/^https?:\/\//i.test(item.src || '')){
    let host = item.src;
    try{ host = new URL(item.src).hostname.replace(/^www\./, ''); }catch(e){}
    srcHtml = `<p class="mine-src">Source: <a href="${escapeAttr(item.src)}" target="_blank" rel="noopener noreferrer">${escapeHtml(host)}</a></p>`;
  }
  const o = mineOriginTag(item);
  return `<div class="card" style="--card-accent:${meta.color}">
    <div class="card-top">
      <div class="cmd"${cmdStyle}>${escapeHtml(item.cmd)}</div>
      ${shellTag}
    </div>
    ${item.desc ? `<p class="desc">${escapeHtml(item.desc)}</p>` : ''}
    ${srcHtml}
    <div class="example">${escapeHtml(item.ex)}<button class="copy-btn-inline" data-copy="${encodeURIComponent(item.ex)}" onclick="doCopy(this)">copy</button></div>
    <div class="mine-card-foot">
      <span class="mine-origin ${o.cls}" title="${escapeAttr(o.tip)}">${o.label}</span>
      <span class="mine-card-actions">
        <button type="button" class="copy-btn" onclick="mineAddToMerge(${item.uid}, this)" title="Add to the Merge commands list">+ merge</button>
        <button type="button" class="copy-btn" onclick="mineEdit(${item.uid})">edit</button>
        <button type="button" class="copy-btn mine-del" onclick="mineDelete(${item.uid})">delete</button>
      </span>
    </div>
  </div>`;
}

function mineFormHtml(){
  const d = mineDraft;
  const groups = [...new Set(['Saved from web', 'Saved from generator', 'Git', 'Windows tweaks'].concat(mineEffective().map(e=>e.group).filter(Boolean)))];
  const shellOpts = [['', 'Any / not shell-specific'], ['cmd', 'Command Prompt'], ['powershell', 'PowerShell'], ['unix', 'WSL / Unix']]
    .map(([v, l])=>`<option value="${v}"${d.shell === v ? ' selected' : ''}>${l}</option>`).join('');
  return `<div class="mine-form" id="mineForm">
    <div class="mine-form-title">${mineEditUid ? 'Edit saved command' : 'Save a command'}</div>
    <div class="gen-fields">
      <label class="gen-field fb-wide">
        <span class="gen-field-label">Command (paste it exactly as you found it — multiple lines are fine; use &lt;Name&gt; for blanks to fill in later)</span>
        <textarea class="gen-field-input fb-area" data-f="command" rows="4" oninput="onMineDraft(this)" spellcheck="false" placeholder="e.g. netsh winsock reset">${escapeHtml(d.command)}</textarea>
      </label>
      <label class="gen-field">
        <span class="gen-field-label">Title (optional — defaults to the first line)</span>
        <input type="text" class="gen-field-input" data-f="title" value="${escapeAttr(d.title)}" oninput="onMineDraft(this)" autocomplete="off" spellcheck="false">
      </label>
      <label class="gen-field">
        <span class="gen-field-label">Runs in</span>
        <select class="gen-field-input gen-field-select" data-f="shell" onchange="onMineDraft(this)">${shellOpts}</select>
      </label>
      <label class="gen-field">
        <span class="gen-field-label">Group (the subheading it sits under)</span>
        <input type="text" class="gen-field-input" data-f="group" list="mineGroups" placeholder="Saved from web" value="${escapeAttr(d.group)}" oninput="onMineDraft(this)" autocomplete="off" spellcheck="false">
        <datalist id="mineGroups">${groups.map(g=>`<option value="${escapeAttr(g)}">`).join('')}</datalist>
      </label>
      <label class="gen-field">
        <span class="gen-field-label">Source link (optional — where you found it)</span>
        <input type="text" class="gen-field-input" data-f="src" placeholder="https://…" value="${escapeAttr(d.src)}" oninput="onMineDraft(this)" autocomplete="off" spellcheck="false">
      </label>
      <label class="gen-field fb-wide">
        <span class="gen-field-label">Notes (what it does, gotchas — searchable)</span>
        <input type="text" class="gen-field-input" data-f="desc" value="${escapeAttr(d.desc)}" oninput="onMineDraft(this)" autocomplete="off">
      </label>
    </div>
    <div class="mine-form-btns">
      <button type="button" class="mine-btn primary" onclick="mineSubmit()">${mineEditUid ? 'Save changes' : 'Save command'}</button>
      <button type="button" class="mine-btn" onclick="mineCancel()">Cancel</button>
    </div>
  </div>`;
}

function renderMine(){
  const main = document.getElementById('main');
  const meta = SECTION_META.mine;
  const all = DATA.filter(i=>i.s === 'mine');
  const items = all.filter(matches);
  document.getElementById('resultCount').textContent = query ? `${items.length} match${items.length !== 1 ? 'es' : ''}` : '';

  const nRepo = all.filter(i=>i.inFile && !i.dirty).length;
  const nPresets = presetsEffective().length;
  const msgHtml = mineMsg ? `<div class="mine-msg ${mineMsg.ok ? 'ok' : 'err'}">${escapeHtml(mineMsg.text)}</div>` : '';
  const storageWarn = libStorageOk ? '' : `<div class="mine-msg err">This browser blocked saving (private window or storage full). Use "Export backup" so nothing is lost.</div>`;

  const toolbar = `<div class="mine-toolbar">
    <button type="button" class="mine-btn primary" onclick="mineToggleForm()">${mineFormOpen ? 'Close form' : '+ Add a command'}</button>
    <button type="button" class="mine-btn" onclick="exportLibraryForRepo()" title="Makes js/my-commands.js — replace the file in your project and push">⬇ Export for repo</button>
    <button type="button" class="mine-btn" onclick="exportLibraryJson()" title="A plain .json backup you can re-import">⬇ Export backup</button>
    <label class="mine-btn" title="Merge a backup .json (or a my-commands.js) into this browser">⬆ Import<input type="file" accept=".json,.js,application/json" onchange="mineImportFile(this)" hidden></label>
  </div>`;

  const stats = `<p class="mine-stats">${all.length} saved · ${nRepo} in repo · ${all.length - nRepo} browser only${nPresets ? ` · ${nPresets} script preset${nPresets !== 1 ? 's' : ''}` : ''}. Browser-only items live in this browser's storage; export for repo to keep them for good.</p>`;

  const groups = [...new Set(items.map(i=>i.t))].sort((a, b)=>a.localeCompare(b));
  let cardsHtml = '';
  groups.forEach(g=>{
    cardsHtml += `<div class="tier-label">${escapeHtml(g)}</div><div class="cards">${items.filter(i=>i.t === g).map(i=>mineCardHtml(i, meta)).join('')}</div>`;
  });
  if(!items.length){
    cardsHtml = `<div class="empty"><div class="display">${all.length ? 'No matches' : 'Nothing saved yet'}</div>${all.length ? 'Try a shorter search word.' : 'Hit "+ Add a command" and paste something you found on the web — or press ★ save on any generated command.'}</div>`;
  }

  main.innerHTML = `<div class="section" id="sec-mine">
    <div class="section-head"><h2>${meta.label}</h2><span class="tag" style="color:${meta.color}">${all.length}</span></div>
    <p class="section-sub">${meta.sub}</p>
    ${toolbar}${msgHtml}${storageWarn}
    ${mineFormOpen ? mineFormHtml() : ''}
    ${stats}
    ${cardsHtml}
  </div>`;
}

function onMineDraft(el){ mineDraft[el.getAttribute('data-f')] = el.value; }

function mineToggleForm(){
  if(mineFormOpen){ mineFormOpen = false; mineResetDraft(); }
  else { mineFormOpen = true; mineMsg = null; }
  renderMine();
  if(mineFormOpen){ const t = document.querySelector('#mineForm textarea'); if(t) t.focus(); }
}

function mineCancel(){ mineFormOpen = false; mineResetDraft(); renderMine(); }

function mineSubmit(){
  const d = mineDraft;
  if(!String(d.command).trim()){ mineMsg = {ok:false, text:'Paste a command first.'}; renderMine(); return; }
  if(d.src.trim() && !/^https?:\/\//i.test(d.src.trim())){ mineMsg = {ok:false, text:'The source link must start with http:// or https://.'}; renderMine(); return; }
  if(mineEditUid){
    mineUpdateEntry(mineEditUid, d);
    mineMsg = {ok:true, text:'Changes saved.'};
  } else {
    const r = mineAddEntry(d);
    if(r === 'dup'){ mineMsg = {ok:false, text:'You already saved that exact command for that shell.'}; renderMine(); return; }
    mineMsg = {ok:true, text:'Saved. It now shows up in search, Browse, and Merge too.'};
  }
  mineFormOpen = false;
  mineResetDraft();
  renderMine();
}

function mineEdit(uid){
  const e = mineEffective().find(x=>x.uid === uid);
  if(!e) return;
  mineDraft = {title:e.title, command:e.command, desc:e.desc, shell:e.shell, group:e.group, src:e.src};
  mineEditUid = uid;
  mineFormOpen = true;
  mineMsg = null;
  renderMine();
  const f = document.getElementById('mineForm');
  if(f) f.scrollIntoView({behavior:'smooth', block:'center'});
}

function mineDelete(uid){
  const e = mineEffective().find(x=>x.uid === uid);
  if(!e) return;
  const what = (e.title || e.command.split('\n')[0]).slice(0, 60);
  const extra = e.inFile ? '\n\n(It is also in js/my-commands.js — it will stay hidden in this browser until you export again.)' : '';
  if(!confirm('Delete "' + what + '"?' + extra)) return;
  mineRemoveEntry(uid);
  mineMsg = {ok:true, text:'Deleted.'};
  renderMine();
}

function mineAddToMerge(uid, btn){
  const key = refKey(uid);
  if(!combineOrder.includes(key)) combineOrder.push(key);
  showAddFeedback(btn);
}

mineSync();
