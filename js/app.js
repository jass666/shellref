/* ==========================================================================
   shellref — core app: search/filter, card rendering, sidebar nav, theme,
   history downloads, and the hero terminal typer.
   Depends on DATA (js/data.js); on SECTION_META, SHELL_COLORS, SHELL_LABELS,
   ALL_VIEW_SECTIONS, and buildNavConfig (js/sections.js); and on the
   generator, combine, and FAQ functions (js/generators.js) — all of which
   must be loaded first.
   ========================================================================== */

const SECTION_STORAGE_KEY = 'shellref-last-section';
let savedSection = null;
try{ savedSection = localStorage.getItem(SECTION_STORAGE_KEY); }catch(e){}
let activeSection = (savedSection && VALID_SECTIONS.includes(savedSection)) ? savedSection : 'setup';
let query = '';

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Escapes a value for safe embedding inside a single-quoted JS string literal
// within an inline onclick="..." attribute (handles backslashes like "C:\" and
// any stray single quotes, neither of which escapeHtml touches).
function jsAttr(s){
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function matches(item){
  if(activeSection !== 'all' && item.s !== activeSection) return false;
  if(!query) return true;
  const q = query.toLowerCase();
  return item.cmd.toLowerCase().includes(q)
    || item.desc.toLowerCase().includes(q)
    || item.ex.toLowerCase().includes(q)
    || item.t.toLowerCase().includes(q)
    || (item.use && item.use.toLowerCase().includes(q))
    || (item.kw && item.kw.toLowerCase().includes(q));
}

function render(){
  const main = document.getElementById('main');

  if(activeSection === 'generator'){
    document.getElementById('resultCount').textContent = '';
    renderGenerator();
    return;
  }

  if(activeSection === 'faq'){
    document.getElementById('resultCount').textContent = '';
    renderFaq();
    return;
  }

  const filtered = DATA.filter(matches);
  document.getElementById('resultCount').textContent = query ? `${filtered.length} match${filtered.length!==1?'es':''}` : '';

  if(filtered.length === 0){
    main.innerHTML = `<div class="empty"><div class="display">No matches</div>Try a shorter word — e.g. "kill", "grep", or "wsl"</div>`;
    return;
  }

  const sectionsToShow = activeSection === 'all' ? ALL_VIEW_SECTIONS : [activeSection];
  let html = '';

  sectionsToShow.forEach(secKey=>{
    const items = filtered.filter(i=>i.s===secKey);
    if(items.length === 0) return;
    const meta = SECTION_META[secKey];
    html += `<div class="section" id="sec-${secKey}">
      <div class="section-head">
        <h2>${meta.label}</h2>
        <span class="tag" style="color:${meta.color}">${items.length}</span>
      </div>
      <p class="section-sub">${meta.sub}</p>`;

    const tiers = [...new Set(items.map(i=>i.t))];
    // keep a sensible order: Basic, Useful/Advanced tiers, then rest
    const order = ['Bootstrap — do this first','Shells: what they are & why','Basic','Useful','Advanced','Drivers','Troubleshooting & repair','Sticky Keys & accessibility popups',
      // Disk Cleanup
      'Temp & cache folders','Full sweep',
      // Files, Folders & Storage
      'Everyday file ops','Search & bulk actions','Permissions & attributes','Disk, archives & integrity',
      // Processes, Jobs & Scheduling
      'Process control','Background jobs & scheduling','Power & session control',
      // Networking & Remote Access
      'Connectivity & diagnostics','Wireless & remote sessions','Downloads & transfers',
      // Search & Pattern Matching
      'Pattern search (grep family)','Search by file type','Discover file types (list every extension in use)','Single folder: search & sort','Modern & extra search tools',
      // Data Processing
      'Viewing & filtering','Stream editing (sed/awk)','Sorting, counting & diffing',
      // Scripting & Shell Environment
      'Shell basics & discovery','Environment & profile','Pipeline & scripting techniques',
      // Users, Permissions & Policy
      'Accounts & policy',
      // System Info & Hardware
      'System & hardware info','Performance & events',
      // WSL & Linux Interop
      'Setup & management','Configuration','Cross-platform interop & workflow'];
    tiers.sort((a,b)=>{
      const ai = order.indexOf(a), bi = order.indexOf(b);
      if(ai===-1 && bi===-1) return a.localeCompare(b);
      if(ai===-1) return 1;
      if(bi===-1) return -1;
      return ai-bi;
    });

    tiers.forEach(tier=>{
      const tierItems = items.filter(i=>i.t===tier);
      html += `<div class="tier-label">${tier}</div><div class="cards">`;
      tierItems.forEach((item,idx)=>{
        const uid = `${secKey}-${tier}-${idx}`.replace(/\s+/g,'_');
        const shellTag = item.sh ? `<span class="shell-tag" style="--shell-color:${SHELL_COLORS[item.sh]}">${SHELL_LABELS[item.sh]}</span>` : '';
        const cmdStyle = item.sh ? ` style="color:${SHELL_COLORS[item.sh]}"` : '';
        html += `<div class="card" style="--card-accent:${meta.color}">
          <div class="card-top">
            <div class="cmd"${cmdStyle}>${escapeHtml(item.cmd)}</div>
            ${shellTag}
          </div>
          <p class="desc">${escapeHtml(item.desc)}</p>
          ${item.use ? `<p class="usecase"><b>Use case:</b> ${escapeHtml(item.use)}</p>` : ''}
          <div class="example">${/^https?:\/\//i.test(item.ex) ? `<a href="${escapeHtml(item.ex)}" target="_blank" rel="noopener noreferrer" class="example-link">${escapeHtml(item.ex)}</a>` : escapeHtml(item.ex)}<button class="copy-btn-inline" data-copy="${encodeURIComponent(item.ex)}" onclick="doCopy(this)">copy</button></div>
        </div>`;
      });
      html += `</div>`;
    });

    html += `</div>`;
  });

  main.innerHTML = html;
}

// ---------- script downloads (turn a generated command, or several, into a runnable file) ----------
// cmd -> single .bat (echo off + pause so the window doesn't vanish on double-click)
// powershell -> a .ps1 PLUS a companion .bat launcher, mirroring this project's own
//   Push.ps1 / Push_Launcher.bat pattern: double-clicking a .ps1 directly usually does
//   nothing (opens Notepad) or hits the default execution-policy block, so the .bat
//   calls it with -ExecutionPolicy Bypass scoped to that one process only.
// unix -> a .sh with a shebang (chmod +x note included as a comment, since a browser
//   download can't set the executable bit for you).
function slugifyLabel(s){
  const slug = String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-+|-+$)/g,'').slice(0,60);
  return slug || 'shellref-command';
}

