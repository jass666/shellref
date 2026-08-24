/* ==========================================================================
   shellref — Command Generator + Combine feature
   ==========================================================================
   Everything behind the "Command generator" nav tab: the interactive recipe
   builder (GENERATORS), the "browse & fill in the blanks" mode over DATA,
   the multi-command "combine" list builder, generator history, and the
   FAQ tab renderer. Depends on DATA (js/data.js) and SECTION_META
   (js/sections.js) being loaded first.
   ========================================================================== */

// ---------- command generator ----------
// Each task defines, per shell, the input fields it needs and a build(values) function
// that returns the finished command string. 'd' on a param is its default value.
// Reusable "this folder only" vs "include subfolders" toggle, spread into any task that searches a folder tree
const SCOPE_PARAM = {k:'scope', l:'Search in', type:'select', d:'sub',
  options:[{v:'sub',l:'This folder + subfolders'},{v:'top',l:'This folder only'}]};

// Sentinel path value meaning "every drive / the whole system", not one specific folder.
// Recognized by build() functions below to switch from a single-root command to a
// system-wide one (looping drives on Windows, or searching from / on WSL/unix).
const ALL_DRIVES = '__ALL_DRIVES__';
// Quick-pick chips rendered under a "Folder to search" field so a drive can be chosen
// with one click instead of typing it — this is what was missing before: no direct way
// to target "the whole C drive" or "search everywhere" without typing a path by hand.
const WIN_DRIVE_PICKS = [
  {v:'C:\\', l:'C:'}, {v:'D:\\', l:'D:'}, {v:'E:\\', l:'E:'}, {v:'F:\\', l:'F:'},
  {v:ALL_DRIVES, l:'All drives (entire system)', all:true},
];
const WIN_DRIVE_PICKS_SAFE = WIN_DRIVE_PICKS.filter(p=>!p.all); // no one-click whole-system delete
const UNIX_DRIVE_PICKS = [
  {v:'/mnt/c', l:'C:'}, {v:'/mnt/d', l:'D:'}, {v:'/mnt/e', l:'E:'}, {v:'/mnt/f', l:'F:'},
  {v:'/', l:'Whole filesystem (/)', all:true},
];
const UNIX_DRIVE_PICKS_SAFE = UNIX_DRIVE_PICKS.filter(p=>!p.all);

// Quick-pick chips for the "Extension" fields (find/delete/search-by-type tasks) — same
// one-click idea as the drive picks above, covering the extensions people actually reach
// for most: logs/text, common docs, spreadsheets/data, images, archives, and a couple of
// dev-file staples. Kept to one row's worth so it doesn't dominate the field.
const EXT_PICKS = [
  {v:'txt', l:'.txt'}, {v:'log', l:'.log'}, {v:'pdf', l:'.pdf'}, {v:'docx', l:'.docx'},
  {v:'xlsx', l:'.xlsx'}, {v:'csv', l:'.csv'}, {v:'jpg', l:'.jpg'}, {v:'png', l:'.png'},
  {v:'zip', l:'.zip'}, {v:'json', l:'.json'},
];
// Same picks, plus a leading "Any file" chip that clears the field — used on the one task
// (Search for text inside files) where the extension is an optional filter rather than
// the whole point of the task, so there needs to be a one-click way back to "no filter."
const EXT_PICKS_OPTIONAL = [{v:'', l:'Any file', all:true}, ...EXT_PICKS];

// Drive quick-picks store a path with a trailing backslash (e.g. "C:\") so it's a valid,
// unambiguous root on its own. But several build() functions below join v.path with a
// hardcoded "\" before appending a pattern (e.g. `${v.path}\*.${ext}`), which assumes the
// path has NO trailing backslash — typing "C:\Projects" (no trailing slash) works fine,
// but picking "C:\" produces "C:\\*.ext". Strip any trailing backslash/slash here before
// that kind of join so both typed paths and drive-picked paths produce a single backslash.
function winPath(p){ return String(p).replace(/[\\/]+$/, ''); }

// Ext fields now support picking more than one extension (chips toggle on/off instead of
// replacing each other), stored as a comma-separated string in genState.values, e.g. "log,txt".
// Every build() that reads an ext field goes through extArr() to get a clean array back,
// so a single extension still behaves exactly as before (array of length 1).
function extArr(ext){ return String(ext||'').split(',').map(s=>s.trim()).filter(Boolean); }

// find's -name/-iname only take one pattern each, so 2+ extensions need to be OR'd together
// in a parenthesized group: \( -name "*.a" -o -name "*.b" \). Falls back to the plain single
// form (identical to the old output) when there's just one extension.
function findNameExpr(exts, flag){
  if(exts.length<=1) return `${flag} "*.${exts[0]||''}"`;
  return `\\( ${exts.map(e=>`${flag} "*.${e}"`).join(' -o ')} \\)`;
}

