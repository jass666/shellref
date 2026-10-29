/* ==========================================================================
   shellref — Analyze file (upload -> dissect -> cross-check -> edit -> repackage)
   ==========================================================================
   Upload a .bat / .cmd / .ps1 / .sh / .txt script. Everything runs in the
   browser (nothing is uploaded anywhere):

     1. PARSE      the file into steps (comments, blanks, control flow, commands)
     2. CROSS-CHECK each command against DATA (built-in cards + saved commands):
                   known / partial (tool known, flags not documented) / unknown
     3. DISSECT    what the file is for: dominant categories, risks, admin need
     4. EDIT       remove / restore / reorder steps, insert commands from the library
     5. REPACKAGE  edited file, or a .zip (edited + original + ANALYSIS.md)
     6. EXPAND     unknown/partial commands become an LLM prompt; paste the reply
                   back, preview + validate + dedupe, save. Gaps also accumulate
                   in a backlog (most-needed first) across every file you upload.

   Loads after filebuilder.js (reuses fbMakeZip) and before app.js.
   Uses DATA, SECTION_META, escapeHtml, jsAttr, copyToClipboard, showCopyFeedback,
   downloadTextFile, mineAddEntry, lsGetJSON, lsSetJSON — only at call time.
   ========================================================================== */

const AZ_BACKLOG_KEY = 'shellref-gap-backlog';
const AZ_KIND_LABEL = {bat:'Windows batch', ps1:'PowerShell', sh:'Shell script', txt:'Command list'};
const AZ_KIND_SHELL = {bat:'cmd', ps1:'powershell', sh:'unix', txt:''};
const AZ_MW = new Set(['git','docker','winget','choco','reg','netsh','dism','powercfg','schtasks','sc','net','npm','pip','kubectl','systemctl','apt','apt-get','dnf','brew','wmic','vssadmin','gh','cargo','dotnet','pnpm','yarn']);
const AZ_SYNTAX = new Set(['if','else','elif','for','foreach','while','until','do','done','then','fi','case','esac','goto','setlocal','endlocal','rem','exit','break','continue','shift','set','function','return','local','export','unset','read','param','try','catch','finally','switch','begin','end','trap','select','in','not','defined','exist','errorlevel','enabledelayedexpansion']);
const AZ_PREFIX = new Set(['call','sudo','nohup','time','command','builtin','exec','start']);
const AZ_CASE = new Set(['git','docker','gh','kubectl','npm','pip','cargo','dotnet','pnpm','yarn','apt','apt-get','dnf','brew','systemctl']); // flags are case-sensitive
const AZ_ALIAS = {gci:'get-childitem',sls:'select-string',iwr:'invoke-webrequest',irm:'invoke-restmethod',gc:'get-content',sc:'set-content',ri:'remove-item',rm:'rm',gps:'get-process',spps:'stop-process',kill:'kill'};
const AZ_DANGER = [
  [/\b(del|erase)\b[^\n]*\/s|\b(rmdir|rd)\b[^\n]*\/s/i, 'Recursive delete (cmd)'],
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, 'rm -rf'],
  [/remove-item[^\n]*-recurse/i, 'Remove-Item -Recurse'],
  [/\bformat\s+[a-z]:|\bdiskpart\b|\bmkfs\b|\bdd\s+if=/i, 'Disk / format operation'],
  [/vssadmin\s+delete|dism[^\n]*\/resetbase|\bbcdedit\b/i, 'Irreversible system change'],
  [/\breg(\.exe)?\s+delete|remove-itemproperty|remove-item\s+hk/i, 'Registry delete'],
  [/\bshutdown\b|\brestart-computer\b|\bstop-computer\b/i, 'Shuts down / restarts the machine'],
  [/taskkill[^\n]*\/f|stop-process[^\n]*-force|\bkill\s+-9\b/i, 'Force-kills processes'],
  [/git\s+push[^\n]*(--force|\s-f\b)|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f/i, 'Git history / working-tree destruction'],
  [/docker\s+system\s+prune|docker\s+volume\s+prune/i, 'Docker prune'],
  [/set-executionpolicy|\bchmod\s+-r\s+777|icacls[^\n]*\/grant|takeown/i, 'Weakens permissions / policy'],
  [/(curl|wget|iwr|invoke-webrequest)[^\n]*\|\s*(iex|invoke-expression|bash|sh)\b/i, 'Downloads and executes remote code'],
];
const AZ_ADMIN = /#requires\s+-runasadministrator|net\s+session|-verb\s+runas|\bsudo\b|\bsfc\b|\bdism\b|\bpowercfg\b|\bschtasks\b|\bnetsh\b|\bvssadmin\b|\bcleanmgr\b|reg\s+(add|delete)\s+hklm|\bsc\s+(config|stop|start)/i;

let az = {name:'', ext:'', eol:'\r\n', bom:false, kind:'txt', blocks:[], nextId:1, analysis:null, insertAfter:null,
          pick:'', custom:'', hideNoise:false, reply:'', preview:null, secPick:'files', msg:'', open:{}};

