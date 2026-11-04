/* ==========================================================================
   shellref — File builder (Command generator → "File builder" tab)
   ==========================================================================
   Builds whole files instead of single commands: custom .bat / .ps1 / .sh
   scripts, a Git push script pair like this project's own Push.ps1 +
   Push_Launcher.bat, .gitignore, .gitattributes, .editorconfig.

   Every template is one object in FB_TEMPLATES below:
     id, cat, label, desc         — list entry + one-line explainer
     fields: [{k, l, t, d, ...}]  — t: 'text' | 'select' | 'check' | 'area' | 'chips'
     build(v) -> [{name, content}]  — the file(s); v = current field values
     warn(v)  -> [string]           — optional, shown above the output
     note(v)  -> string             — optional, "what to do with these files"
   Nothing else needs to change to add a template: the list, form, preview,
   copy, download and .zip are all generic. See MANUAL.md section 4.

   Presets (saved field values) and the saved-commands pickers come from
   js/mine.js. Depends on: escapeHtml, copyToClipboard, showCopyFeedback,
   downloadTextFile (app.js); renderGenerator, extArr, combineEntries
   (generators.js); DATA / presetList / presetSave / presetRemove.
   ========================================================================== */

const FB_LS_KEY = 'shellref-fb-last';
let fbTplId = 'git-push';
let fbAll = lsGetJSON(FB_LS_KEY, {});            // template id -> last-used field values
if(!fbAll || typeof fbAll !== 'object' || Array.isArray(fbAll)) fbAll = {};
let fbPresetName = '';
let fbLoadedPresetId = '';
let fbNote = '';