const GENERATORS = [
  { id:'find-ext', label:'Find files by extension', cat:'Files', shells:{
    cmd:{ params:[{k:'ext',l:'Extension(s) (no dot)',ph:'crd',d:'crd',extPicks:EXT_PICKS,multi:true},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      // dir/del accept several file specs as separate space-separated arguments, so multiple
      // extensions are just multiple quoted "path\*.ext" specs on the same line.
      build:v=>{ const exts = extArr(v.ext);
        if(v.path===ALL_DRIVES){
          const specs = exts.map(e=>`"%d:\\*.${e}"`).join(' ');
          return `for %d in (C D E F G H) do @if exist %d:\\ dir ${specs} /s /b 2>nul`;
        }
        const specs = exts.map(e=>`"${winPath(v.path)}\\*.${e}"`).join(' ');
        return v.scope==='top' ? `dir ${specs} /b` : `dir ${specs} /s /b`; } },
    powershell:{ params:[{k:'ext',l:'Extension(s) (no dot)',ph:'crd',d:'crd',extPicks:EXT_PICKS,multi:true},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      // -Filter only ever takes one pattern; 2+ extensions switch to -Include (comma-separated),
      // which needs either -Recurse or a Path that already ends in \* to actually filter.
      build:v=>{ const exts = extArr(v.ext); const single = exts.length<=1;
        const filt = single ? ` -Filter *.${exts[0]||''}` : ` -Include ${exts.map(e=>`*.${e}`).join(',')}`;
        if(v.path===ALL_DRIVES)
          return `Get-PSDrive -PSProvider FileSystem | ForEach-Object { Get-ChildItem -Path $_.Root -Recurse${filt} -ErrorAction SilentlyContinue }`;
        if(v.scope==='top')
          return single ? `Get-ChildItem -Path "${v.path}" -Filter *.${exts[0]||''}` : `Get-ChildItem -Path "${winPath(v.path)}\\*" -Include ${exts.map(e=>`*.${e}`).join(',')}`;
        return single ? `Get-ChildItem -Path "${v.path}" -Filter *.${exts[0]||''} -Recurse` : `Get-ChildItem -Path "${v.path}" -Include ${exts.map(e=>`*.${e}`).join(',')} -Recurse`; } },
    unix:{ params:[{k:'ext',l:'Extension(s) (no dot)',ph:'crd',d:'crd',extPicks:EXT_PICKS,multi:true},{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS},SCOPE_PARAM],
      build:v=>{ const exts = extArr(v.ext);
        return v.path==='/'
          ? `find / -type f ${findNameExpr(exts,'-iname')} 2>/dev/null`
          : (v.scope==='top' ? `find ${v.path} -maxdepth 1 -type f ${findNameExpr(exts,'-name')}` : `find ${v.path} -type f ${findNameExpr(exts,'-name')}`); } },
  }},
  { id:'list-extensions', label:'List every file type in a folder', cat:'Files', shells:{
    // The inverse of find-ext: instead of hunting for a known extension, this
    // discovers what extensions actually exist under a folder (or a whole drive).
    // No 'ext' field — that's the whole point — just path + scope.
    cmd:{ params:[{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      // No native "unique" filter in CMD, so this collects every file's extension into a
      // temp file, sorts it (identical extensions land next to each other), then a
      // delayed-expansion loop prints a line only when it differs from the one before it —
      // a true one-line-per-type list, not just sorted-with-duplicates.
      build:v=>{
        const dedupe = `set "prev=" & for /f "delims=" %g in (%temp%\\exts.txt) do @(if not "%g"=="!prev!" echo %g) & set "prev=%g"`;
        if(v.path===ALL_DRIVES)
          return `setlocal enabledelayedexpansion\n(for %d in (C D E F G H) do @if exist %d:\\ for /r %d:\\ %f in (*) do @echo %~xf) | sort > "%temp%\\exts.txt"\n${dedupe}`;
        const collect = v.scope==='top'
          ? `(for %f in ("${winPath(v.path)}\\*") do @echo %~xf) | sort > "%temp%\\exts.txt"`
          : `(for /r "${v.path}" %f in (*) do @echo %~xf) | sort > "%temp%\\exts.txt"`;
        return `setlocal enabledelayedexpansion\n${collect}\n${dedupe}`; } },
    powershell:{ params:[{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      build:v=>{
        if(v.path===ALL_DRIVES)
          return `Get-PSDrive -PSProvider FileSystem | ForEach-Object { Get-ChildItem -Path $_.Root -Recurse -File -ErrorAction SilentlyContinue } | Group-Object Extension | Sort-Object Count -Descending`;
        return v.scope==='top'
          ? `Get-ChildItem -Path "${v.path}" -File | Select-Object -Unique Extension | Sort-Object Extension`
          : `Get-ChildItem -Path "${v.path}" -Recurse -File | Group-Object Extension | Sort-Object Count -Descending`; } },
    unix:{ params:[{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS},SCOPE_PARAM],
      build:v=>{
        if(v.path==='/')
          return `find / -type f 2>/dev/null | sed 's/.*\\.//' | sort | uniq -c | sort -rn`;
        return v.scope==='top'
          ? `ls -p "${v.path}" | grep -v / | sed 's/.*\\.//' | sort -u`
          : `find "${v.path}" -type f | sed 's/.*\\.//' | sort | uniq -c | sort -rn`; } },
  }},
  { id:'find-name', label:'Find files by name (partial match)', cat:'Files', shells:{
    cmd:{ params:[{k:'name',l:'Text in filename',ph:'invoice',d:'invoice'},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      build:v=> v.path===ALL_DRIVES
        ? `for %d in (C D E F G H) do @if exist %d:\\ dir "%d:\\*${v.name}*" /s /b 2>nul`
        : (v.scope==='top' ? `dir "${winPath(v.path)}\\*${v.name}*" /b` : `dir "${winPath(v.path)}\\*${v.name}*" /s /b`) },
    powershell:{ params:[{k:'name',l:'Text in filename',ph:'invoice',d:'invoice'},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      build:v=> v.path===ALL_DRIVES
        ? `Get-PSDrive -PSProvider FileSystem | ForEach-Object { Get-ChildItem -Path $_.Root -Filter *${v.name}* -Recurse -ErrorAction SilentlyContinue }`
        : (v.scope==='top' ? `Get-ChildItem -Path "${v.path}" -Filter *${v.name}*` : `Get-ChildItem -Path "${v.path}" -Filter *${v.name}* -Recurse`) },
    unix:{ params:[{k:'name',l:'Text in filename',ph:'invoice',d:'invoice'},{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS},SCOPE_PARAM],
      build:v=> v.path==='/'
        ? `find / -iname "*${v.name}*" 2>/dev/null`
        : (v.scope==='top' ? `find ${v.path} -maxdepth 1 -iname "*${v.name}*"` : `find ${v.path} -iname "*${v.name}*"`) },
  }},
  { id:'find-recent', label:'Find files modified in the last N days', cat:'Files', shells:{
    powershell:{ params:[{k:'days',l:'Within last N days',ph:'7',d:'7'},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      build:v=> v.path===ALL_DRIVES
        ? `Get-PSDrive -PSProvider FileSystem | ForEach-Object { Get-ChildItem -Path $_.Root -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-${v.days}) } }`
        : (v.scope==='top'
          ? `Get-ChildItem -Path "${v.path}" | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-${v.days}) }`
          : `Get-ChildItem -Path "${v.path}" -Recurse | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-${v.days}) }`) },
    unix:{ params:[{k:'days',l:'Within last N days',ph:'7',d:'7'},{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS},SCOPE_PARAM],
      build:v=> v.path==='/'
        ? `find / -type f -mtime -${v.days} 2>/dev/null`
        : (v.scope==='top' ? `find ${v.path} -maxdepth 1 -type f -mtime -${v.days}` : `find ${v.path} -type f -mtime -${v.days}`) },
  }},
  { id:'find-large', label:'Find files larger than N MB', cat:'Files', shells:{
    powershell:{ params:[{k:'size',l:'Size threshold (MB)',ph:'100',d:'100'},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      build:v=> v.path===ALL_DRIVES
        ? `Get-PSDrive -PSProvider FileSystem | ForEach-Object { Get-ChildItem -Path $_.Root -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt ${v.size}MB } }`
        : (v.scope==='top'
          ? `Get-ChildItem -Path "${v.path}" | Where-Object { $_.Length -gt ${v.size}MB }`
          : `Get-ChildItem -Path "${v.path}" -Recurse | Where-Object { $_.Length -gt ${v.size}MB }`) },
    unix:{ params:[{k:'size',l:'Size threshold (MB)',ph:'100',d:'100'},{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS},SCOPE_PARAM],
      build:v=> v.path==='/'
        ? `find / -type f -size +${v.size}M 2>/dev/null`
        : (v.scope==='top' ? `find ${v.path} -maxdepth 1 -type f -size +${v.size}M` : `find ${v.path} -type f -size +${v.size}M`) },
  }},
  { id:'delete-ext', label:'Delete all files with an extension', cat:'Files', shells:{
    cmd:{ params:[{k:'ext',l:'Extension(s) (no dot)',ph:'tmp',d:'tmp',extPicks:EXT_PICKS,multi:true},{k:'path',l:'Folder to search',ph:'C:\\Temp',d:'C:\\Temp',drivePicks:WIN_DRIVE_PICKS_SAFE},SCOPE_PARAM],
      // del takes multiple specs same as dir; for /r's (set) can hold multiple space-separated masks too.
      build:v=>{ const exts = extArr(v.ext);
        return v.scope==='top'
          ? `del ${exts.map(e=>`"${winPath(v.path)}\\*.${e}"`).join(' ')}`
          : `for /r "${v.path}" %f in (${exts.map(e=>`*.${e}`).join(' ')}) do @del "%f"`; } },
    powershell:{ params:[{k:'ext',l:'Extension(s) (no dot)',ph:'tmp',d:'tmp',extPicks:EXT_PICKS,multi:true},{k:'path',l:'Folder to search',ph:'C:\\Temp',d:'C:\\Temp',drivePicks:WIN_DRIVE_PICKS_SAFE},SCOPE_PARAM],
      build:v=>{ const exts = extArr(v.ext); const single = exts.length<=1;
        if(v.scope==='top')
          return single
            ? `Remove-Item -Path "${winPath(v.path)}\\*.${exts[0]||''}" -Force`
            : `Remove-Item -Path ${exts.map(e=>`"${winPath(v.path)}\\*.${e}"`).join(',')} -Force`;
        return single
          ? `Get-ChildItem -Path "${v.path}" -Filter *.${exts[0]||''} -Recurse | Remove-Item`
          : `Get-ChildItem -Path "${v.path}" -Include ${exts.map(e=>`*.${e}`).join(',')} -Recurse | Remove-Item`; } },
    unix:{ params:[{k:'ext',l:'Extension(s) (no dot)',ph:'tmp',d:'tmp',extPicks:EXT_PICKS,multi:true},{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS_SAFE},SCOPE_PARAM],
      build:v=>{ const exts = extArr(v.ext);
        return v.scope==='top'
          ? `find ${v.path} -maxdepth 1 ${findNameExpr(exts,'-name')} -delete`
          : `find ${v.path} ${findNameExpr(exts,'-name')} -delete`; } },
  }},
  { id:'delete-empty-folders', label:'Delete all empty subfolders', cat:'Files', shells:{
    // Deleting empty folders is inherently a whole-tree operation (not "top only" vs
    // "+ subfolders" like the other Files tasks), so no SCOPE_PARAM here — just a path.
    // Uses the SAFE drive picks (no one-click whole-system delete) same as delete-ext.
    //
    // The hard part isn't finding empty folders, it's nested ones: if B is empty and its
    // parent A contains only B, deleting B should make A empty too, and a naive single pass
    // over a snapshot of "currently empty" folders misses that cascade.
    cmd:{ params:[{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS_SAFE}],
      // rd (no /s) only removes a directory if it's actually empty and silently errors otherwise,
      // so 2>nul just hides those expected failures. The cascade is handled by `sort /r`: any
      // child path is always longer than (and sorts after) its parent, so a reverse sort visits
      // every folder deepest-first, meaning a parent's children are always rd'd before the parent
      // itself is reached in the same pass.
      build:v=>`for /f "delims=" %d in ('dir "${winPath(v.path)}" /ad /b /s ^| sort /r') do @rd "%d" 2>nul` },
    powershell:{ params:[{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS_SAFE}],
      // Get-ChildItem's tree snapshot doesn't update as items are removed, so one pass can leave
      // freshly-emptied parents behind. A do/while re-scans and re-removes until a pass finds
      // nothing left to delete. -Force on both calls counts/removes hidden folders too, so a
      // folder isn't skipped just because everything inside it happens to be hidden.
      build:v=>`do {\n  $empty = Get-ChildItem -Path "${v.path}" -Recurse -Directory -Force | Where-Object { (Get-ChildItem -Path $_.FullName -Force | Measure-Object).Count -eq 0 }\n  $empty | Remove-Item -Force\n} while ($empty.Count -gt 0)` },
    unix:{ params:[{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS_SAFE}],
      // find's -delete forces depth-first traversal (visits a folder's contents before the
      // folder itself), so by the time it reaches a parent, any now-empty child from earlier in
      // the same walk is already gone — the cascade is handled in a single pass, no re-scan needed.
      build:v=>`find "${v.path}" -type d -empty -delete` },
  }},
  { id:'search-text', label:'Search for text inside files', cat:'Search', shells:{
    cmd:{ params:[{k:'text',l:'Text to search for',ph:'TODO',d:'TODO'},{k:'ext',l:'File type(s) (optional, no dot)',ph:'log',d:'',extPicks:EXT_PICKS_OPTIONAL,multi:true},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      // findstr, like dir/del, accepts several filename specs in one call, so N extensions
      // just becomes N patterns on the command line instead of one *.* wildcard.
      build:v=> { const exts = extArr(v.ext); const pats = exts.length ? exts.map(e=>`*.${e}`) : ['*.*'];
        return v.path===ALL_DRIVES
          ? `for %d in (C D E F G H) do @if exist %d:\\ findstr /S /I /C:"${v.text}" ${pats.map(p=>`"%d:\\${p}"`).join(' ')} 2>nul`
          : (v.scope==='top'
            ? `findstr /I /C:"${v.text}" ${pats.map(p=>`"${winPath(v.path)}\\${p}"`).join(' ')}`
            : `pushd "${v.path}" && findstr /S /I /C:"${v.text}" ${pats.join(' ')} & popd`); } },
    powershell:{ params:[{k:'text',l:'Text to search for',ph:'TODO',d:'TODO'},{k:'ext',l:'File type(s) (optional, no dot)',ph:'log',d:'',extPicks:EXT_PICKS_OPTIONAL,multi:true},{k:'path',l:'Folder to search',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS},SCOPE_PARAM],
      // Same -Filter/-Include split as find-ext: one extension keeps -Filter, 2+ switch to
      // -Include (comma-separated), which for the non-recursive "top" scope needs Path\* too.
      build:v=> { const exts = extArr(v.ext); const single = exts.length<=1;
        const filt = exts.length===0 ? '' : (single ? ` -Filter *.${exts[0]}` : ` -Include ${exts.map(e=>`*.${e}`).join(',')}`);
        if(v.path===ALL_DRIVES)
          return `Get-PSDrive -PSProvider FileSystem | ForEach-Object { Get-ChildItem -Path $_.Root -Recurse -File${filt} -ErrorAction SilentlyContinue | Select-String -Pattern "${v.text}" }`;
        if(v.scope==='top'){
          if(exts.length>1) return `Get-ChildItem -Path "${winPath(v.path)}\\*" -File${filt} | Select-String -Pattern "${v.text}"`;
          return `Get-ChildItem -Path "${v.path}" -File${filt} | Select-String -Pattern "${v.text}"`;
        }
        return `Get-ChildItem -Path "${v.path}" -Recurse -File${filt} | Select-String -Pattern "${v.text}"`; } },
    unix:{ params:[{k:'text',l:'Text to search for',ph:'TODO',d:'TODO'},{k:'ext',l:'File type(s) (optional, no dot)',ph:'log',d:'',extPicks:EXT_PICKS_OPTIONAL,multi:true},{k:'path',l:'Folder to search',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS},SCOPE_PARAM],
      // grep --include can be repeated once per extension; the non-recursive find+exec path
      // uses the same -o'd iname group as find-ext.
      build:v=> { const exts = extArr(v.ext);
        const inc = exts.map(e=>` --include="*.${e}"`).join('');
        const nameFilt = exts.length ? ` ${findNameExpr(exts,'-iname')}` : '';
        return v.path==='/'
          ? `grep -rin${inc} "${v.text}" / 2>/dev/null`
          : (v.scope==='top'
            ? `find ${v.path} -maxdepth 1 -type f${nameFilt} -exec grep -in "${v.text}" {} +`
            : `grep -rin${inc} "${v.text}" ${v.path}`); } },
  }},
  { id:'kill-process', label:'Kill a process by name', cat:'Processes', shells:{
    cmd:{ params:[{k:'name',l:'Process / image name',ph:'chrome.exe',d:'chrome.exe'}],
      build:v=>`taskkill /IM ${v.name} /F` },
    powershell:{ params:[{k:'name',l:'Process name (no .exe)',ph:'chrome',d:'chrome'}],
      build:v=>`Stop-Process -Name "${v.name}" -Force` },
    unix:{ params:[{k:'name',l:'Process name',ph:'node',d:'node'}],
      build:v=>`pkill -9 ${v.name}` },
  }},
  { id:'port-owner', label:'Find what\u2019s using a port', cat:'Network', shells:{
    cmd:{ params:[{k:'port',l:'Port number',ph:'3000',d:'3000'}],
      build:v=>`netstat -ano | findstr :${v.port}` },
    powershell:{ params:[{k:'port',l:'Port number',ph:'3000',d:'3000'}],
      build:v=>`Get-NetTCPConnection -LocalPort ${v.port} | Select-Object LocalPort,OwningProcess` },
    unix:{ params:[{k:'port',l:'Port number',ph:'3000',d:'3000'}],
      build:v=>`lsof -i :${v.port}` },
  }},
  { id:'download', label:'Download a file from a URL', cat:'Network', shells:{
    cmd:{ params:[{k:'url',l:'URL',ph:'https://example.com/file.zip',d:'https://example.com/file.zip'}],
      build:v=>`curl -O ${v.url}` },
    powershell:{ params:[{k:'url',l:'URL',ph:'https://example.com/file.zip',d:'https://example.com/file.zip'},{k:'out',l:'Save as',ph:'file.zip',d:'file.zip'}],
      build:v=>`Invoke-WebRequest -Uri "${v.url}" -OutFile "${v.out}"` },
    unix:{ params:[{k:'url',l:'URL',ph:'https://example.com/file.zip',d:'https://example.com/file.zip'}],
      build:v=>`curl -O ${v.url}` },
  }},
  { id:'disk-usage', label:'Check a folder\u2019s total size', cat:'System', shells:{
    powershell:{ params:[{k:'path',l:'Folder',ph:'C:\\Projects',d:'C:\\Projects',drivePicks:WIN_DRIVE_PICKS}],
      build:v=> v.path===ALL_DRIVES
        ? `Get-PSDrive -PSProvider FileSystem | ForEach-Object { Get-ChildItem -Path $_.Root -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum }`
        : `Get-ChildItem -Path "${v.path}" -Recurse -File | Measure-Object -Property Length -Sum` },
    unix:{ params:[{k:'path',l:'Folder',ph:'.',d:'.',drivePicks:UNIX_DRIVE_PICKS}],
      build:v=>`du -sh ${v.path}` },
  }},
  { id:'compress', label:'Compress a folder into an archive', cat:'System', shells:{
    powershell:{ params:[{k:'path',l:'Folder to compress',ph:'C:\\Projects\\logs',d:'C:\\Projects\\logs'},{k:'out',l:'Output .zip name',ph:'logs.zip',d:'logs.zip'}],
      build:v=>`Compress-Archive -Path "${v.path}" -DestinationPath "${v.out}"` },
    unix:{ params:[{k:'path',l:'Folder to compress',ph:'./project',d:'./project'},{k:'out',l:'Output name (no extension)',ph:'backup',d:'backup'}],
      build:v=>`tar -czvf ${v.out}.tar.gz ${v.path}` },
  }},
  { id:'find-package', label:'Find a package\u2019s exact name (to uninstall it)', cat:'Apps', shells:{
    cmd:{ params:[{k:'app',l:'App name (partial, e.g. chrome)',ph:'chrome',d:'chrome'}],
      build:v=>`winget list "${v.app}"\nchoco list --local-only "${v.app}"` },
    powershell:{ params:[{k:'app',l:'App name (partial, e.g. chrome)',ph:'chrome',d:'chrome'}],
      build:v=>`winget list "${v.app}"\nGet-Package -Name "*${v.app}*"` },
    unix:{ params:[{k:'app',l:'App name (partial, e.g. firefox)',ph:'firefox',d:'firefox'}],
      build:v=>`apt list --installed 2>/dev/null | grep -i "${v.app}"` },
  }},
  { id:'uninstall-package', label:'Uninstall a package by name', cat:'Apps', shells:{
    cmd:{ params:[{k:'app',l:'winget App ID (from the search above)',ph:'Google.Chrome',d:'Google.Chrome'}],
      build:v=>`winget uninstall --id "${v.app}" -e` },
    powershell:{ params:[{k:'app',l:'winget App ID (from the search above)',ph:'Google.Chrome',d:'Google.Chrome'}],
      build:v=>`winget uninstall --id "${v.app}" -e` },
    unix:{ params:[{k:'app',l:'Package name (from the search above)',ph:'firefox',d:'firefox'}],
      build:v=>`sudo apt remove "${v.app}"` },
  }},
];

const GEN_SHELL_LABELS = { cmd:'Command Prompt', powershell:'PowerShell', unix:'WSL / Unix' };
const GEN_SHELL_COLORS = { cmd:'var(--cmd)', powershell:'var(--ps)', unix:'var(--unix)' };

// ---------- generator: browse & build from every reference command ----------
// Beyond the curated multi-shell recipes above, the generator can build from
// literally any of the 290+ reference commands. Most are already a single
// ready-to-copy command with nothing to fill in; a smaller set use <Token>
// placeholders in their `cmd` field (e.g. `wsl --install -d <Distro>`) — for
// those, this mode renders one text input per unique token and substitutes it
// live into the output, the same way the curated recipes do.
let genMode = 'recipes'; // 'recipes' | 'browse' | 'combine'
let genBrowseQuery = '';
let genBrowseId = null; // matches a DATA[]._id
let genBrowseValues = {}; // token -> value, for the currently selected item

function extractTokens(cmdStr){
  const seen = new Set(); const out = [];
  for(const m of cmdStr.matchAll(/<([^<>]+)>/g)){
    if(!seen.has(m[1])){ seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

function currentBrowseItem(){
  return genBrowseId===null ? null : (DATA.find(i=>i._id===genBrowseId) || null);
}

function currentBrowseOutput(){
  const item = currentBrowseItem();
  if(!item) return '';
  const tokens = extractTokens(item.cmd);
  if(!tokens.length) return item.ex || item.cmd;
  let out = item.cmd;
  tokens.forEach(tok=>{
    const val = (genBrowseValues[tok] || '').trim();
    if(val) out = out.split(`<${tok}>`).join(val);
  });
  return out;
}

function genBrowseMatches(item){
  if(!genBrowseQuery) return true;
  const hay = `${item.cmd} ${item.desc} ${item.kw||''} ${item.ex}`.toLowerCase();
  return hay.includes(genBrowseQuery);
}

function onGenModeClick(mode){
  genMode = mode;
  if(mode==='browse' && genBrowseId===null && DATA.length) genBrowseId = DATA[0]._id;
  renderGenerator();
}

function onGenBrowseSearch(e){
  genBrowseQuery = e.target.value.trim().toLowerCase();
  renderGenerator();
}

function onGenBrowseSelect(id){
  genBrowseId = id;
  genBrowseValues = {};
  renderGenerator();
}

function onGenBrowseInput(inputEl){
  const tok = inputEl.getAttribute('data-tok');
  genBrowseValues[tok] = inputEl.value;
  const el = document.getElementById('genBrowseOutput');
  if(el) el.textContent = currentBrowseOutput();
}

function copyGenBrowseOutput(btn){
  const text = currentBrowseOutput();
  copyToClipboard(text).then(()=>{
    showCopyFeedback(btn, true);
    pushGenBrowseHistory();
  }).catch(()=>showCopyFeedback(btn, false));
}

// ---------- generator history (persisted across visits) ----------
const GEN_HISTORY_KEY = 'shellref-gen-history';
const GEN_HISTORY_MAX = 50;
let genHistory = [];
try{ genHistory = JSON.parse(localStorage.getItem(GEN_HISTORY_KEY)) || []; }catch(e){ genHistory = []; }

function saveGenHistory(){
  try{ localStorage.setItem(GEN_HISTORY_KEY, JSON.stringify(genHistory)); }catch(e){}
}

function pushGenHistoryEntry(entry){
  const top = genHistory[0];
  const sameAsTop = top && top.command===entry.command && top.source===entry.source &&
    (entry.source==='browse' ? top.itemId===entry.itemId : (top.taskId===entry.taskId && top.shell===entry.shell));
  if(sameAsTop){
    top.ts = Date.now();
    saveGenHistory();
    updateGenHistoryUI();
    return;
  }
  genHistory.unshift({ id: Date.now()+'-'+Math.random().toString(36).slice(2,7), ts: Date.now(), ...entry });
  if(genHistory.length > GEN_HISTORY_MAX) genHistory.length = GEN_HISTORY_MAX;
  saveGenHistory();
  updateGenHistoryUI();
}

function pushGenHistory(){
  const task = GENERATORS.find(t=>t.id===genState.taskId);
  const command = currentGenOutput();
  if(!task || !command) return;
  pushGenHistoryEntry({ source:'recipe', taskId: genState.taskId, label: task.label, shell: genState.shell, values: {...genState.values}, command });
}

function pushGenBrowseHistory(){
  const item = currentBrowseItem();
  const command = currentBrowseOutput();
  if(!item || !command) return;
  pushGenHistoryEntry({ source:'browse', itemId: item._id, label: item.cmd, shell: item.sh || null, values: {...genBrowseValues}, command });
}

function onHistoryUse(id){
  const entry = genHistory.find(h=>h.id===id);
  if(!entry) return;
  if(entry.source === 'browse'){
    const item = DATA.find(i=>i._id===entry.itemId);
    if(!item) return;
    genMode = 'browse';
    genBrowseId = entry.itemId;
    genBrowseValues = {...entry.values};
    genBrowseQuery = '';
  } else {
    const task = GENERATORS.find(t=>t.id===entry.taskId);
    if(!task || !task.shells[entry.shell]) return;
    genMode = 'recipes';
    genState = { taskId: entry.taskId, shell: entry.shell, values: {...entry.values} };
  }
  renderGenerator();
}

function onHistoryCopy(id, btn){
  const entry = genHistory.find(h=>h.id===id);
  if(!entry) return;
  copyToClipboard(entry.command).then(()=>showCopyFeedback(btn, true)).catch(()=>showCopyFeedback(btn, false));
}

function onHistoryRemove(id){
  genHistory = genHistory.filter(h=>h.id!==id);
  saveGenHistory();
  updateGenHistoryUI();
}

function onHistoryClear(){
  if(genHistory.length && !confirm('Clear all saved commands?')) return;
  genHistory = [];
  saveGenHistory();
  updateGenHistoryUI();
}

function formatRelTime(ts){
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff/60000);
  if(min < 1) return 'just now';
  if(min < 60) return `${min}m ago`;
  const hr = Math.floor(min/60);
  if(hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr/24);
  if(day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {month:'short', day:'numeric'});
}

let genHistorySelected = new Set();

function renderGenHistoryHtml(){
  if(!genHistory.length){
    return `<div class="gen-history-empty">No saved commands yet — hit <strong>copy</strong> on a generated command to keep it here.</div>`;
  }
  return genHistory.map(h=>`
    <div class="gen-history-item">
      <input type="checkbox" class="gen-history-select" ${genHistorySelected.has(h.id)?'checked':''} onchange="onHistoryToggleSelect('${h.id}', this.checked)" title="Select for combined script">
      <div class="gen-history-main">
        <div class="gen-history-top">
          <span class="gen-history-label">${escapeHtml(h.label)}</span>
          ${h.shell ? `<span class="gen-history-shell" style="--tab-accent:${GEN_SHELL_COLORS[h.shell]}">${GEN_SHELL_LABELS[h.shell]}</span>` : ''}
          <span class="gen-history-time">${formatRelTime(h.ts)}</span>
        </div>
        <div class="gen-history-cmd">${escapeHtml(h.command)}</div>
      </div>
      <div class="gen-history-actions">
        <button type="button" class="copy-btn" onclick="onHistoryCopy('${h.id}', this)">copy</button>
        <button type="button" class="copy-btn" onclick="onHistoryUse('${h.id}')">use</button>
        <button type="button" class="copy-btn" onclick="downloadHistoryEntry('${h.id}')" title="Download this one command as a script">⬇</button>
        <button type="button" class="copy-btn" onclick="onHistoryRemove('${h.id}')" title="Remove">✕</button>
      </div>
    </div>`).join('');
}

function updateGenHistoryUI(){
  // drop selections for entries that no longer exist (removed/cleared)
  const liveIds = new Set(genHistory.map(h=>h.id));
  genHistorySelected.forEach(id=>{ if(!liveIds.has(id)) genHistorySelected.delete(id); });
  const listEl = document.getElementById('genHistoryList');
  if(listEl) listEl.innerHTML = renderGenHistoryHtml();
  const countEl = document.getElementById('genHistoryCount');
  if(countEl) countEl.textContent = genHistory.length ? `${genHistory.length} saved` : '';
  updateGenHistoryComboUI();
}

function onHistoryToggleSelect(id, checked){
  if(checked) genHistorySelected.add(id); else genHistorySelected.delete(id);
  updateGenHistoryComboUI();
}

function updateGenHistoryComboUI(){
  const btn = document.getElementById('genHistoryComboBtn');
  const countEl = document.getElementById('genHistoryComboCount');
  const n = genHistorySelected.size;
  if(btn) btn.disabled = n < 2;
  if(countEl) countEl.textContent = n ? `${n} selected` : '';
}

let genState = { taskId: null, shell: null, values: {} };

function initGenState(taskId, preferredShell){
  const task = GENERATORS.find(t=>t.id===taskId);
  const shellKeys = Object.keys(task.shells);
  const shell = (preferredShell && shellKeys.includes(preferredShell)) ? preferredShell : shellKeys[0];
  const params = task.shells[shell].params;
  // Only carry forward previously-entered values when staying on the same
  // recipe (e.g. switching shell tabs) — a genuine task switch still resets.
  const prevValues = (genState.taskId === taskId) ? genState.values : {};
  const values = {};
  params.forEach(p=>{
    values[p.k] = (prevValues[p.k] !== undefined) ? prevValues[p.k] : (p.d || '');
  });
  genState = { taskId, shell, values };
}

function currentGenOutput(){
  const task = GENERATORS.find(t=>t.id===genState.taskId);
  const conf = task.shells[genState.shell];
  try{ return conf.build(genState.values); }catch(e){ return ''; }
}

function updateGenOutput(){
  const el = document.getElementById('genOutput');
  if(el) el.textContent = currentGenOutput();
}

// ===================== FAQ FOR BEGINNERS =====================
// FAQ_DATA content itself now lives in js/data.js alongside DATA.
function renderFaq(){
  const main = document.getElementById('main');
  const cats = [...new Set(FAQ_DATA.map(f=>f.cat))];
  let html = `<div class="section" id="sec-faq">
    <div class="section-head">
      <h2>FAQ for beginners</h2>
      <span class="tag" style="color:var(--faq)">${FAQ_DATA.length}</span>
    </div>
    <p class="section-sub">New to the command line? Start here — plain-language answers to the questions everyone has before they know to ask them.</p>`;

  cats.forEach(cat=>{
    html += `<div class="tier-label">${escapeHtml(cat)}</div><div class="faq-list">`;
    FAQ_DATA.filter(f=>f.cat===cat).forEach(f=>{
      html += `<details class="faq-item">
        <summary>${escapeHtml(f.q)}</summary>
        <p>${escapeHtml(f.a)}</p>
      </details>`;
    });
    html += `</div>`;
  });

  html += `</div>`;
  main.innerHTML = html;
}

function renderGenerator(){
  if(!genState.taskId) initGenState(GENERATORS[0].id);
  if(genMode==='browse' && genBrowseId===null && DATA.length) genBrowseId = DATA[0]._id;
  const main = document.getElementById('main');

  const modeToggleHtml = `<div class="gen-mode-toggle">
    <button type="button" class="gen-mode-btn${genMode==='recipes'?' active':''}" onclick="onGenModeClick('recipes')">Quick recipes</button>
    <button type="button" class="gen-mode-btn${genMode==='browse'?' active':''}" onclick="onGenModeClick('browse')">Browse all commands <span class="gen-mode-count">${DATA.length}</span></button>
    <button type="button" class="gen-mode-btn${genMode==='combine'?' active':''}" onclick="onGenModeClick('combine')">Merge commands${combineOrder.length ? ` <span class="gen-mode-count">${combineOrder.length}</span>` : ''}</button>
  </div>`;

  let layoutHtml;
  if(genMode === 'recipes'){
    const cats = [...new Set(GENERATORS.map(g=>g.cat))];
    let taskListHtml = '';
    cats.forEach(cat=>{
      taskListHtml += `<div class="gen-cat-label">${escapeHtml(cat)}</div>`;
      GENERATORS.filter(g=>g.cat===cat).forEach(g=>{
        const active = g.id === genState.taskId ? ' active' : '';
        taskListHtml += `<button type="button" class="gen-task-btn${active}" onclick="onGenTaskClick('${g.id}')">${escapeHtml(g.label)}</button>`;
      });
    });

    const task = GENERATORS.find(t=>t.id===genState.taskId);
    const shellKeys = Object.keys(task.shells);
    let tabsHtml = '';
    shellKeys.forEach(sk=>{
      const active = sk === genState.shell ? ' active' : '';
      tabsHtml += `<button type="button" class="gen-shell-tab${active}" style="--tab-accent:${GEN_SHELL_COLORS[sk]}" onclick="onGenShellClick('${sk}')">${GEN_SHELL_LABELS[sk]}</button>`;
    });

    const conf = task.shells[genState.shell];
    let fieldsHtml = '';
    conf.params.forEach(p=>{
      const val = genState.values[p.k] !== undefined ? genState.values[p.k] : '';
      if(p.type === 'select'){
        const optsHtml = p.options.map(o=>`<option value="${escapeHtml(o.v)}"${o.v===val?' selected':''}>${escapeHtml(o.l)}</option>`).join('');
        fieldsHtml += `<label class="gen-field">
          <span class="gen-field-label">${escapeHtml(p.l)}</span>
          <select class="gen-field-input gen-field-select" data-key="${escapeHtml(p.k)}" onchange="onGenInput(this)">${optsHtml}</select>
        </label>`;
      } else {
        const picks = p.drivePicks || p.extPicks;
        // Drive picks stay single-select (clicking one replaces the value). Ext picks are
        // multi-select: the value is a comma-separated list and each chip toggles its own
        // extension in/out, so e.g. "log" + "txt" can both be active at once.
        const selected = p.multi ? new Set(extArr(val)) : null;
        const picksHtml = picks ? `<div class="gen-drive-picks">${
          picks.map(dp=>{
            const isActive = p.multi ? (dp.all ? val==='' : selected.has(dp.v)) : dp.v===val;
            const handler = p.multi ? `onGenExtToggle('${jsAttr(p.k)}','${jsAttr(dp.v)}',${!!dp.all})` : `onGenQuickPick('${jsAttr(p.k)}','${jsAttr(dp.v)}')`;
            return `<button type="button" class="gen-drive-chip${isActive?' active':''}${dp.all?' all-drives':''}" onclick="${handler}">${escapeHtml(dp.l)}</button>`;
          }).join('')
        }</div>` : '';
        const displayVal = val === ALL_DRIVES ? 'All drives (entire system)' : val;
        fieldsHtml += `<label class="gen-field">
          <span class="gen-field-label">${escapeHtml(p.l)}</span>
          <input type="text" class="gen-field-input" data-key="${escapeHtml(p.k)}" placeholder="${escapeHtml(p.ph||'')}" value="${escapeHtml(displayVal)}" oninput="onGenInput(this)" autocomplete="off" spellcheck="false">
          ${picksHtml}
        </label>`;
      }
    });

    layoutHtml = `<div class="gen-layout">
      <div class="gen-tasks">${taskListHtml}</div>
      <div class="gen-build" style="--card-accent:${GEN_SHELL_COLORS[genState.shell]}">
        <div class="gen-shell-tabs">${tabsHtml}</div>
        <div class="gen-fields">${fieldsHtml}</div>
        <div class="gen-output-wrap">
          <div class="gen-output-top">
            <span class="gen-output-label">Generated command</span>
            <span class="gen-output-btns">
              <button type="button" class="copy-btn" onclick="copyGenOutput(this)">copy</button>
              <button type="button" class="copy-btn" onclick="addGenRecipeToMerge(this)" title="Add this command to the Merge commands list">+ merge</button>
              <button type="button" class="copy-btn" onclick="downloadGenOutput(this)" title="Download as a runnable script">⬇ script</button>
            </span>
          </div>
          <div class="example gen-output" id="genOutput">${escapeHtml(currentGenOutput())}</div>
        </div>
      </div>
    </div>`;
  } else if(genMode === 'browse'){
    const filtered = DATA.filter(genBrowseMatches);
    let browseListHtml = '';
    Object.keys(SECTION_META).forEach(secKey=>{
      const secItems = filtered.filter(i=>i.s===secKey);
      if(!secItems.length) return;
      browseListHtml += `<div class="gen-cat-label">${escapeHtml(SECTION_META[secKey].label)}</div>`;
      secItems.forEach(item=>{
        const active = item._id === genBrowseId ? ' active' : '';
        const dot = item.sh ? `<span class="gen-task-shell-dot" style="background:${SHELL_COLORS[item.sh]}"></span>` : '';
        browseListHtml += `<button type="button" class="gen-task-btn${active}" onclick="onGenBrowseSelect(${item._id})">${dot}${escapeHtml(item.cmd)}</button>`;
      });
    });
    if(!filtered.length) browseListHtml = `<div class="gen-browse-empty">No commands match "${escapeHtml(genBrowseQuery)}".</div>`;

    const selectedItem = currentBrowseItem();
    let buildHtml;
    if(!selectedItem){
      buildHtml = `<div class="gen-browse-placeholder">Pick a command from the list to build it.</div>`;
    } else {
      const tokens = extractTokens(selectedItem.cmd);
      let tokenFieldsHtml = '';
      tokens.forEach(tok=>{
        const val = genBrowseValues[tok] || '';
        tokenFieldsHtml += `<label class="gen-field">
          <span class="gen-field-label">${escapeHtml(tok)}</span>
          <input type="text" class="gen-field-input" data-tok="${escapeHtml(tok)}" placeholder="${escapeHtml(tok)}" value="${escapeHtml(val)}" oninput="onGenBrowseInput(this)" autocomplete="off" spellcheck="false">
        </label>`;
      });
      const badge = selectedItem.sh
        ? `<span class="shell-tag" style="--shell-color:${SHELL_COLORS[selectedItem.sh]}">${SHELL_LABELS[selectedItem.sh]}</span>`
        : `<span class="shell-tag" style="--shell-color:${SECTION_META[selectedItem.s].color}">${SECTION_META[selectedItem.s].label}</span>`;
      buildHtml = `
        <div class="gen-browse-selected">
          <div class="gen-browse-top">
            <span class="gen-browse-cmd">${escapeHtml(selectedItem.cmd)}</span>
            ${badge}
          </div>
          <p class="desc">${escapeHtml(selectedItem.desc)}</p>
          ${selectedItem.use ? `<p class="usecase"><b>Use case:</b> ${escapeHtml(selectedItem.use)}</p>` : ''}
        </div>
        ${tokens.length ? `<div class="gen-fields">${tokenFieldsHtml}</div>` : `<div class="gen-browse-noparams">No parameters to fill in — this command is ready as-is.</div>`}
        <div class="gen-output-wrap">
          <div class="gen-output-top">
            <span class="gen-output-label">Generated command</span>
            <span class="gen-output-btns">
              <button type="button" class="copy-btn" onclick="copyGenBrowseOutput(this)">copy</button>
              <button type="button" class="copy-btn" onclick="addGenBrowseToMerge(this)" title="Add this command to the Merge commands list">+ merge</button>
              <button type="button" class="copy-btn" onclick="downloadGenBrowseOutput(this)" title="Download as a runnable script">⬇ script</button>
            </span>
          </div>
          <div class="example gen-output" id="genBrowseOutput">${escapeHtml(currentBrowseOutput())}</div>
        </div>`;
    }

    const accent = selectedItem ? (selectedItem.sh ? SHELL_COLORS[selectedItem.sh] : SECTION_META[selectedItem.s].color) : 'var(--border)';
    layoutHtml = `<div class="gen-layout">
      <div class="gen-tasks gen-tasks-browse">
        <input type="text" class="gen-browse-search" placeholder="Search all ${DATA.length} commands…" value="${escapeHtml(genBrowseQuery)}" oninput="onGenBrowseSearch(event)" autocomplete="off" spellcheck="false">
        <div class="gen-browse-list">${browseListHtml}</div>
      </div>
      <div class="gen-build" style="--card-accent:${accent}">${buildHtml}</div>
    </div>`;
  } else {
    layoutHtml = combineLayoutHtml();
  }

  const subtitles = {
    recipes: "Pick what you're trying to do, choose a shell, fill in the blanks — copy the exact command.",
    browse: "Every command in the reference, in one searchable list. Fill in any blanks and copy.",
    combine: "Hand-pick any commands from the full reference, put them in the order you want them to run, and merge them into one script — or copy them all at once.",
  };

  const historyPanelHtml = genMode === 'combine' ? '' : `<div class="gen-history-panel">
      <div class="gen-history-header">
        <span class="gen-history-title">Recent commands<span class="gen-history-count" id="genHistoryCount">${genHistory.length ? genHistory.length+' saved' : ''}</span></span>
        <span class="gen-history-combo">
          <span class="gen-history-combo-count" id="genHistoryComboCount"></span>
          <button type="button" class="copy-btn" id="genHistoryComboBtn" onclick="onHistoryDownloadCombined()" disabled>⬇ combine into script</button>
          <button type="button" class="copy-btn" onclick="onHistoryClear()">clear</button>
        </span>
      </div>
      <div class="gen-history-list" id="genHistoryList">${renderGenHistoryHtml()}</div>
    </div>`;

  main.innerHTML = `<div class="gen-wrap">
    <div class="gen-intro">
      <h2>Command generator</h2>
      <p class="section-sub">${subtitles[genMode]}</p>
    </div>
    ${modeToggleHtml}
    ${layoutHtml}
    ${historyPanelHtml}
  </div>`;
}

function onGenTaskClick(taskId){
  initGenState(taskId, genState.shell);
  renderGenerator();
}

function onGenShellClick(shellKey){
  initGenState(genState.taskId, shellKey);
  renderGenerator();
}

function onGenInput(inputEl){
  const key = inputEl.getAttribute('data-key');
  genState.values[key] = inputEl.value;
  updateGenOutput();
}

function onGenQuickPick(key, value){
  genState.values[key] = value;
  renderGenerator();
}

function onGenExtToggle(key, value, isAll){
  if(isAll){ genState.values[key] = ''; renderGenerator(); return; }
  const current = extArr(genState.values[key]);
  const idx = current.indexOf(value);
  if(idx === -1) current.push(value); else current.splice(idx, 1);
  genState.values[key] = current.join(',');
  renderGenerator();
}

function copyGenOutput(btn){
  const text = currentGenOutput();
  copyToClipboard(text).then(()=>{
    showCopyFeedback(btn, true);
    pushGenHistory();
  }).catch(()=>showCopyFeedback(btn, false));
}

// ---------- combine/merge: the Command generator's "Merge commands" mode.
// Two ways to populate this list: (1) hand-pick any reference command from the
// checkbox picker below ("ref" entries — token-editable, resolved live), or
// (2) hit "+ merge" on whatever the Quick recipes / Browse tabs just built
// ("custom" entries — already fully resolved by that tab's own fields, so no
// further token editing here). Both kinds share one ordered list so you can
// freely mix hand-picked reference commands with generated ones and reorder
// the lot before copying/downloading as a single script. ----------
let combineQuery = '';
let combineOrder = []; // ordered array of keys: 'ref:<DATA._id>' or 'custom:<uid>' — order = run order
let combineTokenValues = {}; // DATA._id -> {token: value}, ref entries only
let combineCustomEntries = {}; // uid -> {uid, label, shell, command}, custom entries only
let combineCustomSeq = 0;

function refKey(id){ return 'ref:'+id; }
function customKey(uid){ return 'custom:'+uid; }

function matchesCombine(item){
  if(!combineQuery) return true;
  const q = combineQuery.toLowerCase();
  return item.cmd.toLowerCase().includes(q)
    || item.desc.toLowerCase().includes(q)
    || item.ex.toLowerCase().includes(q)
    || item.t.toLowerCase().includes(q)
    || (item.use && item.use.toLowerCase().includes(q))
    || (item.kw && item.kw.toLowerCase().includes(q));
}

function combineResolvedCommand(item){
  const tokens = extractTokens(item.cmd);
  if(!tokens.length) return item.ex || item.cmd;
  let out = item.cmd;
  const vals = combineTokenValues[item._id] || {};
  tokens.forEach(tok=>{
    const val = (vals[tok] || '').trim();
    if(val) out = out.split(`<${tok}>`).join(val);
  });
  return out;
}

// Resolves a combineOrder key into a common shape for both entry kinds.
function combineEntryForKey(key){
  if(key.indexOf('ref:') === 0){
    const id = Number(key.slice(4));
    const item = DATA.find(i=>i._id===id);
    if(!item) return null;
    return { key, type:'ref', id, item, label:item.cmd, shell:item.sh||'cmd', command: combineResolvedCommand(item) };
  }
  const uid = key.slice(7);
  const c = combineCustomEntries[uid];
  if(!c) return null;
  return { key, type:'custom', uid, label:c.label, shell:c.shell||'cmd', command:c.command };
}

// Adds a generated command (from Quick recipes or Browse) to the merge list
// as a pre-resolved "custom" entry — its fields were already filled in on
// that tab, so there's nothing further to edit here.
function addCombineCustomEntry(label, shell, command, btn){
  if(!command) return;
  const uid = ++combineCustomSeq;
  combineCustomEntries[uid] = { uid, label, shell: shell || 'cmd', command };
  combineOrder.push(customKey(uid));
  showAddFeedback(btn);
  setTimeout(renderGenerator, 650);
}

function addGenRecipeToMerge(btn){
  const task = GENERATORS.find(t=>t.id===genState.taskId);
  const command = currentGenOutput();
  if(!task || !command) return;
  addCombineCustomEntry(task.label, genState.shell, command, btn);
}

function addGenBrowseToMerge(btn){
  const item = currentBrowseItem();
  const command = currentBrowseOutput();
  if(!item || !command) return;
  addCombineCustomEntry(item.cmd, item.sh || 'cmd', command, btn);
}

function combineLayoutHtml(){
  const filtered = DATA.filter(matchesCombine);

  let listHtml = '';
  Object.keys(SECTION_META).forEach(secKey=>{
    const secItems = filtered.filter(i=>i.s===secKey);
    if(!secItems.length) return;
    listHtml += `<div class="gen-cat-label">${escapeHtml(SECTION_META[secKey].label)}</div>`;
    secItems.forEach(item=>{
      const checked = combineOrder.includes(refKey(item._id));
      const dot = item.sh ? `<span class="gen-task-shell-dot" style="background:${SHELL_COLORS[item.sh]}"></span>` : '';
      listHtml += `<label class="gen-task-btn combine-pick${checked?' active':''}">
        <input type="checkbox" class="combine-pick-check" ${checked?'checked':''} onchange="toggleCombineItem(${item._id})">
        ${dot}${escapeHtml(item.cmd)}
      </label>`;
    });
  });
  if(!filtered.length) listHtml = `<div class="gen-browse-empty">No commands match "${escapeHtml(combineQuery)}".</div>`;

  const combineItems = combineOrder.map(combineEntryForKey).filter(Boolean);

  let buildItemsHtml = '';
  if(!combineItems.length){
    buildItemsHtml = `<div class="gen-browse-placeholder">Check commands on the left, or hit "+ merge" on a generated command in Quick recipes / Browse, to add them here — in the order you want them to run.</div>`;
  } else {
    combineItems.forEach((entry, idx)=>{
      const badge = `<span class="shell-tag" style="--shell-color:${SHELL_COLORS[entry.shell] || 'var(--amber)'}">${SHELL_LABELS[entry.shell] || entry.shell}</span>`;
      let tokenRowHtml = '';
      if(entry.type === 'ref'){
        const tokens = extractTokens(entry.item.cmd);
        if(tokens.length){
          const tokenFieldsHtml = tokens.map(tok=>{
            const val = (combineTokenValues[entry.id] && combineTokenValues[entry.id][tok]) || '';
            return `<input type="text" class="gen-field-input combine-token-input" data-id="${entry.id}" data-tok="${escapeHtml(tok)}" placeholder="${escapeHtml(tok)}" value="${escapeHtml(val)}" oninput="onCombineTokenInput(this)" autocomplete="off" spellcheck="false">`;
          }).join('');
          tokenRowHtml = `<div class="combine-token-row">${tokenFieldsHtml}</div>`;
        }
      }
      const sourceTag = entry.type === 'custom' ? `<span class="combine-source-tag" title="Added from the generator">generated</span>` : '';
      buildItemsHtml += `<div class="combine-build-item">
        <div class="combine-build-order">
          <button type="button" class="combine-order-btn" ${idx===0?'disabled':''} onclick="moveCombineItem('${entry.key}',-1)" title="Move earlier">▲</button>
          <button type="button" class="combine-order-btn" ${idx===combineItems.length-1?'disabled':''} onclick="moveCombineItem('${entry.key}',1)" title="Move later">▼</button>
        </div>
        <div class="combine-build-main">
          <div class="combine-build-top">
            <span class="combine-build-cmd">${escapeHtml(entry.label)}</span>
            <span class="combine-build-tags">${badge}${sourceTag}</span>
          </div>
          ${tokenRowHtml}
          <div class="example combine-build-resolved">${escapeHtml(entry.command)}</div>
        </div>
        <button type="button" class="combine-remove-btn" onclick="removeCombineItem('${entry.key}')" title="Remove">✕</button>
      </div>`;
    });
  }

  const shellsPresent = [...new Set(combineItems.map(e=>e.shell || 'cmd'))];
  const downloadHint = combineItems.length
    ? `Downloads as ${shellsPresent.map(sk=>SHELL_LABELS[sk]||sk).join(' + ')} — one file per shell${shellsPresent.includes('powershell')?' (PowerShell gets a .ps1 + a .bat launcher)':''}.`
    : '';

  return `<div class="gen-layout">
      <div class="gen-tasks gen-tasks-browse">
        <input type="text" class="gen-browse-search" placeholder="Search all ${DATA.length} commands…" value="${escapeHtml(combineQuery)}" oninput="onCombineSearch(event)" autocomplete="off" spellcheck="false">
        <div class="gen-browse-list">${listHtml}</div>
      </div>
      <div class="gen-build combine-build" style="--card-accent:var(--amber)">
        <div class="combine-build-header">
          <span class="combine-build-title">${combineItems.length ? combineItems.length + ' command' + (combineItems.length!==1?'s':'') + ' selected' : 'Build list'}</span>
          ${combineItems.length ? `<button type="button" class="copy-btn" onclick="clearCombineList()">clear</button>` : ''}
        </div>
        <div class="combine-build-list">${buildItemsHtml}</div>
        ${combineItems.length ? `
        <div class="combine-build-footer">
          <span class="combine-download-hint">${downloadHint}</span>
          <span class="gen-output-btns">
            <button type="button" class="copy-btn" onclick="copyCombineList(this)">copy all</button>
            <button type="button" class="copy-btn" onclick="downloadCombineList()">⬇ download script(s)</button>
          </span>
        </div>` : ''}
      </div>
    </div>`;
}

function onCombineSearch(e){
  combineQuery = e.target.value;
  renderGenerator();
}

function toggleCombineItem(id){
  const key = refKey(id);
  const idx = combineOrder.indexOf(key);
  if(idx === -1) combineOrder.push(key); else combineOrder.splice(idx, 1);
  renderGenerator();
}

function removeCombineItem(key){
  combineOrder = combineOrder.filter(k=>k!==key);
  if(String(key).indexOf('custom:') === 0) delete combineCustomEntries[String(key).slice(7)];
  renderGenerator();
}

function moveCombineItem(key, dir){
  const idx = combineOrder.indexOf(key);
  if(idx === -1) return;
  const newIdx = idx + dir;
  if(newIdx < 0 || newIdx >= combineOrder.length) return;
  [combineOrder[idx], combineOrder[newIdx]] = [combineOrder[newIdx], combineOrder[idx]];
  renderGenerator();
}

function onCombineTokenInput(inputEl){
  const id = Number(inputEl.getAttribute('data-id'));
  const tok = inputEl.getAttribute('data-tok');
  if(!combineTokenValues[id]) combineTokenValues[id] = {};
  combineTokenValues[id][tok] = inputEl.value;
  const item = DATA.find(i=>i._id===id);
  const itemEl = inputEl.closest('.combine-build-item');
  const resolvedEl = itemEl ? itemEl.querySelector('.combine-build-resolved') : null;
  if(resolvedEl && item) resolvedEl.textContent = combineResolvedCommand(item);
}

function clearCombineList(){
  combineOrder = [];
  combineTokenValues = {};
  combineCustomEntries = {};
  renderGenerator();
}

function combineEntries(){
  return combineOrder.map(key=>{
    const e = combineEntryForKey(key);
    if(!e) return null;
    return { label: e.label, command: e.command, shell: e.shell || 'cmd' };
  }).filter(Boolean);
}

function copyCombineList(btn){
  const entries = combineEntries();
  if(!entries.length) return;
  const text = entries.map(e=>`# ${e.label}\n${e.command}`).join('\n\n');
  copyToClipboard(text).then(()=>showCopyFeedback(btn, true)).catch(()=>showCopyFeedback(btn, false));
}

function downloadCombineList(){
  const entries = combineEntries();
  if(!entries.length) return;
  const groups = {};
  entries.forEach(e=>{ (groups[e.shell] = groups[e.shell] || []).push({label:e.label, command:e.command}); });
  Object.keys(groups).forEach(shellKey=>{
    triggerScriptDownload(shellKey, 'shellref-combine-' + shellKey, groups[shellKey]);
  });
}