// ---------------- parsing ----------------
function azDetectKind(name, text){
  const ext = (name.match(/\.([^.]+)$/) || [])[1];
  const e = (ext || '').toLowerCase();
  if(e === 'bat' || e === 'cmd') return 'bat';
  if(e === 'ps1' || e === 'psm1') return 'ps1';
  if(e === 'sh' || e === 'bash' || e === 'zsh') return 'sh';
  let b = 0, p = 0, s = 0;
  if(/@echo\s+off|^\s*rem\s|%~dp0|%[A-Za-z_]+%|goto\s+:?\w+/im.test(text)) b += 2;
  if(/^#!\s*\/.*(sh|bash|zsh)/m.test(text) || /\bfi\b|\bdone\b|\besac\b|\$\(/.test(text)) s += 2;
  if(/\bGet-|\bSet-|\bNew-|\bWrite-Host|\$env:|^\s*param\s*\(|\$_\b/m.test(text)) p += 2;
  return b > p && b >= s ? 'bat' : (p >= s && p > 0 ? 'ps1' : (s > 0 ? 'sh' : 'txt'));
}

function azIsComment(l, kind){
  const t = l.trim();
  if(kind === 'bat') return /^(rem(\s|$)|::)/i.test(t);
  if(kind === 'ps1') return t.startsWith('#') || t.startsWith('<#') || t.startsWith('#>');
  return t.startsWith('#');
}

function azSplitSegs(line){
  const out = []; let cur = '', q = '';
  for(let i = 0; i < line.length; i++){
    const c = line[i];
    if(q){ cur += c; if(c === q) q = ''; continue; }
    if(c === '"' || c === "'"){ q = c; cur += c; continue; }
    if(c === '&' && (line[i-1] === '>' || /\d/.test(line[i+1] || ''))){ cur += c; continue; } // 2>&1
    if(c === '|' || c === ';' || c === '&'){
      if((c === '|' || c === '&') && line[i+1] === c) i++;
      out.push(cur); cur = ''; continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map(s=>s.trim()).filter(Boolean);
}

// Returns {key, flags, text, external} or null when the segment isn't a command.
function azKeyOf(seg, kind){
  let toks = seg.replace(/^[@&\s]+/, '').split(/\s+/).filter(Boolean);
  while(toks.length && AZ_PREFIX.has(toks[0].toLowerCase())){
    const wasStart = toks[0].toLowerCase() === 'start';
    toks.shift();
    if(wasStart){ while(toks.length && (/^\/\w+$/.test(toks[0]) || /^(""|'')$/.test(toks[0]))) toks.shift(); }
  }
  if(!toks.length) return null;
  const raw = toks[0].replace(/^["']|["']$/g, '');
  if(/^[$%({)}\[]/.test(raw) || raw.startsWith(':') || /^\w+=/.test(raw)) return null;
  let k = raw.split(/[\\\/]/).pop().toLowerCase().replace(/\.(exe|com)$/, '').replace(/[({].*$/, '');
  if(!k) return null;
  if(/\.(ps1|sh|bat|cmd|py|js)$/.test(k)) return {key:k, flags:[], text:seg, external:true};
  if(AZ_ALIAS[k]) k = AZ_ALIAS[k];
  if(AZ_SYNTAX.has(k) && !AZ_MW.has(k)) return null;
  const rest = toks.slice(1);
  let key = k;
  if(AZ_MW.has(k) && rest[0] && /^[A-Za-z][\w-]*$/.test(rest[0]) && !/^[\\\/]/.test(rest[0])) key = k + ' ' + rest[0].toLowerCase();
  const flags = rest.filter(t=>/^-{1,2}[A-Za-z?]/.test(t) || (kind === 'bat' && /^\/[A-Za-z?][\w:]*$/.test(t)))
                    .map(t=>(kind === 'sh' || AZ_CASE.has(k) ? t : t.toLowerCase()).replace(/[:=].*$/, ''));
  return {key, flags, text:seg, external:false};
}

function azParse(text, name){
  az.bom = text.charCodeAt(0) === 0xFEFF;
  if(az.bom) text = text.slice(1);
  az.eol = /\r\n/.test(text) ? '\r\n' : '\n';
  az.kind = azDetectKind(name, text);
  const lines = text.split(/\r\n|\n|\r/);
  if(lines.length && lines[lines.length-1] === '') lines.pop();
  const blocks = []; let i = 0;
  const cont = l => az.kind === 'bat' ? /\^\s*$/.test(l) : (az.kind === 'ps1' ? /(`|\|)\s*$/.test(l) : /\\\s*$/.test(l));
  while(i < lines.length){
    const group = [lines[i]];
    while(cont(lines[i]) && i + 1 < lines.length && !azIsComment(lines[i], az.kind)){ i++; group.push(lines[i]); }
    i++;
    const first = group[0], t = first.trim();
    let type = 'cmd';
    if(!t) type = 'blank';
    else if(/^#!/.test(t) || /^@echo\s+off$/i.test(t)) type = 'syntax';
    else if(azIsComment(first, az.kind)) type = 'comment';
    else if(az.kind === 'bat' && /^:[A-Za-z_]/.test(t)) type = 'label';
    else if(/^[(){}]+$/.test(t) || /^[(){}]/.test(t) && !/^\(\s*\w/.test(t)) type = 'syntax';
    blocks.push({id: az.nextId++, lines: group, type, removed:false, added:false, segs:[]});
  }
  az.blocks = blocks;
}

// ---------------- library index + matching ----------------
function azFlagsIn(text){
  const set = new Set();
  String(text || '').replace(/(?:^|[\s\[(])(--?[A-Za-z?][\w-]*|\/[A-Za-z?]\w*)(?=[\s:=,.)\]'"]|$)/g, (m, f)=>{ set.add(f); set.add(f.toLowerCase()); return m; });
  return set;
}

function azBuildIndex(){
  const map = new Map();
  const add = (k, it)=>{ if(!map.has(k)) map.set(k, []); const a = map.get(k); if(!a.includes(it)) a.push(it); };
  DATA.forEach(it=>{
    const exKeys = new Set();
    String(it.ex || it.tpl || '').replace(/<[^<>]+>/g, 'x').split(/\r?\n/).forEach(l=>{
      l = l.trim();
      if(!l || /^(rem\b|::|#)/i.test(l)) return;
      azSplitSegs(l).forEach(seg=>{ const r = azKeyOf(seg, it.sh === 'cmd' ? 'bat' : 'sh'); if(r && !r.external && /^[\w.\-]+( [\w.\-]+)?$/.test(r.key)) exKeys.add(r.key); });
    });
    const keys = new Set(exKeys);
    const prim = new Set();
    const firstEx = String(it.ex || it.tpl || '').replace(/<[^<>]+>/g, 'x').split(/\r?\n/).map(l=>l.trim()).find(l=>l && !/^(rem\b|::|#)/i.test(l));
    if(firstEx){ const r0 = azKeyOf(azSplitSegs(firstEx)[0] || '', it.sh === 'cmd' ? 'bat' : 'sh'); if(r0 && !r0.external) prim.add(r0.key); }
    String(it.cmd || '').replace(/<[^<>]+>/g, 'x').split(/\s+\/\s+|,\s*|\s+or\s+/).forEach(p=>{
      p = p.trim();
      if(!p || p.split(/\s+/).length > 3) return;
      const r = azKeyOf(p, it.sh === 'cmd' ? 'bat' : 'sh');
      if(r && !r.external && /^[\w.\-]+( [\w.\-]+)?$/.test(r.key)){ keys.add(r.key); prim.add(r.key); }
    });
    it._azPrim = prim;
    keys.forEach(k=>{ add(k, it); const b = k.split(' ')[0]; if(b !== k && exKeys.has(k)) add(b, it); });
    it._azFlags = azFlagsIn(`${it.cmd} ${it.ex} ${it.desc} ${it.kw || ''} ${it.tpl || ''}`);
  });
  return map;
}

function azCovered(f, set){
  return set.has(f) || (/^-[a-z]{2,}$/.test(f) && [...f.slice(1)].every(ch=>set.has('-' + ch)));
}

function azMatchSeg(r, idx){
  const shell = AZ_KIND_SHELL[az.kind];
  const sub = r.key.includes(' '), base = r.key.split(' ')[0];
  const isPrim = (it, k)=>it._azPrim && (it._azPrim.has(k) || (sub && it._azPrim.has(base)));
  const exact = idx.get(r.key) || [];
  const poolAll = exact.length ? exact : (sub ? (idx.get(base) || []) : []);
  if(!poolAll.length) return {status:'unknown', item:null, missing:r.flags, alts:0};
  const prims = poolAll.filter(it=>isPrim(it, exact.length ? r.key : base));
  if(!prims.length){ // key only appears inside other recipes' examples — no card of its own
    const near = poolAll.find(it=>it.sh === shell) || poolAll[0];
    return {status:'mention', item:near, missing:r.flags, alts:poolAll.length - 1};
  }
  if(sub && !exact.length){ // tool has cards, but this subcommand does not
    const near = prims.find(it=>it.sh === shell) || prims[0];
    return {status:'partial', item:near, missing:[r.key.split(' ')[1] + ' (subcommand)'].concat(r.flags), alts:prims.length - 1};
  }
  let best = null, bs = -1;
  prims.forEach(it=>{
    const cov = r.flags.filter(f=>azCovered(f, it._azFlags)).length;
    const titled = new RegExp('(^|[^\\w-])' + r.key.split(' ')[0].replace(/[^\w-]/g, '') + '([^\\w-]|$)', 'i').test(it.cmd || '');
    const sc = cov * 3 + (titled ? 4 : 0) + (it.sh === shell ? 1 : 0) + (it.s === 'mine' ? 0 : 0.1);
    if(sc > bs){ bs = sc; best = it; }
  });
  const missing = r.flags.filter(f=>!azCovered(f, best._azFlags));
  const covered = r.flags.length - missing.length;
  return {status:(r.flags.length && !covered) ? 'partial' : 'known', item:best, missing, alts:prims.length - 1};
}

function azAnalyze(fresh){
  const idx = azBuildIndex();
  const funcs = new Set();
  az.blocks.forEach(b=>{ const m = b.lines[0].match(/^\s*function\s+([\w-]+)/i) || b.lines[0].match(/^\s*([\w-]+)\s*\(\)\s*\{?\s*$/); if(m) funcs.add(m[1].toLowerCase()); });
  az.blocks.forEach(b=>{
    b.segs = [];
    if(b.type !== 'cmd') return;
    const joined = b.lines.join(' ').replace(/\^\s*$|`\s*$|\\\s*$/g, ' ');
    azSplitSegs(joined).forEach(seg=>{
      const r = azKeyOf(seg, az.kind);
      if(!r) return;
      if(r.external || funcs.has(r.key)){ b.segs.push({key:r.key, text:seg, status:'external', item:null, missing:[]}); return; }
      b.segs.push(Object.assign({key:r.key, text:seg, flags:r.flags}, azMatchSeg(r, idx)));
    });
    if(!b.segs.length) b.type = 'syntax';
  });
  const gaps = new Map();
  az.blocks.forEach(b=>{
    if(b.removed) return;
    b.segs.forEach(s=>{
      if(s.status !== 'unknown' && s.status !== 'partial' && s.status !== 'mention' && !(s.status === 'known' && s.missing.length)) return;
      const g = gaps.get(s.key) || {key:s.key, kind:s.status === 'unknown' ? 'unknown' : (s.status === 'mention' ? 'mention' : 'flags'), count:0, samples:[], flags:new Set(), item:s.item};
      g.count++;
      if(g.samples.length < 2 && !g.samples.includes(s.text)) g.samples.push(s.text);
      s.missing.forEach(f=>g.flags.add(f));
      if(s.status === 'unknown') g.kind = 'unknown'; else if(s.status === 'partial' && g.kind !== 'unknown') g.kind = 'partial';
      else if(s.status === 'known' && g.kind === 'mention') g.kind = 'flags';
      gaps.set(s.key, g);
    });
  });
  const rank = {unknown:0, partial:1, flags:2, mention:3};
  az.analysis = {gaps:[...gaps.values()].sort((a,b)=>rank[a.kind] - rank[b.kind] || b.count - a.count), purpose:azPurpose(), idxSize:idx.size};
  if(fresh) azRecordBacklog();
}

// ---------------- dissect: what is this file for? ----------------
function azPurpose(){
  const live = az.blocks.filter(b=>!b.removed);
  const cmds = live.filter(b=>b.type === 'cmd');
  const text = cmds.map(b=>b.lines.join('\n')).join('\n');
  const stated = (live.find(b=>b.type === 'comment' && azIsComment(b.lines[0], az.kind) && !/^(rem\s*$|::\s*$|#\s*$|#!)/i.test(b.lines[0].trim()) && !/^[#:\s\-=*_]+$|^rem\s*[-=*_]*\s*$/i.test(b.lines[0].trim())) || {lines:['']}).lines[0]
    .trim().replace(/^(rem\b|::|#+)\s*/i, '').replace(/[-=*_]{3,}/g, '').trim();
  const bySec = {};
  let known = 0, partial = 0, unknown = 0, ext = 0, mention = 0;
  cmds.forEach(b=>b.segs.forEach(s=>{
    if(s.status === 'external') ext++;
    else if(s.status === 'unknown') unknown++;
    else if(s.status === 'mention') mention++;
    else { s.status === 'partial' ? partial++ : known++; if(s.item) bySec[s.item.s] = (bySec[s.item.s] || 0) + 1; }
  }));
  const top = Object.entries(bySec).sort((a,b)=>b[1] - a[1]);
  const secName = k=>(SECTION_META[k] || {label:k}).label;
  const risks = [];
  AZ_DANGER.forEach(([re, label])=>{
    const hit = cmds.filter(b=>re.test(b.lines.join(' ')));
    if(hit.length) risks.push({label, ids:hit.map(b=>b.id)});
  });
  const traits = [];
  if(AZ_ADMIN.test(text)) traits.push('likely needs admin / elevated rights');
  if(/\b(curl|wget|iwr|invoke-webrequest|invoke-restmethod|ping|git\s+(push|pull|clone|fetch)|winget|choco|npm\s+i|pip\s+install)\b/i.test(text)) traits.push('uses the network / installs software');
  if(/\breg(\.exe)?\s+(add|delete|import)|hk(lm|cu)\\|set-itemproperty/i.test(text)) traits.push('modifies the registry');
  if(/>\s*["']?[\w%$.\\\/-]+\.(log|txt)|tee\b|start-transcript|out-file/i.test(text)) traits.push('writes a log / output file');
  if(/(if\s+errorlevel|%errorlevel%|\$\?|\$lastexitcode|set\s+-e|try\s*\{|\|\|\s*exit)/i.test(az.blocks.map(b=>b.lines.join(' ')).join('\n'))) traits.push('has some error handling');
  else if(cmds.length > 3) traits.push('has no visible error handling');
  let headline = `${AZ_KIND_LABEL[az.kind]} with ${cmds.length} command step${cmds.length === 1 ? '' : 's'}`;
  if(top.length){
    headline += ` — mostly ${secName(top[0][0])}`;
    if(top[1]) headline += `, plus ${secName(top[1][0])}`;
    if(top[2]) headline += ` and ${secName(top[2][0])}`;
  }
  return {headline, stated, top, risks, traits, counts:{known, partial, unknown, ext, mention}};
}

// ---------------- structural sanity of the edited output ----------------
function azWarnings(){
  const live = az.blocks.filter(b=>!b.removed), w = [];
  const all = live.map(b=>b.lines.join('\n')).join('\n');
  if(az.kind === 'bat'){
    const labels = new Set(live.filter(b=>b.type === 'label').map(b=>b.lines[0].trim().slice(1).split(/\s/)[0].toLowerCase()));
    const want = new Set(); all.replace(/\b(?:goto|call)\s+:?([A-Za-z_]\w*)/gi, (m, l)=>{ if(l.toLowerCase() !== 'eof') want.add(l.toLowerCase()); return m; });
    [...want].filter(l=>!labels.has(l) && /goto\s+:?/i.test(all) && new RegExp('goto\\s+:?' + l + '\\b', 'i').test(all)).forEach(l=>w.push(`goto :${l} points to a label that is no longer in the file`));
    const open = (all.match(/\(\s*$/gm) || []).length, close = (all.match(/^\s*\)/gm) || []).length;
    if(open !== close) w.push(`Unbalanced ( ) blocks: ${open} opening vs ${close} closing lines`);
  } else if(az.kind === 'sh'){
    const c = re=>(all.match(re) || []).length;
    if(c(/^\s*if\b/gm) !== c(/^\s*fi\b/gm)) w.push('if / fi count does not match');
    if(c(/^\s*(for|while|until)\b/gm) !== c(/^\s*done\b/gm)) w.push('loop / done count does not match');
    if(c(/^\s*case\b/gm) !== c(/^\s*esac\b/gm)) w.push('case / esac count does not match');
  } else if(az.kind === 'ps1'){
    const body = all.replace(/#.*$/gm, '').replace(/"(?:[^"`]|`.)*"|'[^']*'/g, '""');
    const o = (body.match(/\{/g) || []).length, c = (body.match(/\}/g) || []).length;
    if(o !== c) w.push(`Unbalanced { } braces: ${o} opening vs ${c} closing`);
  }
  live.filter(b=>b.added).forEach(b=>{ if(/<[A-Za-z][^<>]*>/.test(b.lines.join('\n'))) w.push('An inserted command still has <blank> placeholders — fill them in before running'); });
  return [...new Set(w)];
}

function azOutput(){
  const body = az.blocks.filter(b=>!b.removed).map(b=>b.lines.join(az.eol)).join(az.eol);
  return (az.bom ? '\ufeff' : '') + body + (body ? az.eol : '');
}

// ---------------- backlog (what the library keeps missing) ----------------
function azRecordBacklog(){
  const bl = lsGetJSON(AZ_BACKLOG_KEY, {});
  (az.analysis.gaps || []).forEach(g=>{
    const e = bl[g.key] || {count:0, files:0, example:''};
    e.count += g.count; e.files += 1; e.example = g.samples[0] || e.example; e.kind = g.kind; e.last = Date.now();
    bl[g.key] = e;
  });
  lsSetJSON(AZ_BACKLOG_KEY, bl);
}

function azBacklogOpen(){
  const bl = lsGetJSON(AZ_BACKLOG_KEY, {});
  const idx = azBuildIndex();
  return Object.entries(bl).filter(([k, e])=>e.kind === 'unknown' ? !idx.has(k) : true)
    .filter(([k, e])=>e.kind === 'unknown').sort((a,b)=>b[1].files - a[1].files || b[1].count - a[1].count)
    .map(([k, e])=>Object.assign({key:k}, e));
}

// ---------------- LLM prompt builders ----------------
function azSchemaBlock(){
  const secs = Object.keys(SECTION_META).filter(k=>k !== 'mine');
  const tiers = {};
  DATA.forEach(i=>{ if(i.s !== 'mine' && i.t){ (tiers[i.s] = tiers[i.s] || new Set()).add(i.t); } });
  const lines = secs.map(k=>`  ${k} — ${SECTION_META[k].label}` + (tiers[k] ? `  [tiers: ${[...tiers[k]].slice(0, 6).join(' | ')}]` : ''));
  return `ENTRY SHAPE (JSON object per command):
{
  "s":    "<section key from the list below>",
  "t":    "<tier/subheading — reuse an existing tier name where one fits>",
  "sh":   "cmd" | "powershell" | "unix"   (omit for git/docker/registry-style sections),
  "cmd":  "<command shown as card title>",
  "desc": "<1-2 sentences: what it actually does, incl. gotchas; mark irreversible actions with ⚠>",
  "use":  "<when you would reach for this — phrase it the way someone searching by symptom would>",
  "ex":   "<exact copy-paste example; use <Token> for blanks that vary; real flags only>",
  "kw":   "<extra search words: aliases, common misspellings, symptom phrases>",
  "confidence": "high" | "medium" | "low",
  "source": "<doc name or URL you relied on>"
}

SECTION KEYS:
${lines.join('\n')}`;
}

const AZ_RULES = `RULES
- Reply with ONLY a JSON array of entry objects. No prose, no markdown fences.
- One entry per distinct task/intent, not one per line of the script. Merge near-duplicates.
- Do not invent flags or switches. If you are not sure a flag exists, leave it out and set confidence to "low".
- Prefer official documentation (Microsoft Learn, man7.org, git-scm.com, docs.docker.com) and cite it in "source".
- Keep "desc" factual and short. Call out anything destructive or irreversible with ⚠ and say how to preview/undo if possible.
- "ex" must run as written on the stated shell; use real-looking values, <Token> only for genuine blanks.
- Do not duplicate anything in ALREADY IN THE LIBRARY.`;

function azExistingFor(keys){
  const idx = azBuildIndex(), seen = new Set(), out = [];
  keys.forEach(k=>{ (idx.get(k) || idx.get(k.split(' ')[0]) || []).forEach(it=>{ if(!seen.has(it) && out.length < 25){ seen.add(it); out.push(`${it.cmd}  (${it.s})`); } }); });
  return out;
}

function azGapPrompt(items, ctx){
  const lines = items.map((g, i)=>{
    const why = g.kind === 'unknown' ? 'NOT in library' : (g.kind === 'mention' ? 'no card of its own (only appears inside other recipes)' : (g.kind === 'partial' ? 'tool is in library but this usage / these flags are not documented' : 'tool is in library; extra flags used'));
    const realFlags = g.flags ? [...g.flags].filter(f=>!/\(subcommand\)$/.test(f)) : [];
    const subs = g.flags ? [...g.flags].filter(f=>/\(subcommand\)$/.test(f)).map(f=>f.replace(' (subcommand)', '')) : [];
    const fl = (realFlags.length ? `  flags seen: ${realFlags.join(' ')}` : '') + (subs.length ? `  subcommand "${subs.join(', ')}" has no card of its own` : '');
    return `${i + 1}. ${g.key} — ${why}${fl}\n   seen as: ${(g.samples || [g.example || g.key]).filter(Boolean).map(s=>'`' + s.slice(0, 160) + '`').join('  |  ')}`;
  }).join('\n');
  const have = azExistingFor(items.map(g=>g.key));
  return `You are helping expand a personal command-reference library (static site "shellref") covering CMD, PowerShell, WSL and Unix tools.

CONTEXT
${ctx || 'These commands were found while analysing real scripts I use.'}

TASK
For each item below, write library entries that fill the gap. Verify each command against current official documentation (search the web if you can). Where several commands in the list are part of one workflow, still keep separate entries for each distinct intent.

MISSING / UNDER-DOCUMENTED ITEMS
${lines}

ALREADY IN THE LIBRARY (related; do not duplicate)
${have.length ? have.map(x=>'- ' + x).join('\n') : '- (nothing related found)'}

${azSchemaBlock()}

${AZ_RULES}`;
}

function azSectionPrompt(sec){
  const meta = SECTION_META[sec];
  const have = DATA.filter(i=>i.s === sec).map(i=>i.cmd.replace(/\s+/g, ' ').slice(0, 60));
  return `You are helping expand a personal command-reference library (static site "shellref").

TASK
Section: ${meta.label} (key "${sec}") — ${meta.sub.replace(/<[^>]+>/g, '').slice(0, 300)}

Below is everything this section already covers. List the 12 most commonly needed commands or flags an IT/support/dev person would reach for in this area that are MISSING. Prioritise real day-to-day tasks and "something is broken" situations over exotic options. Verify against official docs.

ALREADY IN THE LIBRARY (${have.length})
${have.map(x=>'- ' + x).join('\n') || '- (empty)'}

${azSchemaBlock()}

${AZ_RULES}`;
}

// ---------------- LLM reply: parse, validate, dedupe, save ----------------
function azParseReply(text){
  let t = String(text || '').replace(/```(?:json|javascript|js)?/gi, '').trim();
  const a = t.indexOf('['), o = t.indexOf('{');
  if(a < 0 && o < 0) throw new Error('No JSON found in the reply.');
  const start = a >= 0 && (o < 0 || a < o) ? a : o;
  const open = t[start], close = open === '[' ? ']' : '}';
  let depth = 0, q = false, esc = false, end = -1;
  for(let i = start; i < t.length; i++){
    const c = t[i];
    if(q){ if(esc) esc = false; else if(c === '\\') esc = true; else if(c === '"') q = false; continue; }
    if(c === '"') q = true; else if(c === open) depth++; else if(c === close){ depth--; if(!depth){ end = i; break; } }
  }
  if(end < 0) throw new Error('The JSON looks cut off — ask the model to continue or resend it complete.');
  let v = JSON.parse(t.slice(start, end + 1));
  if(!Array.isArray(v)) v = Array.isArray(v.entries) ? v.entries : [v];
  return v;
}

function azValidate(raw){
  const sh = ['cmd', 'powershell', 'unix'];
  const errs = [];
  const e = {s:String(raw.s || '').trim(), t:String(raw.t || '').trim(), sh:sh.includes(raw.sh) ? raw.sh : undefined,
    cmd:String(raw.cmd || '').trim(), desc:String(raw.desc || '').trim(), use:String(raw.use || '').trim(),
    ex:String(raw.ex || '').replace(/\r\n?/g, '\n').trim(), kw:String(raw.kw || '').trim(),
    confidence:String(raw.confidence || '').toLowerCase(), source:String(raw.source || '').trim()};
  if(!e.cmd) errs.push('missing cmd');
  if(!e.desc) errs.push('missing desc');
  if(!e.ex) errs.push('missing ex');
  if(!SECTION_META[e.s] || e.s === 'mine') errs.push(`unknown section "${e.s}" — will save under My saved commands only`);
  if(!e.t && SECTION_META[e.s]) e.t = 'Saved from LLM';
  const firstLine = x=>(String(x.ex || '').split('\n').find(l=>l.trim()) || '').trim().toLowerCase();
  const dup = DATA.find(i=>(i.cmd || '').trim().toLowerCase() === e.cmd.toLowerCase() || (firstLine(e) && firstLine(i) === firstLine(e)));
  return {e, errs, dup:dup ? dup.cmd : '', fatal:errs.some(x=>/^missing/.test(x))};
}

function azJsStr(s){ return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n') + "'"; }
function azDataLine(e){
  const f = [`s:${azJsStr(e.s)}`, `t:${azJsStr(e.t)}`];
  if(e.sh) f.push(`sh:${azJsStr(e.sh)}`);
  f.push(`cmd:${azJsStr(e.cmd)}`, `desc:${azJsStr(e.desc)}`);
  if(e.use) f.push(`use:${azJsStr(e.use)}`);
  f.push(`ex:${azJsStr(e.ex)}`);
  if(e.kw) f.push(`kw:${azJsStr(e.kw)}`);
  return `{${f.join(', ')}},`;
}

// ---------------- report + packaging ----------------
function azReport(){
  const p = az.analysis.purpose, live = az.blocks.filter(b=>!b.removed);
  const removed = az.blocks.filter(b=>b.removed && b.type !== 'blank'), added = az.blocks.filter(b=>b.added && !b.removed);
  let r = `# Analysis: ${az.name}\n\n${p.headline}\n`;
  if(p.stated) r += `\nStated purpose (from the file's own comment): ${p.stated}\n`;
  r += `\n- Steps cross-checked: ${p.counts.known} known, ${p.counts.partial} partial, ${p.counts.unknown} not in library, ${p.counts.mention} only in other cards' examples, ${p.counts.ext} script-defined/external\n`;
  p.traits.forEach(t=>{ r += `- ${t}\n`; });
  if(p.risks.length){ r += `\n## Risky steps\n`; p.risks.forEach(x=>{ r += `- ${x.label} (${x.ids.length})\n`; }); }
  r += `\n## Step-by-step\n\n| # | Step | Library match | Status |\n|---|---|---|---|\n`;
  live.filter(b=>b.type === 'cmd').forEach((b, i)=>{
    b.segs.forEach(s=>{ r += `| ${i + 1} | \`${s.text.replace(/\|/g, '\\|').slice(0, 70)}\` | ${s.item ? s.item.cmd.replace(/\|/g, '\\|').slice(0, 50) : '—'} | ${s.status}${s.missing && s.missing.length ? ' (flags: ' + s.missing.join(' ') + ')' : ''} |\n`; });
  });
  if(removed.length){ r += `\n## Removed\n`; removed.forEach(b=>{ r += `- \`${b.lines[0].trim().slice(0, 90)}\`\n`; }); }
  if(added.length){ r += `\n## Added\n`; added.forEach(b=>{ r += `- \`${b.lines[0].trim().slice(0, 90)}\`\n`; }); }
  if(az.analysis.gaps.length){ r += `\n## Library gaps\n`; az.analysis.gaps.forEach(g=>{ r += `- ${g.key} — ${g.kind}\n`; }); }
  const w = azWarnings();
  if(w.length){ r += `\n## Warnings\n`; w.forEach(x=>{ r += `- ${x}\n`; }); }
  return r;
}

function azBase(){ return az.name.replace(/\.[^.]+$/, '') || 'script'; }
function azEditedName(){ return `${azBase()}.edited${az.ext}`; }

function azDownloadEdited(){ downloadTextFile(azEditedName(), azOutput()); }

function azDownloadZip(){
  const files = [{name:azEditedName(), content:azOutput()}, {name:'original/' + az.name, content:az.orig}, {name:'ANALYSIS.md', content:azReport()}];
  const blob = fbMakeZip(files), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = azBase() + '-package.zip';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// ---------------- UI ----------------
function azRender(){
  const root = document.getElementById('azRoot');
  if(!root) return;
  const active = document.activeElement, keep = active && active.id, pos = active && active.selectionStart;
  root.innerHTML = az.analysis ? azWorkspaceHtml() : azDropHtml();
  if(keep){ const el = document.getElementById(keep); if(el){ el.focus(); try{ el.setSelectionRange(pos, pos); }catch(e){} } }
}

function analyzerHtml(){ return `<div id="azRoot">${az.analysis ? azWorkspaceHtml() : azDropHtml()}</div>`; }

function azDropHtml(){
  const bl = azBacklogOpen();
  return `<div class="az-drop" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="azDrop(event)">
    <div class="az-drop-title">Drop a script here, or choose a file</div>
    <div class="az-drop-sub">.bat · .cmd · .ps1 · .sh · .txt — read in your browser only, never uploaded.</div>
    <input type="file" id="azFile" accept=".bat,.cmd,.ps1,.psm1,.sh,.bash,.txt" onchange="azPick(this)">
    <div class="az-or">or paste text</div>
    <textarea id="azPaste" class="gen-field-input az-paste" placeholder="Paste a script or a list of commands…" spellcheck="false"></textarea>
    <button type="button" class="copy-btn" onclick="azLoadPasted()">Analyze pasted text</button>
  </div>
  ${azExpandHtml(bl)}`;
}

function azChip(s){
  const map = {known:['known', '#2BB3A3'], partial:['partial', '#D9A441'], unknown:['not in library', '#E0574F'], mention:['only in other examples', '#6C8EBF'], external:['script-defined / external', '#8890A0']};
  const [label, col] = map[s] || ['', ''];
  return `<span class="az-chip" style="--c:${col}">${label}</span>`;
}

function azRowHtml(b, n){
  const noise = b.type === 'comment' || b.type === 'blank';
  if(az.hideNoise && noise && !b.added) return '';
  const code = escapeHtml(b.lines.join('\n')) || '&nbsp;';
  let info = '';
  if(b.type === 'cmd'){
    b.segs.forEach(s=>{
      const m = s.item ? `<span class="az-match">${escapeHtml(s.item.cmd.slice(0, 60))}</span> <span class="az-sec">${escapeHtml((SECTION_META[s.item.s] || {label:s.item.s}).label)}</span>` : '';
      const desc = s.item && az.open[b.id] ? `<div class="az-desc">${escapeHtml(s.item.desc)}${s.item.use ? '<br><em>' + escapeHtml(s.item.use) + '</em>' : ''}</div>` : '';
      info += `<div class="az-seg">${azChip(s.status)} <code>${escapeHtml(s.key)}</code> ${m}${s.missing && s.missing.length && s.status !== 'unknown' ? ` <span class="az-missing">undocumented: ${escapeHtml(s.missing.join(' '))}</span>` : ''}${desc}</div>`;
    });
  }
  const risky = az.analysis.purpose.risks.some(r=>r.ids.includes(b.id)) ? '<span class="az-chip" style="--c:#E0574F">⚠ risky</span>' : '';
  const cls = `az-row az-${b.type}${b.removed ? ' removed' : ''}${b.added ? ' added' : ''}`;
  const toggle = b.type === 'cmd' && b.segs.some(s=>s.item) ? `<button type="button" class="az-mini" title="Show library description" onclick="azToggleOpen(${b.id})">ⓘ</button>` : '';
  return `<div class="${cls}">
    <div class="az-num">${n || ''}</div>
    <div class="az-main"><pre class="az-code">${code}</pre>${risky}${info}</div>
    <div class="az-ctl">${toggle}
      <button type="button" class="az-mini" title="Move up" onclick="azMove(${b.id},-1)">↑</button>
      <button type="button" class="az-mini" title="Move down" onclick="azMove(${b.id},1)">↓</button>
      <button type="button" class="az-mini${az.insertAfter === b.id ? ' on' : ''}" title="Insert a library command below this step" onclick="azSetInsert(${b.id})">＋</button>
      <button type="button" class="az-mini" title="${b.removed ? 'Restore' : 'Remove'}" onclick="azToggleRemove(${b.id})">${b.removed ? '↺' : '✕'}</button>
    </div></div>`;
}

function azWorkspaceHtml(){
  const A = az.analysis, p = A.purpose, w = azWarnings();
  let n = 0;
  const rows = az.blocks.map(b=>{ if(b.type === 'cmd' && !b.removed) n++; return azRowHtml(b, b.type === 'cmd' ? (b.removed ? '' : n) : ''); }).join('');
  const risks = p.risks.length ? `<div class="az-block az-risk"><strong>⚠ Risky steps</strong> ${p.risks.map(r=>`<span class="az-chip" style="--c:#E0574F">${escapeHtml(r.label)} ×${r.ids.length}</span>`).join(' ')}
      <button type="button" class="copy-btn" onclick="azRemoveRisky()">remove all risky steps</button></div>` : '';
  const removedCount = az.blocks.filter(b=>b.removed).length, addedCount = az.blocks.filter(b=>b.added && !b.removed).length;
  const q = az.pick.trim().toLowerCase();
  const results = q ? DATA.filter(i=>`${i.cmd} ${i.desc} ${i.kw || ''} ${i.ex}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const pickHtml = results.map(i=>`<button type="button" class="az-result" onclick="azInsertItem(${i._id})"><strong>${escapeHtml(i.cmd.slice(0, 70))}</strong><span>${escapeHtml(i.desc.slice(0, 90))}</span></button>`).join('');
  const target = az.insertAfter ? 'below the selected step' : 'at the end of the file';
  return `<div class="az-block az-head">
      <div><strong>${escapeHtml(az.name)}</strong> <span class="shell-tag" style="--shell-color:${az.kind === 'bat' ? 'var(--cmd)' : az.kind === 'ps1' ? 'var(--ps)' : 'var(--unix)'}">${AZ_KIND_LABEL[az.kind]}</span></div>
      <div class="az-headline">${escapeHtml(p.headline)}.</div>
      ${p.stated ? `<div class="az-stated">The file says: “${escapeHtml(p.stated)}”</div>` : ''}
      <div class="az-counts">${azChip('known')} ${p.counts.known} ${azChip('partial')} ${p.counts.partial} ${azChip('unknown')} ${p.counts.unknown}${p.counts.mention ? ' ' + azChip('mention') + ' ' + p.counts.mention : ''}${p.counts.ext ? ' ' + azChip('external') + ' ' + p.counts.ext : ''}</div>
      ${p.traits.length ? `<div class="az-traits">${p.traits.map(t=>'• ' + escapeHtml(t)).join('<br>')}</div>` : ''}
      <button type="button" class="copy-btn" onclick="azReset()">analyze another file</button>
    </div>
    ${risks}
    ${w.length ? `<div class="az-block az-warn"><strong>Check before using the edited file</strong><br>${w.map(x=>'• ' + escapeHtml(x)).join('<br>')}</div>` : ''}
    <div class="az-block">
      <div class="az-bar">
        <strong>Steps</strong>
        <button type="button" class="copy-btn" onclick="azToggleNoise()">${az.hideNoise ? 'show' : 'hide'} comments &amp; blank lines</button>
        <button type="button" class="copy-btn" onclick="azRemoveNoise()">remove comments &amp; blanks</button>
        <button type="button" class="copy-btn" onclick="azRestoreAll()">restore everything</button>
        <span class="az-count">${removedCount} removed · ${addedCount} added</span>
      </div>
      <div class="az-rows">${rows}</div>
    </div>
    <div class="az-block">
      <strong>Add a command</strong> <span class="az-hint">goes ${target}${az.insertAfter ? ' <a href="#" onclick="azSetInsert(null);return false">(use end instead)</a>' : ''}</span>
      <input id="azPick" class="gen-field-input" placeholder="Search the library…" value="${escapeHtml(az.pick)}" oninput="azPickInput(this)" autocomplete="off" spellcheck="false">
      <div class="az-results">${pickHtml}</div>
      <input id="azCustom" class="gen-field-input" placeholder="…or type / paste a line to add" value="${escapeHtml(az.custom)}" oninput="az.custom=this.value" onkeydown="if(event.key==='Enter')azAddCustom()" autocomplete="off" spellcheck="false">
      <button type="button" class="copy-btn" onclick="azAddCustom()">add line</button>
    </div>
    <div class="az-block az-pack">
      <strong>Repackage</strong>
      <button type="button" class="copy-btn" onclick="azDownloadEdited()">⬇ ${escapeHtml(azEditedName())}</button>
      <button type="button" class="copy-btn" onclick="azDownloadZip()">⬇ .zip (edited + original + ANALYSIS.md)</button>
      <button type="button" class="copy-btn" onclick="azCopyOut(this)">copy edited text</button>
    </div>
    ${azExpandHtml(azBacklogOpen())}`;
}

function azExpandHtml(backlog){
  const A = az.analysis, gaps = A ? A.gaps : [];
  const secOpts = Object.keys(SECTION_META).filter(k=>k !== 'mine').map(k=>`<option value="${k}"${az.secPick === k ? ' selected' : ''}>${escapeHtml(SECTION_META[k].label)}</option>`).join('');
  const gapHtml = gaps.length ? gaps.map(g=>`<div class="az-gap">${azChip(g.kind === 'unknown' ? 'unknown' : (g.kind === 'mention' ? 'mention' : 'partial'))} <code>${escapeHtml(g.key)}</code> <span class="az-hint">×${g.count}${g.flags.size ? ' · flags ' + escapeHtml([...g.flags].join(' ')) : ''}</span></div>`).join('') : (A ? '<div class="az-hint">Every command in this file is covered by the library.</div>' : '');
  const blHtml = backlog.length ? backlog.slice(0, 10).map(b=>`<div class="az-gap"><code>${escapeHtml(b.key)}</code> <span class="az-hint">in ${b.files} file${b.files === 1 ? '' : 's'} · ×${b.count}</span></div>`).join('') : '<div class="az-hint">Nothing queued yet. Missing commands from every file you analyze collect here, most-needed first.</div>';
  const pv = az.preview;
  let pvHtml = '';
  if(pv){
    const okCount = pv.rows.filter(r=>r.on).length;
    pvHtml = `<div class="az-preview">${pv.error ? `<div class="az-warn az-block">${escapeHtml(pv.error)}</div>` : pv.rows.map((r, i)=>{
      const state = r.v.fatal ? `<span class="az-chip" style="--c:#E0574F">invalid</span>` : (r.v.dup ? `<span class="az-chip" style="--c:#D9A441">duplicate of “${escapeHtml(r.v.dup.slice(0, 30))}”</span>` : '<span class="az-chip" style="--c:#2BB3A3">new</span>');
      const conf = r.v.e.confidence ? ` <span class="az-hint">confidence: ${escapeHtml(r.v.e.confidence)}</span>` : '';
      return `<label class="az-prev-row"><input type="checkbox" ${r.on ? 'checked' : ''} ${r.v.fatal ? 'disabled' : ''} onchange="azTogglePrev(${i})"> ${state} <strong>${escapeHtml(r.v.e.cmd)}</strong>${conf}
        <div class="az-desc">${escapeHtml(r.v.e.desc)}</div><pre class="az-code">${escapeHtml(r.v.e.ex)}</pre>${r.v.errs.length ? `<div class="az-missing">${escapeHtml(r.v.errs.join('; '))}</div>` : ''}${r.v.e.source ? `<div class="az-hint">source: ${escapeHtml(r.v.e.source.slice(0, 120))}</div>` : ''}</label>`;
    }).join('') + `<div class="az-bar"><button type="button" class="copy-btn" onclick="azSaveSelected(this)" ${okCount ? '' : 'disabled'}>★ save ${okCount} to My saved commands</button>
        <button type="button" class="copy-btn" onclick="azCopyDataLines(this)" ${okCount ? '' : 'disabled'}>copy ${okCount} as js/data.js lines</button></div>`}</div>`;
  }
  return `<div class="az-block az-expand">
    <h3 class="az-h">Grow the library</h3>
    ${A ? `<div class="az-sub">Gaps found in this file</div>${gapHtml}
      <div class="az-bar"><button type="button" class="copy-btn" onclick="azCopyGapPrompt(this)" ${gaps.length ? '' : 'disabled'}>copy LLM prompt for these gaps</button></div>` : ''}
    <div class="az-sub">Backlog — missing across all files you've analyzed</div>
    ${blHtml}
    <div class="az-bar"><button type="button" class="copy-btn" onclick="azCopyBacklogPrompt(this)" ${backlog.length ? '' : 'disabled'}>copy prompt for top ${Math.min(backlog.length, 12) || ''} backlog items</button>
      <select class="gen-field-input az-sel" onchange="az.secPick=this.value">${secOpts}</select>
      <button type="button" class="copy-btn" onclick="azCopySectionPrompt(this)">copy “what's missing here?” prompt</button></div>
    <div class="az-sub">Paste the LLM's reply</div>
    <textarea id="azReply" class="gen-field-input az-paste" placeholder="Paste the JSON the model returned…" spellcheck="false">${escapeHtml(az.reply)}</textarea>
    <div class="az-bar"><button type="button" class="copy-btn" onclick="azReadReply()">validate &amp; preview</button></div>
    ${pvHtml}
    <details class="az-method"><summary>The expansion method (5 steps)</summary>
      <ol>
        <li><strong>Feed it real work.</strong> Analyze scripts you actually run (cleanup .bat, deploy .ps1, your Push script). Real usage decides what matters.</li>
        <li><strong>Read the gaps.</strong> “Not in library” = tool missing; “partial” = tool known, flags undocumented. The backlog ranks by how many files needed each.</li>
        <li><strong>Prompt an LLM that can browse.</strong> Use the copied prompt — it carries the exact entry shape, valid sections, existing tiers and what's already covered. For breadth rather than depth, use the per-section “what's missing here?” prompt.</li>
        <li><strong>Validate, don't trust.</strong> Paste the reply: it is parsed, schema-checked, de-duplicated. Spot-check anything marked low/medium confidence against the cited source before saving.</li>
        <li><strong>Make it permanent.</strong> “Save” puts entries in My saved commands (instantly searchable, re-analyzes this file); then Export for repo and push. Or copy the data.js lines into js/data.js for proper categories.</li>
      </ol></details>
  </div>`;
}

// ---------------- actions ----------------
function azLoadText(text, name){
  az.name = name || 'pasted-script.txt';
  az.ext = (az.name.match(/\.[^.]+$/) || [''])[0] || '.txt';
  az.orig = text;
  azParse(text, az.name);
  if(!az.blocks.some(b=>b.type === 'cmd' || b.type === 'syntax' || b.type === 'comment')){ az.msg = 'That file looks empty.'; return; }
  if(az.kind === 'txt' && !/\.\w+$/.test(name || '')) az.ext = '.txt';
  Object.assign(az, {insertAfter:null, pick:'', custom:'', preview:null, reply:'', open:{}});
  azAnalyze(true);
  azRender();
}

function azReadFileObj(file){
  if(!file) return;
  if(file.size > 2 * 1024 * 1024){ alert('That file is over 2 MB — pick a script, not a data file.'); return; }
  const r = new FileReader();
  r.onload = ()=>azLoadText(String(r.result), file.name);
  r.readAsText(file);
}
function azPick(inp){ azReadFileObj(inp.files && inp.files[0]); }
function azDrop(ev){ ev.preventDefault(); azReadFileObj(ev.dataTransfer.files && ev.dataTransfer.files[0]); }
function azLoadPasted(){ const t = (document.getElementById('azPaste') || {}).value || ''; if(t.trim()) azLoadText(t, 'pasted-script.txt'); }
function azReset(){ az.analysis = null; az.blocks = []; az.preview = null; azRender(); }

function azReanalyze(){ azAnalyze(false); azRender(); }
function azFind(id){ return az.blocks.find(b=>b.id === id); }
function azToggleRemove(id){ const b = azFind(id); if(!b) return; b.removed = !b.removed; azReanalyze(); }
function azToggleOpen(id){ az.open[id] = !az.open[id]; azRender(); }
function azToggleNoise(){ az.hideNoise = !az.hideNoise; azRender(); }
function azRemoveNoise(){ az.blocks.forEach(b=>{ if(b.type === 'comment' || b.type === 'blank') b.removed = true; }); azReanalyze(); }
function azRemoveRisky(){ const ids = new Set(az.analysis.purpose.risks.flatMap(r=>r.ids)); az.blocks.forEach(b=>{ if(ids.has(b.id)) b.removed = true; }); azReanalyze(); }
function azRestoreAll(){ az.blocks = az.blocks.filter(b=>!b.added); az.blocks.forEach(b=>{ b.removed = false; }); az.insertAfter = null; azReanalyze(); }
function azMove(id, dir){
  const i = az.blocks.findIndex(b=>b.id === id), j = i + dir;
  if(i < 0 || j < 0 || j >= az.blocks.length) return;
  [az.blocks[i], az.blocks[j]] = [az.blocks[j], az.blocks[i]];
  azReanalyze();
}
function azSetInsert(id){ az.insertAfter = (az.insertAfter === id) ? null : id; azRender(); }
function azPickInput(el){ az.pick = el.value; azRender(); }

function azInsertLines(text){
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').filter((l, i, a)=>l.trim() || (i > 0 && i < a.length - 1));
  if(!lines.length) return;
  const blk = {id:az.nextId++, lines, type:'cmd', removed:false, added:true, segs:[]};
  const at = az.insertAfter ? az.blocks.findIndex(b=>b.id === az.insertAfter) : az.blocks.length - 1;
  az.blocks.splice(at + 1, 0, blk);
  az.insertAfter = blk.id;
  azReanalyze();
}
function azInsertItem(id){ const it = DATA.find(i=>i._id === id); if(it) azInsertLines(it.ex || it.cmd); }
function azAddCustom(){ if(az.custom.trim()){ azInsertLines(az.custom); az.custom = ''; azRender(); } }

function azCopyOut(btn){ copyToClipboard(azOutput().replace(/^\ufeff/, '').replace(/\r\n/g, '\n')).then(()=>showCopyFeedback(btn, true)).catch(()=>showCopyFeedback(btn, false)); }

function azFileCtx(){
  const p = az.analysis && az.analysis.purpose;
  return p ? `Found while analysing "${az.name}" (${AZ_KIND_LABEL[az.kind]}). ${p.headline}.${p.stated ? ' The script says it is for: ' + p.stated + '.' : ''}` : '';
}
function azCopyText(text, btn){ copyToClipboard(text).then(()=>showCopyFeedback(btn, true)).catch(()=>showCopyFeedback(btn, false)); }
function azCopyGapPrompt(btn){ azCopyText(azGapPrompt(az.analysis.gaps.slice(0, 15), azFileCtx()), btn); }
function azCopyBacklogPrompt(btn){
  const items = azBacklogOpen().slice(0, 12).map(b=>({key:b.key, kind:'unknown', samples:[b.example], flags:new Set()}));
  azCopyText(azGapPrompt(items, `These commands keep turning up in scripts I analyze and the library has no entry for them (most-needed first).`), btn);
}
function azCopySectionPrompt(btn){ azCopyText(azSectionPrompt(az.secPick), btn); }

function azReadReply(){
  az.reply = (document.getElementById('azReply') || {}).value || '';
  try{
    const rows = azParseReply(az.reply).filter(x=>x && typeof x === 'object').map(raw=>{ const v = azValidate(raw); return {v, on:!v.fatal && !v.dup}; });
    az.preview = rows.length ? {rows} : {rows:[], error:'The reply contained no entries.'};
  }catch(e){ az.preview = {rows:[], error:String(e.message || e)}; }
  azRender();
}
function azTogglePrev(i){ az.preview.rows[i].on = !az.preview.rows[i].on; azRender(); }

function azSaveSelected(btn){
  let ok = 0, dup = 0;
  az.preview.rows.filter(r=>r.on && !r.v.fatal).forEach(r=>{
    const e = r.v.e;
    const res = mineAddEntry({title:e.cmd, shell:e.sh || '', command:e.ex, desc:e.use ? `${e.desc} Use: ${e.use}` : e.desc, group:(SECTION_META[e.s] ? SECTION_META[e.s].label + ' · ' : '') + (e.t || 'LLM'), src:'LLM expansion' + (e.source ? ': ' + e.source : '')});
    if(res === 'ok') ok++; else if(res === 'dup') dup++;
  });
  az.preview = null; az.reply = '';
  if(az.analysis) azAnalyze(false);
  azRender();
  az.msg = `Saved ${ok}${dup ? ' (' + dup + ' already saved)' : ''}. Use “Export for repo” in My saved commands to make them permanent.`;
  const root = document.getElementById('azRoot');
  if(root) root.insertAdjacentHTML('afterbegin', `<div class="az-block az-ok">${escapeHtml(az.msg)}</div>`);
}

function azCopyDataLines(btn){
  const lines = az.preview.rows.filter(r=>r.on && !r.v.fatal && SECTION_META[r.v.e.s] && r.v.e.s !== 'mine').map(r=>azDataLine(r.v.e));
  if(!lines.length){ showCopyFeedback(btn, false); return; }
  azCopyText(lines.join('\n') + '\n', btn);
}