function downloadTextFile(filename, content){
  const blob = new Blob([content], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function buildBatContent(entries){
  const lines = ['@echo off'];
  entries.forEach(e=>{ lines.push('REM ' + e.label, e.command, ''); });
  lines.push('pause');
  return lines.join('\r\n');
}

function buildPs1Content(entries){
  const lines = [];
  entries.forEach(e=>{ lines.push('# ' + e.label, e.command, ''); });
  lines.push('Read-Host "Press Enter to exit"');
  return lines.join('\r\n');
}

function buildPs1LauncherBat(ps1Filename){
  return ['@echo off',
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0' + ps1Filename + '"',
    'pause'].join('\r\n');
}

function buildShContent(entries){
  const lines = ['#!/usr/bin/env bash', '# make this executable first: chmod +x <this file>', ''];
  entries.forEach(e=>{ lines.push('# ' + e.label, e.command, ''); });
  return lines.join('\n');
}

// entries: [{label, command}, ...]. Splits into filesystem-appropriate file(s) and
// triggers the download(s) — two for PowerShell (.ps1 + its .bat launcher), one otherwise.
function triggerScriptDownload(shellKey, baseLabel, entries){
  entries = entries.filter(e=>e.command);
  if(!entries.length) return;
  const slug = slugifyLabel(baseLabel);
  if(shellKey==='powershell'){
    const ps1Name = slug + '.ps1';
    downloadTextFile(ps1Name, buildPs1Content(entries));
    downloadTextFile(slug + '-run.bat', buildPs1LauncherBat(ps1Name));
  } else if(shellKey==='unix'){
    downloadTextFile(slug + '.sh', buildShContent(entries));
  } else {
    downloadTextFile(slug + '.bat', buildBatContent(entries));
  }
}

function downloadGenOutput(){
  const task = GENERATORS.find(t=>t.id===genState.taskId);
  const command = currentGenOutput();
  if(!task || !command) return;
  triggerScriptDownload(genState.shell, task.label, [{label: task.label, command}]);
}

function downloadGenBrowseOutput(){
  const item = currentBrowseItem();
  const command = currentBrowseOutput();
  if(!item || !command) return;
  triggerScriptDownload(item.sh || 'cmd', item.cmd, [{label: item.cmd, command}]);
}

function downloadHistoryEntry(id){
  const h = genHistory.find(x=>x.id===id);
  if(!h || !h.command) return;
  triggerScriptDownload(h.shell || 'cmd', h.label, [{label: h.label, command: h.command}]);
}

// Combines every checked history entry into one script per shell present in the
// selection (oldest-first, so the script runs in the order the commands were made),
// so a mixed selection downloads e.g. one .bat and one .ps1+.bat pair rather than
// silently dropping entries or producing an invalid mixed-syntax file.
function onHistoryDownloadCombined(){
  const selected = genHistory.filter(h=>genHistorySelected.has(h.id) && h.command);
  if(selected.length < 2) return;
  const groups = {};
  selected.slice().reverse().forEach(h=>{
    const key = h.shell || 'cmd';
    (groups[key] = groups[key] || []).push({label: h.label, command: h.command});
  });
  Object.keys(groups).forEach(shellKey=>{
    triggerScriptDownload(shellKey, 'shellref-combined-' + shellKey, groups[shellKey]);
  });
}

// Shared clipboard helper. navigator.clipboard.writeText() silently rejects
// in several common situations — page not focused when the click fires, the
// site not served over HTTPS/localhost, or the browser withholding clipboard
// permission — and every copy button here used to call it with no .catch(),
// so a rejection just did nothing with no feedback. This wraps it, falls back
// to a hidden-textarea + execCommand('copy') when the async API is missing or
// rejects, and always resolves/rejects so callers can show real success/failure.
function copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext){
    return navigator.clipboard.writeText(text).catch(()=>fallbackCopy(text));
  }
  return fallbackCopy(text);
}
function fallbackCopy(text){
  return new Promise((resolve, reject)=>{
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand copy failed'));
    }catch(e){ reject(e); }
  });
}
function showCopyFeedback(btn, ok){
  if(!btn) return;
  const orig = btn.getAttribute('data-orig-label') || btn.textContent;
  btn.setAttribute('data-orig-label', orig);
  btn.textContent = ok ? 'copied' : 'copy failed';
  btn.classList.toggle('copied', ok);
  setTimeout(()=>{ btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
}

// Same brief inline flash as showCopyFeedback, used by the "+ merge" buttons.
// The caller re-renders shortly after (to update the Merge commands count
// badge), so this only needs to hold the flashed label until that repaint.
function showAddFeedback(btn){
  if(!btn) return;
  btn.textContent = 'added ✓';
  btn.classList.add('copied');
}

function doCopy(btn){
  const text = decodeURIComponent(btn.getAttribute('data-copy'));
  copyToClipboard(text).then(()=>showCopyFeedback(btn, true)).catch(()=>showCopyFeedback(btn, false));
}

// ---------- nav ----------
// The sidebar itself is empty markup (#navList) — its buttons are generated
// from buildNavConfig() (js/sections.js), which derives them from
// SECTION_META. Adding/removing a category there is all that's needed; no
// button markup to hand-edit here.
function renderNav(){
  const listEl = document.getElementById('navList');
  let html = '';
  buildNavConfig().forEach(entry=>{
    if(entry.divider){ html += '<div class="nav-divider"></div>'; return; }
    const countHtml = entry.hasCount ? `<span class="count" data-count-for="${entry.key}">0</span>` : '';
    const activeClass = entry.key === activeSection ? ' active' : '';
    html += `<button class="nav-btn${activeClass}" data-target="${entry.key}" title="${escapeHtml(entry.title || entry.label)}"><span class="nav-btn-main"><span class="dot" style="background:${entry.color}"></span><span class="label-text">${escapeHtml(entry.label)}</span></span>${countHtml}</button>`;
  });
  listEl.innerHTML = html;
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> goToSection(btn.getAttribute('data-target')));
  });
}