// ---------- small helpers ----------
function fbCrlf(lines){ return lines.join('\r\n') + '\r\n'; }
function fbLf(lines){ return lines.join('\n') + '\n'; }
function fbPsq(s){ return String(s).replace(/'/g, "''"); }                 // inside a PowerShell '…' string
function fbBody(s){ return String(s || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n'); }
function fbNonAscii(s){ return /[^\x00-\x7F]/.test(s); }
function fbOneLine(s){ return String(s || '').replace(/[\r\n]+/g, ' ').trim(); }
function fbSafeName(s, ext, fallback){
  let n = String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
  if(!n) n = fallback;
  if(ext && !n.toLowerCase().endsWith(ext)) n += ext;
  return n;
}
function fbBase(name){ return name.replace(/\.[^.]+$/, ''); }
// .ps1 files with non-ASCII text need a UTF-8 BOM or Windows PowerShell 5.1 reads them as ANSI.
function fbPs1Text(lines){
  const txt = fbCrlf(lines);
  return fbNonAscii(txt) ? '\ufeff' + txt : txt;
}
function fbPlain(content){ return content.replace(/^\ufeff/, '').replace(/\r\n/g, '\n'); }

// A commit-message pattern like "Push {repo} {date}" -> a PowerShell double-quoted string.
function fbCommitExpr(pattern){
  const parts = String(pattern || 'Push {repo} {date}').replace(/[\r\n]+/g, ' ').split(/(\{repo\}|\{date\})/);
  let out = '';
  parts.forEach((p, i)=>{
    if(p === '{repo}' || p === '{date}'){
      const name = p === '{repo}' ? 'REPO_NAME' : 'date';
      const next = parts[i + 1] || '';
      out += /^[A-Za-z0-9_]/.test(next) ? '${' + name + '}' : '$' + name;   // braces stop "$date_x" being read as one variable
    } else {
      out += p.replace(/[`"$]/g, '`$&');
    }
  });
  return '"' + out + '"';
}

// ---------- git push script (Push.ps1 + Push_Launcher.bat) ----------
function fbBuildGitPush(v){
  const repo = fbOneLine(v.repoName) || 'Project';
  const remote = fbOneLine(v.remote) || 'https://github.com/YOUR-USER/YOUR-REPO';
  const branch = fbOneLine(v.branch) || 'main';
  const mode = ['force', 'push', 'rebase'].includes(v.mode) ? v.mode : 'force';
  const ps1Name = fbSafeName(v.ps1Name, '.ps1', 'Push.ps1');
  const head = {
    force:  ['Push to GitHub (Local Wins)', 'WARNING: Overwrites remote branch with local state.'],
    push:   ['Push to GitHub', 'Normal push: fails if the remote has commits you do not have.'],
    rebase: ['Rebase onto GitHub, then Push', 'Rebases your commits on top of the remote branch before pushing.'],
  }[mode];
  const banner = { force:'Force Push to GitHub', push:'Push to GitHub', rebase:'Pull --rebase, then Push' }[mode];
  const L = [];

  L.push('# ============================================================',
    `#  ${repo} - ${head[0]}`,
    `#  ${head[1]}`,
    '# ============================================================', '',
    'param(', '    [switch]$AutoYes', ')', '',
    '$REPO_PATH  = $PSScriptRoot',
    `$BRANCH     = '${fbPsq(branch)}'`,
    `$REMOTE_URL = '${fbPsq(remote)}'`,
    `$REPO_NAME  = '${fbPsq(repo)}'`, '',
    'function Wait-ForExit {', '    if (-not $AutoYes) {', '        Read-Host " Press Enter to exit" | Out-Null', '    }', '}', '',
    'Write-Host ""',
    'Write-Host " ====================================================="',
    `Write-Host "  $REPO_NAME  |  ${banner}"`,
    'Write-Host " ====================================================="',
    'Write-Host ""',
    'Write-Host " [INFO]  Repo  : $REPO_PATH"',
    'Write-Host " [INFO]  Remote: $REMOTE_URL"',
    'Write-Host " [INFO]  Branch: $BRANCH"',
    'Write-Host ""');
  if(mode === 'force'){
    L.push('Write-Host " [WARN]  Local files will become the GitHub branch state."',
      'Write-Host " [WARN]  This is a force push. Remote-only changes can be overwritten."');
  } else if(mode === 'push'){
    L.push('Write-Host " [INFO]  Normal push. If the remote has newer commits, the push is rejected."');
  } else {
    L.push('Write-Host " [INFO]  Your commits are rebased on top of the remote branch, then pushed."');
  }
  L.push('Write-Host ""');
  if(v.confirm){
    L.push('if ($AutoYes) {', '    Write-Host " [INFO]  AutoYes enabled. Starting without prompts."', '} else {',
      '    Write-Host " Press ENTER to start, or type anything and press ENTER to abort."',
      '    $confirm = Read-Host " >"', '    if ($confirm -ne "") {', '        Write-Host ""',
      '        Write-Host " [INFO]  Aborted. Nothing was changed."', '        Wait-ForExit', '        exit 0', '    }', '}');
  }
  L.push('', 'Set-Location $REPO_PATH', '',
    'git rev-parse --is-inside-work-tree 2>$null | Out-Null', 'if ($LASTEXITCODE -ne 0) {',
    '    Write-Host " [INFO]  Git repo not initialized. Running git init..."', '    git init',
    '    if ($LASTEXITCODE -ne 0) {', '        Write-Host " [ERROR] git init failed."', '        Wait-ForExit', '        exit 1', '    }', '}', '',
    'git checkout -B $BRANCH', 'if ($LASTEXITCODE -ne 0) {',
    '    Write-Host " [ERROR] Could not switch to branch: $BRANCH"', '    Wait-ForExit', '    exit 1', '}', '',
    '$existingRemote = git remote get-url origin 2>$null', 'if ($LASTEXITCODE -eq 0) {',
    '    if ($existingRemote -ne $REMOTE_URL) {', '        git remote set-url origin $REMOTE_URL', '    }', '} else {',
    '    git remote add origin $REMOTE_URL', '}', 'if ($LASTEXITCODE -ne 0) {',
    '    Write-Host " [ERROR] Could not configure origin remote."', '    Wait-ForExit', '    exit 1', '}', '');
  if(v.stamp){
    L.push('$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"', 'Set-Content -Path ".deploy_stamp" -Value $timestamp -Encoding UTF8', '');
  }
  L.push('git add -A', 'if ($LASTEXITCODE -ne 0) {', '    Write-Host " [ERROR] git add failed."', '    Wait-ForExit', '    exit 1', '}', '');

  const commit = (ind)=>{
    const c = [];
    c.push('$date = Get-Date -Format "yyyy-MM-dd HH:mm"');
    if(v.askMsg){
      c.push(`$defaultMsg = ${fbCommitExpr(v.msg)}`,
        'if ($AutoYes) {', '    $commitMsg = $defaultMsg', '} else {',
        '    $typed = Read-Host " Commit message (Enter for default)"',
        '    if ([string]::IsNullOrWhiteSpace($typed)) { $commitMsg = $defaultMsg } else { $commitMsg = $typed }', '}');
    } else {
      c.push(`$commitMsg = ${fbCommitExpr(v.msg)}`);
    }
    c.push('git commit -m $commitMsg', 'if ($LASTEXITCODE -ne 0) {', '    Write-Host " [ERROR] Commit failed."', '    Wait-ForExit', '    exit 1', '}');
    return c.map(x=>ind + x);
  };
  if(v.stamp){
    L.push(...commit(''), '');
  } else {
    L.push('$pending = git status --porcelain', 'if ($pending) {', ...commit('    '), '} else {',
      '    Write-Host " [INFO]  Nothing new to commit. Pushing existing commits."', '}', '');
  }

  if(mode === 'rebase'){
    L.push('git ls-remote --exit-code --heads origin $BRANCH 2>$null | Out-Null', 'if ($LASTEXITCODE -eq 0) {',
      '    git pull --rebase origin $BRANCH', '    if ($LASTEXITCODE -ne 0) {',
      '        Write-Host " [ERROR] Rebase failed. Fix the conflicts, then run: git rebase --continue"', '        Wait-ForExit', '        exit 1', '    }',
      '} else {', '    Write-Host " [INFO]  Remote branch not found yet. Skipping the rebase."', '}', '');
  }
  const pushCmd = mode === 'force' ? 'git push -u origin $BRANCH --force' : 'git push -u origin $BRANCH';
  const pushErr = mode === 'force'
    ? ' [ERROR] Force push failed. Check internet, GitHub auth, or branch protection.'
    : mode === 'push'
      ? ' [ERROR] Push failed. If the remote has newer commits, pull first or use the rebase/force script.'
      : ' [ERROR] Push failed. Check internet, GitHub auth, or branch protection.';
  L.push(pushCmd, 'if ($LASTEXITCODE -ne 0) {', `    Write-Host "${pushErr}"`, '    Write-Host " [INFO]  Remote: $REMOTE_URL"',
    '    Wait-ForExit', '    exit 1', '}', '',
    '$finalHash = git log -1 --pretty=format:%h', 'Write-Host ""', 'Write-Host " [OK]    Push complete: $finalHash"',
    'Write-Host " [OK]    Repo: $REMOTE_URL"', 'Wait-ForExit');

  const files = [{ name: ps1Name, content: fbPs1Text(L) }];
  if(v.launcher){
    files.push({ name: fbSafeName(v.launcherName, '.bat', 'Push_Launcher.bat'),
      content: fbCrlf(['@echo off', `powershell -ExecutionPolicy Bypass -File "%~dp0${ps1Name}"`]) });
  }
  return files;
}

// ---------- custom scripts ----------
function fbBuildPs1(v){
  const name = fbSafeName(v.name, '.ps1', 'script.ps1');
  const L = [];
  if(fbOneLine(v.desc)) L.push('# ' + fbOneLine(v.desc), '');
  if(v.strict) L.push("$ErrorActionPreference = 'Stop'");
  if(v.elevate){
    L.push('if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {',
      '    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""',
      '    exit', '}');
  }
  if(v.cdHere) L.push('Set-Location -Path $PSScriptRoot');
  if(v.log) L.push(`Start-Transcript -Path (Join-Path $PSScriptRoot '${fbPsq(fbBase(name))}.log') -Append | Out-Null`);
  if(L.length && L[L.length - 1] !== '') L.push('');
  L.push(...fbBody(v.body));
  if(v.log) L.push('', 'Stop-Transcript | Out-Null');
  if(v.pause) L.push('', 'Read-Host "Press Enter to exit" | Out-Null');
  const files = [{ name, content: fbPs1Text(L) }];
  if(v.launcher){
    const bat = ['@echo off', `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${name}"`];
    if(!v.pause) bat.push('pause');
    files.push({ name: fbBase(name) + '-run.bat', content: fbCrlf(bat) });
  }
  return files;
}

function fbBuildBat(v){
  const name = fbSafeName(v.name, '.bat', 'script.bat');
  const L = [];
  if(v.echoOff) L.push('@echo off');
  if(fbOneLine(v.desc)) L.push('REM ' + fbOneLine(v.desc));
  if(v.setlocal) L.push('setlocal');
  if(v.utf8) L.push('chcp 65001 >nul');
  const title = fbOneLine(v.title).replace(/[&|<>^%"]/g, '');
  if(title) L.push('title ' + title);
  if(v.elevate){
    L.push('net session >nul 2>&1', 'if %errorlevel% neq 0 (', '    echo Requesting administrator rights...',
      `    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`, '    exit /b', ')');
  }
  if(v.cdHere) L.push('cd /d "%~dp0"');
  if(L.length) L.push('');
  L.push(...fbBody(v.body));
  if(v.pause) L.push('', 'pause');
  return [{ name, content: fbCrlf(L) }];
}

function fbBuildSh(v){
  const name = fbSafeName(v.name, '.sh', 'script.sh');
  const sh = v.shell === 'sh' ? 'sh' : 'bash';
  const L = [`#!/usr/bin/env ${sh}`];
  if(fbOneLine(v.desc)) L.push('# ' + fbOneLine(v.desc));
  if(v.strict) L.push(sh === 'sh' ? 'set -eu' : 'set -euo pipefail');
  if(v.cdHere) L.push(sh === 'sh' ? 'cd "$(dirname "$0")"' : 'cd "$(dirname "${BASH_SOURCE[0]}")"');
  L.push('', ...fbBody(v.body));
  if(v.pause) L.push('', sh === 'sh' ? "printf 'Press Enter to exit '; read _" : 'read -r -p "Press Enter to exit " _');
  return [{ name, content: fbLf(L) }];
}

// ---------- .gitignore / .gitattributes / .editorconfig ----------
const FB_IGNORE_BLOCKS = {
  windows:    {l:'Windows',               lines:['Thumbs.db', 'ehthumbs.db', 'Desktop.ini', '$RECYCLE.BIN/', '*.lnk']},
  macos:      {l:'macOS',                 lines:['.DS_Store', '.AppleDouble', '.LSOverride', '._*']},
  linux:      {l:'Linux',                 lines:['*~', '.directory', '.Trash-*', '.nfs*']},
  vscode:     {l:'VS Code',               lines:['.vscode/*', '!.vscode/settings.json', '!.vscode/tasks.json', '!.vscode/launch.json', '!.vscode/extensions.json', '*.code-workspace']},
  jetbrains:  {l:'JetBrains',             lines:['.idea/', '*.iml']},
  node:       {l:'Node.js',               lines:['node_modules/', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*', 'pnpm-debug.log*', '.npm/', '.eslintcache', '*.tsbuildinfo']},
  python:     {l:'Python',                lines:['__pycache__/', '*.py[cod]', '.venv/', 'venv/', 'env/', '*.egg-info/', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/']},
  env:        {l:'Secrets & .env',        lines:['.env', '.env.*', '!.env.example', '*.pem', '*.key', 'secrets.json', 'credentials.json']},
  logs:       {l:'Logs & temp files',     lines:['*.log', 'logs/', '*.tmp', '*.temp', '*.bak', '*.swp', '*.swo']},
  build:      {l:'Build output',          lines:['dist/', 'build/', 'out/', '.next/', '.cache/', 'coverage/']},
  cloudflare: {l:'Cloudflare / Wrangler', lines:['.wrangler/', '.dev.vars', '.dev.vars.*']},
  db:         {l:'Local databases',       lines:['*.sqlite', '*.sqlite3', '*.db', 'instance/']},
  office:     {l:'Office temp files',     lines:['~$*', '.~lock.*#']},
  archives:   {l:'Archives',              lines:['*.zip', '*.7z', '*.rar', '*.tar', '*.tar.gz']},
};

function fbBuildGitignore(v){
  const chosen = extArr(v.presets).filter(k=>FB_IGNORE_BLOCKS[k]);
  const L = ['# .gitignore - generated by shellref',
    '# Only affects untracked files. To stop tracking something already committed:',
    '#   git rm -r --cached <path>'];
  chosen.forEach(k=>{ L.push('', `# ---- ${FB_IGNORE_BLOCKS[k].l} ----`, ...FB_IGNORE_BLOCKS[k].lines); });
  const extra = fbBody(v.extra).filter(l=>l.trim());
  if(extra.length) L.push('', '# ---- Custom ----', ...extra);
  return [{ name: '.gitignore', content: fbLf(L) }];
}

function fbBuildGitattributes(v){
  const L = ['# .gitattributes - generated by shellref'];
  if(v.normalize) L.push('', '# Detect text files and store them with LF in the repo', '* text=auto');
  if(v.crlfScripts) L.push('', '# Windows scripts must be CRLF on checkout (LF-only .bat files can misbehave)', '*.bat text eol=crlf', '*.cmd text eol=crlf', '*.ps1 text eol=crlf');
  if(v.lfShell) L.push('', '# Shell scripts must stay LF (CRLF breaks the shebang line)', '*.sh text eol=lf');
  if(v.binary) L.push('', '# Never touch these', ...['png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'woff', 'woff2', 'pdf', 'zip'].map(e=>`*.${e} binary`));
  return [{ name: '.gitattributes', content: fbLf(L) }];
}

function fbBuildEditorconfig(v){
  const L = ['# EditorConfig - generated by shellref', 'root = true', '', '[*]', 'charset = utf-8',
    `indent_style = ${v.indentStyle === 'tab' ? 'tab' : 'space'}`];
  if(v.indentStyle !== 'tab') L.push(`indent_size = ${['2', '4', '8'].includes(v.indentSize) ? v.indentSize : '2'}`);
  L.push(`end_of_line = ${v.eol === 'crlf' ? 'crlf' : 'lf'}`,
    `insert_final_newline = ${v.finalNewline ? 'true' : 'false'}`,
    `trim_trailing_whitespace = ${v.trim ? 'true' : 'false'}`);
  if(v.winCrlf) L.push('', '[*.{bat,cmd,ps1}]', 'end_of_line = crlf');
  if(v.psBom) L.push('', '[*.ps1]', 'charset = utf-8-bom');
  if(v.mdTrim) L.push('', '[*.md]', 'trim_trailing_whitespace = false');
  if(v.makeTabs) L.push('', '[Makefile]', 'indent_style = tab');
  return [{ name: '.editorconfig', content: fbLf(L) }];
}

// ---------- the template registry ----------
const FB_SCRIPT_FIELDS_COMMON = [
  {k:'desc', l:'What it does (becomes a comment on top)', t:'text', d:'', wide:true},
];

// ---------- Cache cleaner (Clean-Caches.ps1 + Clean-Caches.bat) ----------
// Defaults reproduce the two uploaded files line-for-line; the fields only rename things.
const FB_CC_PS1 = [
  "#Requires -RunAsAdministrator",
  "<#",
  ".SYNOPSIS",
  "  Detect and delete cache/temp data across ALL user profiles + system temp.",
  "",
  ".USAGE",
  "  .\\Clean-Caches.ps1 -Detect            # find every big \"cache\" folder under all profiles (read-only)",
  "  .\\Clean-Caches.ps1                    # DRY RUN: shows what would be deleted and sizes",
  "  .\\Clean-Caches.ps1 -Delete            # actually delete",
  "  .\\Clean-Caches.ps1 -Delete -IncludeDev   # also npm / pip / NuGet caches",
  "  .\\Clean-Caches.ps1 -Detect -MinMB 200 # only report folders >= 200 MB",
  "",
  "  Safe by design: never touches cookies, saved logins, bookmarks, documents,",
  "  or the C:\\Users\\All Users junction. Locked (in-use) files are skipped.",
  "#>",
  "param(",
  "    [switch]$Delete,",
  "    [switch]$Detect,",
  "    [switch]$IncludeDev,",
  "    [int]$MinMB = 50",
  ")",
  "",
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$log = 'C:\\ProgramData\\cache-clean.log'",
  "",
  "function Get-SizeBytes([string]$Path) {",
  "    $s = (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |",
  "          Measure-Object Length -Sum).Sum",
  "    if ($null -eq $s) { 0 } else { [int64]$s }",
  "}",
  "function Fmt([double]$b) {",
  "    if ($b -ge 1GB) { '{0:N2} GB' -f ($b / 1GB) }",
  "    elseif ($b -ge 1MB) { '{0:N1} MB' -f ($b / 1MB) }",
  "    else { '{0:N0} KB' -f ($b / 1KB) }",
  "}",
  "function Say($m) { Write-Host $m; if ($Delete) { Add-Content -Path $log -Value \"$(Get-Date -f s)  $m\" } }",
  "",
  "# Real user profiles only (skip junctions, Default, Public, All Users)",
  "$skip = 'All Users', 'Default', 'Default User', 'Public', 'desktop.ini'",
  "$profiles = Get-ChildItem 'C:\\Users' -Directory -Force |",
  "    Where-Object { $_.Name -notin $skip -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) }",
  "",
  "# ------------------------------------------------------------------ DETECT MODE",
  "if ($Detect) {",
  "    Write-Host \"Scanning for cache-like folders >= $MinMB MB (can take a few minutes)...`n\"",
  "    $hits = foreach ($p in $profiles) {",
  "        Get-ChildItem (Join-Path $p.FullName 'AppData') -Directory -Recurse -Depth 7 -Force |",
  "            Where-Object { $_.Name -match 'cache|temp$|tmp$|crashdumps|logs?$' -and",
  "                           -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |",
  "            ForEach-Object {",
  "                $sz = Get-SizeBytes $_.FullName",
  "                if ($sz -ge ($MinMB * 1MB)) {",
  "                    [pscustomobject]@{ Size = $sz; Pretty = Fmt $sz; Path = $_.FullName }",
  "                }",
  "            }",
  "    }",
  "    $hits | Sort-Object Size -Descending | Format-Table Pretty, Path -AutoSize -Wrap",
  "    Write-Host \"Note: a parent cache folder and its child can both be listed, so totals overlap.\"",
  "    Write-Host \"Anything big that is NOT in the cleanup list below is worth checking manually.\"",
  "    return",
  "}",
  "",
  "# ------------------------------------------------------------------ TARGETS",
  "# Relative to each profile",
  "$userTargets = [ordered]@{",
  "    'Windows temp'     = @('AppData\\Local\\Temp\\*')",
  "    'Windows INet'     = @('AppData\\Local\\Microsoft\\Windows\\INetCache\\*')",
  "    'Thumb/icon cache' = @('AppData\\Local\\Microsoft\\Windows\\Explorer\\thumbcache_*.db',",
  "                           'AppData\\Local\\Microsoft\\Windows\\Explorer\\iconcache_*.db')",
  "    'Crash dumps'      = @('AppData\\Local\\CrashDumps\\*')",
  "    'GPU shader cache' = @('AppData\\Local\\D3DSCache\\*',",
  "                           'AppData\\Local\\NVIDIA\\DXCache\\*', 'AppData\\Local\\NVIDIA\\GLCache\\*',",
  "                           'AppData\\Local\\AMD\\DxCache\\*', 'AppData\\Local\\AMD\\GLCache\\*')",
  "    'Chrome'           = @('AppData\\Local\\Google\\Chrome\\User Data\\*\\Cache\\*',",
  "                           'AppData\\Local\\Google\\Chrome\\User Data\\*\\Code Cache\\*',",
  "                           'AppData\\Local\\Google\\Chrome\\User Data\\*\\GPUCache\\*',",
  "                           'AppData\\Local\\Google\\Chrome\\User Data\\*\\Service Worker\\CacheStorage\\*',",
  "                           'AppData\\Local\\Google\\Chrome\\User Data\\ShaderCache\\*')",
  "    'Edge'             = @('AppData\\Local\\Microsoft\\Edge\\User Data\\*\\Cache\\*',",
  "                           'AppData\\Local\\Microsoft\\Edge\\User Data\\*\\Code Cache\\*',",
  "                           'AppData\\Local\\Microsoft\\Edge\\User Data\\*\\GPUCache\\*',",
  "                           'AppData\\Local\\Microsoft\\Edge\\User Data\\*\\Service Worker\\CacheStorage\\*',",
  "                           'AppData\\Local\\Microsoft\\Edge\\User Data\\ShaderCache\\*')",
  "    'Brave'            = @('AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data\\*\\Cache\\*',",
  "                           'AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data\\*\\Code Cache\\*',",
  "                           'AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data\\*\\GPUCache\\*')",
  "    'Firefox'          = @('AppData\\Local\\Mozilla\\Firefox\\Profiles\\*\\cache2\\*')",
  "    'Electron apps'    = @('AppData\\Roaming\\Code\\Cache\\*', 'AppData\\Roaming\\Code\\CachedData\\*',",
  "                           'AppData\\Roaming\\Code\\Code Cache\\*', 'AppData\\Roaming\\Code\\GPUCache\\*',",
  "                           'AppData\\Roaming\\discord\\Cache\\*', 'AppData\\Roaming\\discord\\Code Cache\\*',",
  "                           'AppData\\Roaming\\discord\\GPUCache\\*',",
  "                           'AppData\\Roaming\\Slack\\Cache\\*', 'AppData\\Roaming\\Slack\\Code Cache\\*',",
  "                           'AppData\\Roaming\\Slack\\Service Worker\\CacheStorage\\*',",
  "                           'AppData\\Roaming\\Microsoft\\Teams\\Cache\\*',",
  "                           'AppData\\Roaming\\Microsoft\\Teams\\Code Cache\\*')",
  "}",
  "if ($IncludeDev) {",
  "    $userTargets['Dev caches'] = @('AppData\\Local\\npm-cache\\*', 'AppData\\Local\\pip\\Cache\\*',",
  "                                   'AppData\\Local\\NuGet\\v3-cache\\*')",
  "}",
  "",
  "# Absolute system paths",
  "$systemTargets = [ordered]@{",
  "    'System temp'        = @('C:\\Windows\\Temp\\*')",
  "    'Error reports (WER)'= @('C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue\\*',",
  "                             'C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive\\*')",
  "    'NVIDIA installer'   = @('C:\\ProgramData\\NVIDIA Corporation\\NV_Cache\\*')",
  "    'Windows Update dl'  = @('C:\\Windows\\SoftwareDistribution\\Download\\*')",
  "    'Delivery Optimization' = @('C:\\Windows\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache\\*')",
  "}",
  "",
  "# ------------------------------------------------------------------ RUN",
  "$mode = if ($Delete) { 'DELETE' } else { 'DRY RUN (nothing deleted, add -Delete to clean)' }",
  "Say \"=== Cache cleanup: $mode  |  $(Get-Date) ===\"",
  "$freeBefore = (Get-PSDrive C).Free",
  "",
  "if ($Delete) {",
  "    # stop services that hold update/DO cache files",
  "    'wuauserv', 'bits', 'dosvc' | ForEach-Object { Stop-Service $_ -Force }",
  "}",
  "",
  "$grand = 0",
  "$rows = New-Object System.Collections.ArrayList",
  "",
  "function Process-Patterns([string]$Owner, [string]$Category, [string[]]$Patterns) {",
  "    $total = 0",
  "    foreach ($pat in $Patterns) {",
  "        foreach ($item in (Get-ChildItem -Path $pat -Force -ErrorAction SilentlyContinue)) {",
  "            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }  # never follow junctions",
  "            $sz = if ($item.PSIsContainer) { Get-SizeBytes $item.FullName } else { $item.Length }",
  "            $total += $sz",
  "            if ($Delete) { Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction SilentlyContinue }",
  "        }",
  "    }",
  "    if ($total -gt 0) {",
  "        [void]$rows.Add([pscustomobject]@{ Owner = $Owner; Category = $Category; Size = $total; Pretty = Fmt $total })",
  "    }",
  "    $total",
  "}",
  "",
  "foreach ($p in $profiles) {",
  "    foreach ($cat in $userTargets.Keys) {",
  "        $full = $userTargets[$cat] | ForEach-Object { Join-Path $p.FullName $_ }",
  "        $grand += Process-Patterns $p.Name $cat $full",
  "    }",
  "}",
  "foreach ($cat in $systemTargets.Keys) {",
  "    $grand += Process-Patterns 'SYSTEM' $cat $systemTargets[$cat]",
  "}",
  "",
  "if ($Delete) {",
  "    'wuauserv', 'bits', 'dosvc' | ForEach-Object { Start-Service $_ }",
  "}",
  "",
  "$rows | Sort-Object Size -Descending | Format-Table Owner, Category, Pretty -AutoSize",
  "Say (\"Total {0}: {1}\" -f $(if ($Delete) { 'targeted' } else { 'reclaimable' }), (Fmt $grand))",
  "",
  "if ($Delete) {",
  "    $freed = (Get-PSDrive C).Free - $freeBefore",
  "    Say (\"C: free space change: {0}  (locked/in-use files are skipped; close browsers and rerun for more)\" -f (Fmt $freed))",
  "    Say \"Log: $log\"",
  "}"
];
const FB_CC_BAT = [
  "@echo off",
  "setlocal EnableExtensions",
  "title Cache Cleaner",
  "",
  ":: ---- self-elevate to Administrator ----",
  "net session >nul 2>&1",
  "if %errorlevel% neq 0 goto elevate",
  "goto start",
  "",
  ":elevate",
  "powershell -NoProfile -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"",
  "exit /b",
  "",
  ":start",
  "set \"PS1=%~dp0Clean-Caches.ps1\"",
  "if not exist \"%PS1%\" goto missing",
  "",
  ":menu",
  "cls",
  "echo ==========================================",
  "echo   CACHE CLEANER  (all user profiles)",
  "echo ==========================================",
  "echo   1. Detect big cache folders   (read-only, slow)",
  "echo   2. Dry run                    (shows what would be deleted)",
  "echo   3. DELETE caches",
  "echo   4. DELETE caches + dev caches (npm / pip / NuGet)",
  "echo   5. Schedule weekly auto-clean (Sunday 10:00, as SYSTEM)",
  "echo   6. Remove the weekly schedule",
  "echo   0. Exit",
  "echo ==========================================",
  "set \"c=\"",
  "set /p \"c=Choose: \"",
  "",
  "if \"%c%\"==\"1\" goto detect",
  "if \"%c%\"==\"2\" goto dry",
  "if \"%c%\"==\"3\" goto del",
  "if \"%c%\"==\"4\" goto deldev",
  "if \"%c%\"==\"5\" goto sched",
  "if \"%c%\"==\"6\" goto unsched",
  "if \"%c%\"==\"0\" exit /b",
  "goto menu",
  "",
  ":detect",
  "powershell -NoProfile -ExecutionPolicy Bypass -File \"%PS1%\" -Detect",
  "goto done",
  "",
  ":dry",
  "powershell -NoProfile -ExecutionPolicy Bypass -File \"%PS1%\"",
  "goto done",
  "",
  ":del",
  "set \"yn=\"",
  "echo.",
  "echo Close browsers and Store apps first for best results.",
  "set /p \"yn=Type YES to delete caches: \"",
  "if /i not \"%yn%\"==\"YES\" goto menu",
  "powershell -NoProfile -ExecutionPolicy Bypass -File \"%PS1%\" -Delete",
  "goto done",
  "",
  ":deldev",
  "set \"yn=\"",
  "echo.",
  "set /p \"yn=Type YES to delete caches + dev caches: \"",
  "if /i not \"%yn%\"==\"YES\" goto menu",
  "powershell -NoProfile -ExecutionPolicy Bypass -File \"%PS1%\" -Delete -IncludeDev",
  "goto done",
  "",
  ":sched",
  "schtasks /create /tn \"CacheClean\" /tr \"powershell -NoProfile -ExecutionPolicy Bypass -File \\\"%PS1%\\\" -Delete\" /sc weekly /d SUN /st 10:00 /rl highest /ru SYSTEM /f",
  "echo.",
  "echo Keep Clean-Caches.ps1 at: %PS1%",
  "echo Moving or renaming it will break the scheduled task.",
  "goto done",
  "",
  ":unsched",
  "schtasks /delete /tn \"CacheClean\" /f",
  "goto done",
  "",
  ":missing",
  "echo.",
  "echo Clean-Caches.ps1 not found. Put it in the same folder as this .bat:",
  "echo %~dp0",
  "echo.",
  "pause",
  "exit /b 1",
  "",
  ":done",
  "echo.",
  "pause",
  "goto menu"
];
function fbBuildCacheCleaner(v){
  const ps1Name = fbSafeName(v.ps1Name, '.ps1', 'Clean-Caches.ps1');
  const batName = fbSafeName(v.batName, '.bat', 'Clean-Caches.bat');
  const task = fbOneLine(v.task).replace(/["%]/g, '') || 'CacheClean';
  const minMB = Math.max(1, parseInt(v.minMB, 10) || 50);
  const ps = FB_CC_PS1.map(l => l.split('Clean-Caches.ps1').join(ps1Name).replace('[int]$MinMB = 50', '[int]$MinMB = ' + minMB));
  const bat = FB_CC_BAT.map(l => l.split('Clean-Caches.ps1').join(ps1Name).split('/tn "CacheClean"').join('/tn "' + task + '"').split('/tn \"CacheClean\"').join('/tn \"' + task + '\"'));
  const out = [{ name: ps1Name, content: fbPs1Text(ps) }];
  if(v.launcher) out.push({ name: batName, content: fbCrlf(bat) });
  return out;
}

const FB_TEMPLATES = [
  { id:'git-push', cat:'Git', label:'Git push script', shell:'powershell',
    desc:'The Push.ps1 + Push_Launcher.bat pair, for any repo: branch, remote, push mode, deploy stamp, commit message.',
    fields:[
      {k:'repoName', l:'Project name (banner + commit message)', t:'text', d:'MyProject'},
      {k:'remote', l:'GitHub remote URL', t:'text', d:'https://github.com/YOUR-USER/YOUR-REPO'},
      {k:'branch', l:'Branch', t:'text', d:'main'},
      {k:'mode', l:'Push mode', t:'select', d:'force', o:[['force', 'Force push — local folder wins (like Push.ps1)'], ['push', 'Normal push — fails if remote is ahead'], ['rebase', 'Pull --rebase first, then push']]},
      {k:'msg', l:'Commit message — {repo} and {date} are filled in', t:'text', d:'Push {repo} {date}'},
      {k:'ps1Name', l:'Script file name', t:'text', d:'Push.ps1'},
      {k:'launcherName', l:'Launcher file name', t:'text', d:'Push_Launcher.bat'},
      {k:'confirm', l:'Ask for confirmation before pushing', t:'check', d:true},
      {k:'stamp', l:'Write .deploy_stamp so every push is a new commit (forces a redeploy)', t:'check', d:true},
      {k:'askMsg', l:'Ask for the commit message each run (Enter keeps the pattern above)', t:'check', d:false},
      {k:'launcher', l:'Also make the double-click .bat launcher', t:'check', d:true},
    ],
    build:fbBuildGitPush,
    warn(v){
      const w = [];
      const r = fbOneLine(v.remote);
      if(!r || /YOUR-USER|YOUR-REPO/.test(r)) w.push('Replace the placeholder GitHub URL with your real repository URL.');
      if(/\/\/[^/]*@/.test(r) || /ghp_|github_pat_/.test(r)) w.push('Do not put a username/token inside the URL — it would be saved in plain text. Use Git Credential Manager (the normal GitHub sign-in prompt) instead.');
      if(!/^[A-Za-z0-9._\/-]+$/.test(fbOneLine(v.branch) || 'main')) w.push('Branch names should only use letters, digits, . _ - and /.');
      if(v.mode === 'force') w.push('Force push overwrites the remote branch with this folder. Anything that exists only on GitHub is lost.');
      return w;
    },
    note(v){ return 'Put both files in your project folder, then double-click ' + fbSafeName(v.launcherName, '.bat', 'Push_Launcher.bat') + '.'; },
    zip:'git-push' },

  { id:'ps1', cat:'Scripts', label:'PowerShell script (.ps1)', shell:'powershell', comment:'# ',
    desc:'A .ps1 from your own commands, with optional admin self-elevation, logging, and a double-click .bat launcher.',
    fields:[
      {k:'name', l:'File name', t:'text', d:'my-script.ps1'},
      ...FB_SCRIPT_FIELDS_COMMON,
      {k:'body', l:'Commands (one per line — paste anything, or pull from Merge / saved commands below)', t:'area', d:'', pull:true},
      {k:'strict', l:"Stop on the first error ($ErrorActionPreference = 'Stop')", t:'check', d:false},
      {k:'elevate', l:'Re-launch as Administrator if not already', t:'check', d:false},
      {k:'cdHere', l:"Run from the script's own folder", t:'check', d:true},
      {k:'log', l:'Log everything to a .log file next to the script', t:'check', d:false},
      {k:'pause', l:'Wait for Enter at the end', t:'check', d:true},
      {k:'launcher', l:'Also make a double-click .bat launcher (skips the execution-policy block)', t:'check', d:true},
    ],
    build:fbBuildPs1,
    warn(v){ return String(v.body || '').trim() ? [] : ['Add at least one command in the box above — the script is empty right now.']; },
    note(){ return 'Double-click the -run.bat launcher; double-clicking a .ps1 directly usually just opens it in an editor.'; },
    zip:'powershell-script' },

  { id:'bat', cat:'Scripts', label:'Batch file (.bat)', shell:'cmd', comment:'REM ',
    desc:'A .bat from your own commands, with optional admin prompt, UTF-8 console, and a pause at the end.',
    fields:[
      {k:'name', l:'File name', t:'text', d:'my-script.bat'},
      {k:'title', l:'Window title (optional)', t:'text', d:''},
      ...FB_SCRIPT_FIELDS_COMMON,
      {k:'body', l:'Commands (one per line — paste anything, or pull from Merge / saved commands below)', t:'area', d:'', pull:true},
      {k:'echoOff', l:'@echo off (hide each command as it runs)', t:'check', d:true},
      {k:'setlocal', l:'setlocal (variables stay inside this script)', t:'check', d:false},
      {k:'cdHere', l:"Run from the script's own folder (cd /d \"%~dp0\")", t:'check', d:true},
      {k:'elevate', l:'Ask for Administrator rights if not already', t:'check', d:false},
      {k:'utf8', l:'UTF-8 console (chcp 65001) — for non-English text', t:'check', d:false},
      {k:'pause', l:'pause at the end so the window stays open', t:'check', d:true},
    ],
    build:fbBuildBat,
    warn(v){
      const w = [];
      if(!String(v.body || '').trim()) w.push('Add at least one command in the box above — the script is empty right now.');
      if(fbNonAscii(String(v.body || '') + String(v.desc || '')) && !v.utf8) w.push('Non-English characters in a .bat often show garbled — turn on "UTF-8 console".');
      return w;
    },
    note(){ return 'Double-click it, or right-click → Run as administrator.'; },
    zip:'batch-script' },

  { id:'sh', cat:'Scripts', label:'Shell script (.sh)', shell:'unix', comment:'# ',
    desc:'A .sh for WSL / Linux / macOS with a shebang, strict mode, and run-from-its-own-folder options.',
    fields:[
      {k:'name', l:'File name', t:'text', d:'my-script.sh'},
      {k:'shell', l:'Shell', t:'select', d:'bash', o:[['bash', 'bash'], ['sh', 'sh (POSIX)']]},
      ...FB_SCRIPT_FIELDS_COMMON,
      {k:'body', l:'Commands (one per line — paste anything, or pull from Merge / saved commands below)', t:'area', d:'', pull:true},
      {k:'strict', l:'Stop on the first error (set -e, unset variables, pipe failures)', t:'check', d:true},
      {k:'cdHere', l:"Run from the script's own folder", t:'check', d:false},
      {k:'pause', l:'Wait for Enter at the end', t:'check', d:false},
    ],
    build:fbBuildSh,
    warn(v){ return String(v.body || '').trim() ? [] : ['Add at least one command in the box above — the script is empty right now.']; },
    note(v){ return 'Make it executable first: chmod +x ' + fbSafeName(v.name, '.sh', 'script.sh') + ' — then run ./' + fbSafeName(v.name, '.sh', 'script.sh') + '.'; },
    zip:'shell-script' },

  { id:'cache-cleaner', cat:'Scripts', label:'Cache cleaner (Clean-Caches)', shell:'powershell',
    desc:'Detect, dry-run, and delete cache/temp data across ALL user profiles + system temp, with a menu launcher and an optional weekly SYSTEM schedule.',
    fields:[
      {k:'ps1Name', l:'Script file name', t:'text', d:'Clean-Caches.ps1'},
      {k:'batName', l:'Launcher file name', t:'text', d:'Clean-Caches.bat'},
      {k:'task', l:'Scheduled task name (menu option 5)', t:'text', d:'CacheClean'},
      {k:'minMB', l:'Detect mode: only report folders at least this big (MB)', t:'text', d:'50'},
      {k:'launcher', l:'Also make the double-click .bat menu launcher', t:'check', d:true},
    ],
    build:fbBuildCacheCleaner,
    warn(v){
      const w = [];
      if(!/^\d+$/.test(fbOneLine(v.minMB) || '50')) w.push('Minimum size should be a whole number of MB.');
      if(v.launcher === false) w.push('Without the launcher you run it yourself from an elevated PowerShell: .\\' + fbSafeName(v.ps1Name, '.ps1', 'Clean-Caches.ps1') + ' (dry run), then add -Delete.');
      w.push('Options 3-5 delete real data and the weekly task runs as SYSTEM with no prompt. Do option 2 (dry run) first.');
      return w;
    },
    note(v){ return 'Keep both files in the same folder (the launcher looks for the .ps1 next to itself, and the weekly task points at that exact path). Double-click ' + fbSafeName(v.batName, '.bat', 'Clean-Caches.bat') + ' — it asks for Administrator itself.'; },
    zip:'cache-cleaner' },

  { id:'gitignore', cat:'Repo files', label:'.gitignore', 
    desc:'Pick what to ignore (OS junk, editors, Node, Python, secrets, logs…) and add your own lines.',
    fields:[
      {k:'presets', l:'Ignore these', t:'chips', d:'windows,vscode,env,logs', o:Object.keys(FB_IGNORE_BLOCKS).map(k=>[k, FB_IGNORE_BLOCKS[k].l])},
      {k:'extra', l:'Extra lines (one pattern per line)', t:'area', d:''},
    ],
    build:fbBuildGitignore,
    warn(v){ return extArr(v.presets).includes('env') ? [] : ['Nothing in this file keeps .env files or keys out of Git — consider ticking "Secrets & .env".']; },
    note(){ return 'Save it as .gitignore in the project root (the file name starts with a dot).'; },
    zip:'gitignore' },

  { id:'gitattributes', cat:'Repo files', label:'.gitattributes',
    desc:'Stops line-ending trouble: keeps .bat/.ps1 as CRLF and .sh as LF no matter who edits them.',
    fields:[
      {k:'normalize', l:'Auto-detect text files and store them with LF', t:'check', d:true},
      {k:'crlfScripts', l:'.bat / .cmd / .ps1 stay CRLF', t:'check', d:true},
      {k:'lfShell', l:'.sh stays LF', t:'check', d:true},
      {k:'binary', l:'Mark images, fonts, PDFs and zips as binary', t:'check', d:true},
    ],
    build:fbBuildGitattributes,
    note(){ return 'Save it as .gitattributes in the project root, commit it, then run: git add --renormalize .'; },
    zip:'gitattributes' },

  { id:'editorconfig', cat:'Repo files', label:'.editorconfig',
    desc:'Shared editor rules (indent, line endings, trailing spaces) that VS Code and most editors honour.',
    fields:[
      {k:'indentStyle', l:'Indent with', t:'select', d:'space', o:[['space', 'Spaces'], ['tab', 'Tabs']]},
      {k:'indentSize', l:'Indent size (spaces)', t:'select', d:'2', o:[['2', '2'], ['4', '4'], ['8', '8']]},
      {k:'eol', l:'Default line endings', t:'select', d:'lf', o:[['lf', 'LF'], ['crlf', 'CRLF']]},
      {k:'finalNewline', l:'Newline at end of file', t:'check', d:true},
      {k:'trim', l:'Trim trailing whitespace', t:'check', d:true},
      {k:'winCrlf', l:'.bat / .cmd / .ps1 always CRLF', t:'check', d:true},
      {k:'psBom', l:'.ps1 saved as UTF-8 with BOM (safe for non-English text in Windows PowerShell 5.1)', t:'check', d:false},
      {k:'mdTrim', l:'Keep trailing spaces in .md (they mean a line break)', t:'check', d:true},
      {k:'makeTabs', l:'Makefiles always use tabs', t:'check', d:false},
    ],
    build:fbBuildEditorconfig,
    note(){ return 'Save it as .editorconfig in the project root.'; },
    zip:'editorconfig' },
];

// ---------- state ----------
function fbTpl(){ return FB_TEMPLATES.find(t=>t.id === fbTplId) || FB_TEMPLATES[0]; }
function fbValues(tpl){
  const out = {};
  tpl.fields.forEach(f=>{ out[f.k] = f.d; });
  return Object.assign(out, fbAll[tpl.id] || {});
}
function fbStore(tpl, v){ fbAll[tpl.id] = v; lsSetJSON(FB_LS_KEY, fbAll); }

function fbFiles(){
  const tpl = fbTpl();
  return tpl.build(fbValues(tpl));
}

// ---------- rendering ----------
function fbFieldHtml(tpl, f, v){
  const val = v[f.k];
  if(f.t === 'check'){
    return `<label class="fb-check fb-wide"><input type="checkbox" data-fb="${f.k}" onchange="onFbInput(this)"${val ? ' checked' : ''}><span>${escapeHtml(f.l)}</span></label>`;
  }
  if(f.t === 'select'){
    const opts = f.o.map(([ov, ol])=>`<option value="${escapeAttr(ov)}"${String(val) === ov ? ' selected' : ''}>${escapeHtml(ol)}</option>`).join('');
    return `<label class="gen-field"><span class="gen-field-label">${escapeHtml(f.l)}</span><select class="gen-field-input gen-field-select" data-fb="${f.k}" onchange="onFbInput(this)">${opts}</select></label>`;
  }
  if(f.t === 'chips'){
    const sel = new Set(extArr(val));
    const chips = f.o.map(([ov, ol])=>`<button type="button" class="gen-drive-chip${sel.has(ov) ? ' active' : ''}" onclick="onFbChip('${f.k}','${ov}')">${escapeHtml(ol)}</button>`).join('');
    return `<div class="gen-field fb-wide"><span class="gen-field-label">${escapeHtml(f.l)}</span><div class="gen-drive-picks">${chips}</div></div>`;
  }
  if(f.t === 'area'){
    let pull = '';
    if(f.pull){
      const saved = DATA.filter(i=>i.s === 'mine' && (!i.sh || i.sh === tpl.shell));
      const opts = saved.map(i=>`<option value="${i._id}">${escapeHtml(i.cmd.slice(0, 70))}</option>`).join('');
      pull = `<div class="fb-pull">
        <button type="button" class="copy-btn" onclick="fbPullMerge('${f.k}')" title="Appends every ${SHELL_LABELS[tpl.shell]} command in your Merge list">↓ add my Merge list</button>
        ${saved.length ? `<select class="gen-field-input gen-field-select fb-pull-select" onchange="fbAddSaved('${f.k}', this)"><option value="">↓ add a saved command…</option>${opts}</select>` : `<span class="fb-pull-hint">No saved ${SHELL_LABELS[tpl.shell]} commands yet — save some in “My saved commands”.</span>`}
      </div>`;
    }
    return `<label class="gen-field fb-wide"><span class="gen-field-label">${escapeHtml(f.l)}</span><textarea class="gen-field-input fb-area" rows="${f.pull ? 7 : 3}" data-fb="${f.k}" oninput="onFbInput(this)" spellcheck="false">${escapeHtml(String(val || ''))}</textarea>${pull}</label>`;
  }
  return `<label class="gen-field${f.wide ? ' fb-wide' : ''}"><span class="gen-field-label">${escapeHtml(f.l)}</span><input type="text" class="gen-field-input" data-fb="${f.k}" value="${escapeAttr(String(val == null ? '' : val))}" oninput="onFbInput(this)" autocomplete="off" spellcheck="false"></label>`;
}

function fbOutputHtml(){
  const tpl = fbTpl();
  const v = fbValues(tpl);
  let files;
  try{ files = tpl.build(v); }
  catch(e){ return `<div class="fb-warn">Could not build this file: ${escapeHtml(e.message)}</div>`; }
  const warns = (tpl.warn ? tpl.warn(v) : []).map(w=>`<div class="fb-warn">⚠ ${escapeHtml(w)}</div>`).join('');
  const filesHtml = files.map((f, i)=>`<div class="fb-file">
      <div class="gen-output-top">
        <span class="fb-file-name">${escapeHtml(f.name)}</span>
        <span class="gen-output-btns">
          <button type="button" class="copy-btn" onclick="fbCopyFile(${i}, this)">copy</button>
          <button type="button" class="copy-btn" onclick="fbDownloadFile(${i})">⬇ download</button>
        </span>
      </div>
      <pre class="fb-pre">${escapeHtml(fbPlain(f.content))}</pre>
    </div>`).join('');
  const multi = files.length > 1;
  return `${warns}${filesHtml}
    <div class="fb-foot">
      <span class="combine-download-hint">${escapeHtml(tpl.note ? tpl.note(v) : '')}</span>
      ${multi ? `<span class="gen-output-btns">
        <button type="button" class="copy-btn" onclick="fbDownloadAll()">⬇ all ${files.length} files</button>
        <button type="button" class="copy-btn" onclick="fbDownloadZip()">⬇ .zip</button>
      </span>` : ''}
    </div>`;
}

function fbPresetRowHtml(tpl){
  const list = presetList(tpl.id);
  const opts = list.map(p=>`<option value="${escapeAttr(p.id)}"${p.id === fbLoadedPresetId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  return `<div class="fb-presets">
    <select class="gen-field-input gen-field-select fb-preset-select" onchange="fbLoadPreset(this.value)"${list.length ? '' : ' disabled'}>
      <option value="">${list.length ? 'Load a saved preset…' : 'No presets yet'}</option>${opts}
    </select>
    <input type="text" class="gen-field-input fb-preset-name" placeholder="Preset name (e.g. rekzjaswan site)" value="${escapeAttr(fbPresetName)}" oninput="fbPresetName = this.value" autocomplete="off" spellcheck="false">
    <button type="button" class="copy-btn" onclick="fbSavePreset()" title="Save the current field values under this name">★ save preset</button>
    ${fbLoadedPresetId ? `<button type="button" class="copy-btn mine-del" onclick="fbDeletePreset()">delete preset</button>` : ''}
    ${fbNote ? `<span class="fb-preset-note">${escapeHtml(fbNote)}</span>` : ''}
  </div>`;
}

function fileBuilderHtml(){
  const tpl = fbTpl();
  const v = fbValues(tpl);
  const cats = [...new Set(FB_TEMPLATES.map(t=>t.cat))];
  let listHtml = '';
  cats.forEach(cat=>{
    listHtml += `<div class="gen-cat-label">${escapeHtml(cat)}</div>`;
    FB_TEMPLATES.filter(t=>t.cat === cat).forEach(t=>{
      listHtml += `<button type="button" class="gen-task-btn${t.id === tpl.id ? ' active' : ''}" onclick="onFbTemplateClick('${t.id}')">${escapeHtml(t.label)}</button>`;
    });
  });
  const fieldsHtml = tpl.fields.map(f=>fbFieldHtml(tpl, f, v)).join('');
  return `<div class="gen-layout">
    <div class="gen-tasks">${listHtml}</div>
    <div class="gen-build" style="--card-accent:var(--amber)">
      <p class="fb-desc">${escapeHtml(tpl.desc)}</p>
      ${fbPresetRowHtml(tpl)}
      <div class="gen-fields">${fieldsHtml}</div>
      <div class="gen-output-wrap" id="fbOutput">${fbOutputHtml()}</div>
    </div>
  </div>`;
}

// ---------- handlers ----------
function onFbTemplateClick(id){
  fbTplId = id;
  fbPresetName = '';
  fbLoadedPresetId = '';
  fbNote = '';
  renderGenerator();
}

function onFbInput(el){
  const tpl = fbTpl();
  const v = fbValues(tpl);
  const key = el.getAttribute('data-fb');
  v[key] = el.type === 'checkbox' ? el.checked : el.value;
  fbStore(tpl, v);
  const out = document.getElementById('fbOutput');
  if(out) out.innerHTML = fbOutputHtml();
}

function onFbChip(key, value){
  const tpl = fbTpl();
  const v = fbValues(tpl);
  const cur = extArr(v[key]);
  const i = cur.indexOf(value);
  if(i === -1) cur.push(value); else cur.splice(i, 1);
  v[key] = cur.join(',');
  fbStore(tpl, v);
  renderGenerator();
}

function fbAppend(key, text){
  const tpl = fbTpl();
  const v = fbValues(tpl);
  const base = String(v[key] || '').replace(/\s+$/, '');
  v[key] = (base ? base + '\n' : '') + text;
  fbStore(tpl, v);
  renderGenerator();
}

function fbPullMerge(key){
  const tpl = fbTpl();
  const entries = combineEntries().filter(e=>e.shell === tpl.shell);
  if(!entries.length){
    fbNote = 'Your Merge list has no ' + SHELL_LABELS[tpl.shell] + ' commands yet — add some from the Merge commands tab.';
    renderGenerator();
    return;
  }
  fbNote = '';
  fbAppend(key, entries.map(e=>(tpl.comment || '# ') + e.label + '\n' + e.command).join('\n\n'));
}

function fbAddSaved(key, selectEl){
  const id = Number(selectEl.value);
  selectEl.value = '';
  const item = DATA.find(i=>i._id === id);
  if(!item) return;
  const tpl = fbTpl();
  fbNote = '';
  fbAppend(key, (tpl.comment || '# ') + item.cmd + '\n' + item.ex);
}

function fbSavePreset(){
  const tpl = fbTpl();
  const id = presetSave(tpl.id, fbPresetName.trim() || tpl.label, fbValues(tpl));
  fbLoadedPresetId = id;
  const p = presetList(tpl.id).find(x=>x.id === id);
  fbPresetName = p ? p.name : fbPresetName;
  fbNote = 'Preset saved. Export for repo (in My saved commands) to make it permanent.';
  renderGenerator();
}

function fbLoadPreset(id){
  const tpl = fbTpl();
  if(!id){ fbLoadedPresetId = ''; fbNote = ''; renderGenerator(); return; }
  const p = presetList(tpl.id).find(x=>x.id === id);
  if(!p) return;
  fbStore(tpl, Object.assign({}, fbValues(tpl), p.values));
  fbLoadedPresetId = p.id;
  fbPresetName = p.name;
  fbNote = '';
  renderGenerator();
}

function fbDeletePreset(){
  const tpl = fbTpl();
  const p = presetList(tpl.id).find(x=>x.id === fbLoadedPresetId);
  if(!p) return;
  if(!confirm('Delete preset "' + p.name + '"?')) return;
  presetRemove(p.id);
  fbLoadedPresetId = '';
  fbPresetName = '';
  fbNote = 'Preset deleted.';
  renderGenerator();
}

function fbCopyFile(i, btn){
  const f = fbFiles()[i];
  if(!f) return;
  copyToClipboard(fbPlain(f.content)).then(()=>showCopyFeedback(btn, true)).catch(()=>showCopyFeedback(btn, false));
}

function fbDownloadFile(i){
  const f = fbFiles()[i];
  if(f) downloadTextFile(f.name, f.content);
}

function fbDownloadAll(){
  fbFiles().forEach(f=>downloadTextFile(f.name, f.content));
}

// ---------- minimal .zip writer (stored, no compression) so a multi-file result is ONE download ----------
const FB_CRC_TABLE = (()=>{
  const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function fbCrc32(bytes){
  let c = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++) c = FB_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function fbMakeZip(files){
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  files.forEach(f=>{
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = fbCrc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cdSize = central.reduce((n, c)=>n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {type:'application/zip'});
}

function fbDownloadZip(){
  const tpl = fbTpl();
  const blob = fbMakeZip(fbFiles());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (tpl.zip || tpl.id) + '.zip';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