function goToSection(target){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.getAttribute('data-target')===target));
  activeSection = target;
  try{ localStorage.setItem(SECTION_STORAGE_KEY, activeSection); }catch(e){}
  render();
  window.scrollTo({top: document.querySelector('.layout').offsetTop - 70, behavior:'smooth'});
}

// ---------- collapsible sidebar (horizontal) ----------
const navToggle = document.getElementById('navToggle');
const sidebarEl = document.getElementById('sidebar');
navToggle.addEventListener('click', ()=>{
  const collapsed = sidebarEl.classList.toggle('collapsed');
  navToggle.setAttribute('aria-expanded', String(!collapsed));
  navToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
});

// ---------- theme toggle ----------
const themeToggle = document.getElementById('themeToggle');
const htmlEl = document.documentElement;

function applyTheme(theme){
  htmlEl.setAttribute('data-theme', theme);
  try{ localStorage.setItem('shellref-theme', theme); }catch(e){}
}

(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem('shellref-theme'); }catch(e){}
  if(saved === 'light' || saved === 'dark'){
    applyTheme(saved);
  } else {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  }
})();

themeToggle.addEventListener('click', ()=>{
  const current = htmlEl.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

// ---------- jump to top ----------
const toTopBtn = document.getElementById('toTop');
window.addEventListener('scroll', ()=>{
  toTopBtn.classList.toggle('visible', window.scrollY > 480);
});
toTopBtn.addEventListener('click', ()=>{
  window.scrollTo({top:0, behavior:'smooth'});
});

// ---------- search ----------
document.getElementById('search').addEventListener('input', (e)=>{
  query = e.target.value.trim();
  render();
});

// ---------- stats ----------
// Counts are matched up by data-count-for="<section key>", which renderNav()
// stamped onto each nav button's count span — no per-category id needed.
function setStats(){
  Object.keys(SECTION_META).forEach(key=>{
    const el = document.querySelector(`[data-count-for="${key}"]`);
    if(el) el.textContent = DATA.filter(i=>i.s===key).length;
  });
  const allEl = document.querySelector('[data-count-for="all"]');
  if(allEl) allEl.textContent = DATA.length;
}

// ---------- hero typer ----------
const TYPE_SEQ = [
  {p:'C:\\Users\\jaswant&gt;', c:'ipconfig /all'},
  {p:'PS C:\\Users\\jaswant&gt;', c:'Get-Process | Sort CPU -Descending | select -First 5'},
  {p:'jaswant@wsl:~$', c:'grep -ri "error" ./logs | wc -l'},
];
let seqIndex = 0;

function typeSequence(){
  const el = document.getElementById('typer');
  const item = TYPE_SEQ[seqIndex % TYPE_SEQ.length];
  el.innerHTML = `<div class="prompt-line"><span class="p mono">${item.p}</span><span class="c mono" id="typedText"></span><span class="cursor"></span></div>`;
  const target = document.getElementById('typedText');
  let i = 0;
  const typeInterval = setInterval(()=>{
    target.textContent = item.c.slice(0, i+1);
    i++;
    if(i >= item.c.length){
      clearInterval(typeInterval);
      setTimeout(()=>{
        seqIndex++;
        typeSequence();
      }, 1800);
    }
  }, 32);
}

renderNav();
setStats();
render();
typeSequence();
