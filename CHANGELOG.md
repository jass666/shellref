# Changelog - Command Reference (shellref)

All notable changes to the Command Reference static site, tracked in order.

## v6.1 - Fix: switching shell tabs in Quick recipes no longer clears fields you'd already filled in

* **Bug**: `initGenState()` unconditionally rebuilt `genState.values` from each field's default (`p.d || ''`) on every call. `onGenShellClick()` calls `initGenState(genState.taskId, shellKey)` to switch tabs within the *same* recipe, so any values already typed (e.g. a folder path, an extension list) were silently wiped the moment you tried CMD vs PowerShell vs Unix on the same task.
* **Fix**: `initGenState()` now only resets to defaults on a genuine task switch. When `taskId` matches the outgoing `genState.taskId` (i.e. this is a shell-tab switch, not a new recipe), it carries forward the previous `genState.values` and only falls back to a field's default when that key wasn't already set — so shared fields (folder, extension, etc.) survive the shell switch, and only fields unique to the newly-selected shell's param list get their defaults.
* Task switches (`onGenTaskClick` to a *different* task) are unaffected and still reset fields, since a different recipe has its own field set and stale values from an unrelated task shouldn't carry over.
* Verified: full inline script re-parses cleanly (`node --check`).

## v6.0 - "+ merge" button: add a Quick recipes / Browse output straight into the merge list without switching tabs

* **New "+ merge" button** next to **copy** (and **⬇ script**) on every generated command in both **Quick recipes** and **Browse all commands** mode. One click adds that exact generated command — already fully filled in with whatever fields/tokens you set — onto the end of the **Merge commands** list, tagged `generated` so it's visually distinct from a hand-picked reference card. No need to switch tabs, re-find the command in the picker, or re-fill its tokens.
* The **Merge commands** tab badge (added in v5.9) updates immediately to reflect the addition, and clicking "+ merge" repeatedly — across different recipes, shells, or browsed commands — keeps appending to the same ordered list, so a realistic multi-step script (e.g. three different recipe outputs run in sequence) can be built entirely from Quick recipes without ever opening the picker.
* **Internal model change**: the merge list moved from a single array of reference-only `DATA._id`s (`combineSelectedIds`) to an ordered array of string keys (`combineOrder`, e.g. `ref:123` / `custom:7`) resolving through the new `combineEntryForKey()` into one of two entry kinds:
  - **`ref`** — a hand-picked reference command (unchanged behavior): token-editable inline, resolved live via the existing `combineResolvedCommand()`.
  - **`custom`** — a command added via "+ merge": already fully resolved by Quick recipes / Browse, stored as-is in the new `combineCustomEntries` map (keyed by an incrementing `combineCustomSeq` id), rendered with a `generated` tag and no token row since there's nothing left to fill in.
  - Both kinds share the same reorder (▲/▼), remove (✕), copy-all, and download-as-script(s) machinery — `combineEntries()`, `copyCombineList()`, and `downloadCombineList()` now read through `combineEntryForKey()` instead of assuming every list item is a `DATA` row.
* New helpers: `addCombineCustomEntry()` (shared by both add paths), `addGenRecipeToMerge()`, `addGenBrowseToMerge()`, `refKey()`/`customKey()` (key namespacing), and `showAddFeedback()` (a brief "added ✓" button flash, mirroring `showCopyFeedback()`, that holds until the follow-up re-render 650ms later picks up the new badge count).
* Added `.combine-build-tags` (wraps the shell badge + new `generated` tag so `.combine-build-top`'s `space-between` still splits into exactly two groups) and `.combine-source-tag` styling to match the existing badge language.
* Verified: full inline script re-parses cleanly (`node --check`); no remaining references to the old `combineSelectedIds` array; both `+ merge` buttons and all combine/merge functions confirmed defined exactly once.

## v5.9 - Merged "Combine commands" into the Command Generator as a third "Merge commands" mode

* **Removed the standalone "Combine commands" nav item/section** and folded its picker directly into **Command generator** as a third mode tab, alongside "Quick recipes" and "Browse all commands": **"Merge commands"** (shows a live count badge once 1+ commands are picked, matching the "Browse all commands" count badge style).
* All prior functionality is unchanged and fully preserved — checkbox picker over every reference command, ordered build list with ▲/▼ reorder and ✕ remove, inline `<Token>` fill-in per picked command, **copy all**, and **⬇ download script(s)** grouped by shell. Only the entry point moved.
* The "Recent commands" history panel (used by Quick recipes / Browse all) is hidden while in Merge commands mode, same as before when it was a separate section — the merge picker's own build list is the relevant "history" there.
* Internal: `renderCombine()` (previously a full-page renderer with its own `main.innerHTML`) is now `combineLayoutHtml()`, returning just the `.gen-layout` markup consumed by `renderGenerator()`'s existing recipes/browse/combine branch; all combine handlers (`toggleCombineItem`, `removeCombineItem`, `moveCombineItem`, `clearCombineList`, `onCombineSearch`) now trigger `renderGenerator()` instead of the removed `renderCombine()`. Dropped `combine` from `VALID_SECTIONS` and the section-dispatch `if` in `render()`; nav button count 20 → 19.
* Verified: full inline script re-parses cleanly (`node --check`); nav `data-target` set and `VALID_SECTIONS` now match exactly (19 each); no stray references to `renderCombine` or the `combine` section remain.

## v5.8 - New "Combine commands" section: hand-pick multiple commands directly and merge them into one script

* New top-level nav item, **Combine commands**, separate from the Command Generator's history-based combine (which needed you to have already generated/copied each command first). This one is a dedicated picker:
  - Left pane: the same full-text search as "Browse all commands," but every result is a **checkbox** (not a single-select), so you can tick as many commands as you want across every section.
  - Right pane ("Build list"): the checked commands, in order, each showing its resolved text (with inline inputs to fill any `<Token>` placeholders — same substitution the generator uses), a shell badge, **▲/▼** buttons to reorder, and a **✕** to drop it from the list.
  - Footer actions once 1+ commands are picked: **copy all** (concatenates every resolved command to the clipboard, each preceded by a `# label` comment) and **⬇ download script(s)**, which reuses the same `triggerScriptDownload` machinery from v5.7 — groups the selection by shell and downloads one file per shell present (CMD → `.bat`, PowerShell → `.ps1` + `.bat` launcher, Unix → `.sh`), oldest-added-first within each group.
* New state/helpers: `combineSelectedIds` (ordered array, doubles as both "is it picked" and "what order"), `combineTokenValues`, `matchesCombine`, `combineResolvedCommand`, `renderCombine`, plus the usual `on*`/`toggle*`/`remove*`/`move*` handlers. Token edits patch just the one resolved-command `<div>` in place (`closest('.combine-build-item')`) rather than a full re-render, so typing in a token field doesn't lose focus.
* Verified: full inline script re-parses cleanly (`node --check`); confirmed exactly one `data-target="combine"` nav button, `combine` present once in `VALID_SECTIONS`, and each of the 12 new functions defined exactly once.

## v5.7 - Command Generator: download generated commands as runnable scripts, and combine several history entries into one

* **New "⬇ script" button** next to **copy** on every generated command (both Quick recipes and Browse-all modes). Instead of copy-pasting into a terminal, it downloads a ready-to-run file:
  - **CMD** → a single `.bat` (`@echo off` + the command + `pause`, so the window stays open to show the result instead of flashing shut).
  - **PowerShell** → **two files**: a `.ps1` containing the actual command, plus a companion `.bat` launcher that runs it via `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0<script>.ps1"`. This mirrors the project's own `Push.ps1` / `Push_Launcher.bat` pattern — double-clicking a `.ps1` directly usually just opens it in Notepad or hits the default execution-policy block, so the `.bat` is the actual double-click entry point and only bypasses policy for that one process.
  - **Unix/WSL** → a `.sh` with a `#!/usr/bin/env bash` shebang and a leading comment reminding you to `chmod +x` it first (a browser download can't set the executable bit).
* **"Recent commands" history panel** now has a checkbox on every saved entry, plus a **"⬇ combine into script"** button in the header (enabled once 2+ are checked). Combining groups the selection by shell — a mixed selection downloads one file per shell present (e.g. a `.bat` and a `.ps1`+`.bat` pair) rather than dropping entries or producing invalid mixed-syntax output — and orders commands oldest-first within each file so the script runs in the sequence they were originally generated. Each combined command is preceded by a `REM`/`#` comment naming the task it came from. Each history entry also gets its own standalone **⬇** download action alongside the existing copy/use/remove.
* New shared helpers: `slugifyLabel`, `downloadTextFile` (Blob + temporary `<a download>`, revokes the object URL after a beat), `buildBatContent` / `buildPs1Content` / `buildPs1LauncherBat` / `buildShContent`, and `triggerScriptDownload(shellKey, label, entries)` as the single entry point used by the per-output button, the per-history-item button, and the combine action alike.
* Verified: full inline script re-parses cleanly (`node --check`); `slugifyLabel` and `buildBatContent` exercised directly against sample labels/commands and produced the expected filenames and `\r\n`-joined `.bat` content.

## v5.6 - Command Generator: new "Delete all empty subfolders" quick recipe

* **New 15th quick recipe**, `id:'delete-empty-folders'`, label **"Delete all empty subfolders"**, filed under **Files** right after "Delete all files with an extension" — closes a cleanup gap none of the existing Files recipes covered (they all target files, never folder structure).
* Just a **Folder to search** field (drive quick-picks, SAFE variant — no one-click whole-system delete, same as "Delete all files with an extension"). No extension field (not applicable) and deliberately no `SCOPE_PARAM` — deleting empty folders is inherently a whole-tree operation, not a "top only" vs "+ subfolders" choice like the other Files tasks.
* The real design problem across all three shells was **nested empty folders**: deleting an empty child can leave its now-empty parent behind, so a naive single pass over a snapshot misses the cascade. Each `build()` handles this differently:
  - **CMD**: `for /f "delims=" %d in ('dir "path" /ad /b /s ^| sort /r') do @rd "%d" 2>nul` — `rd` (no `/s`) only removes a folder if it's actually empty and errors otherwise (`2>nul` hides that). The cascade is handled by `sort /r`: a child path is always longer than its parent and so always sorts after it, meaning a reverse sort visits every folder deepest-first — children are always `rd`'d before their parent is reached in the same pass.
  - **PowerShell**: a `do { ... } while ($empty.Count -gt 0)` loop that re-scans with `Get-ChildItem -Recurse -Directory -Force` and re-removes on each pass until nothing empty is left. `-Force` on both the outer scan and the inner per-folder content check so a folder isn't skipped just because everything inside it happens to be hidden.
  - **Unix**: `find "path" -type d -empty -delete` — `find`'s `-delete` forces depth-first traversal (a folder's contents are visited before the folder itself), so by the time it reaches a parent, any child emptied earlier in the same walk is already gone. No re-scan loop needed; the cascade is handled in a single pass.
* Verified: full inline script re-parses cleanly (`node --check`); all three `build()` variants were executed directly against sample paths and produced the expected command strings. Quick recipe count: 14 → 15.

## v5.5 - CMD's "list every file type" commands now truly deduplicate, not just sort

* **Fixed:** every CMD command in the new v5.3/v5.4 file-type-discovery additions only ever sorted its output — identical extensions ended up clustered together but each still printed once per matching file, so a folder with 40 `.log` files showed `.log` 40 times, not once. Sorting alone was never a real substitute for a unique list.
* **Real fix**: CMD still has no built-in dedupe filter, so all four affected commands now use the standard three-step batch idiom — collect extensions to a temp file, sort it, then a `setlocal enabledelayedexpansion` loop compares each line against a `prev` variable and only echoes it when it's different from the line before. Writing to a temp file first (`%temp%\exts.txt`) sidesteps the nested-quoting mess that trying to pipe straight into the dedupe loop would otherwise require.
* Updated in both places affected:
  - **Reference cards** (Search → Discover file types tier): both CMD entries (single folder, and recursive/whole-drive) rewritten with the 3-line `ex` sequence.
  - **Command Generator** (Files → List every file type in a folder): the `cmd` shell's `build()` rewritten to emit the same 3-line sequence for all three scope states (this folder only, + subfolders, and All drives).
  - PowerShell (`Select-Object -Unique` / `Group-Object`) and Unix (`sort -u` / `uniq -c`) were already genuinely unique and needed no change.
* Verified: full inline script re-parses cleanly (`node --check`); the `DATA` array was independently parsed to confirm both reference-card `ex` fields carry the corrected 3-line commands; all three Generator `cmd` build() scope variants (top/sub/All drives) were executed directly and produce the expected `setlocal` → collect → dedupe sequence with no stray quoting issues.

## v5.4 - Command Generator: new "List every file type in a folder" quick recipe

* **Fixed:** v5.3 added extension-discovery *reference cards* to the Search section, but the Command Generator's **Quick recipes** tab is a separate, hand-curated task list (`GENERATORS`) that reference-card additions never populate — so the new capability was invisible from the Generator itself. This adds a proper 14th quick recipe, `id:'list-extensions'`, label **"List every file type in a folder"**, filed under the existing **Files** category right after "Find files by extension" (its logical inverse).
* Same field shape as the other Files recipes — **Folder to search** (with the standard drive quick-picks) and the shared **Search in** scope toggle (this folder only / this folder + subfolders) — but deliberately no Extension field, since discovering extensions is the whole point.
* Per-shell `build()`, all three honoring scope and the "all drives / whole filesystem" pick:
  - **CMD**: `(for %f in ("path\*") do @echo %~xf) | sort` (this folder only) / `(for /r "path" %f in (*) do @echo %~xf) | sort` (+ subfolders) / a nested drive-loop variant for "All drives."
  - **PowerShell**: `Get-ChildItem -Path "path" -File | Select-Object -Unique Extension | Sort-Object Extension` (this folder only) / `... -Recurse -File | Group-Object Extension | Sort-Object Count -Descending` (+ subfolders, with per-type counts) / a `Get-PSDrive`-looped version for "All drives."
  - **Unix**: `ls -p "path" | grep -v / | sed 's/.*\.//' | sort -u` (this folder only) / `find "path" -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn` (+ subfolders, with counts) / `find / -type f 2>/dev/null | ...` for the "Whole filesystem (/)" pick.
* Verified: full inline script re-parses cleanly (`node --check`); each of the 9 shell×scope build() combinations (including both "All drives"/"/" variants) was executed directly against sample input and produced the expected command string. Quick recipe count: 13 → 14.

## v5.3 - Search: new "Discover file types" tier — list every extension present, not just search for a known one

* **New tier, 6 entries** (`t:'Discover file types (list every extension in use)'`), added to Search & Pattern Matching right after "Search by file type" and before "Single folder: search & sort" — closes a gap where every existing extension-related entry assumed you already knew the extension you were looking for (search by *.ext, sort a folder by extension). Nothing answered the opposite question: "what file types are actually in this folder/drive?"
* **2 entries per shell**, each pair covering a single folder (no subfolders) and a recursive/whole-drive scope, mirroring the existing single-folder-vs-recursive split used elsewhere in Search:
  - **PowerShell**: `Get-ChildItem | Select-Object -Unique Extension` for one folder; `Get-ChildItem -Recurse | Select-Object -Unique Extension` for a folder tree or a whole drive (pointed at `C:\`). Both ex fields also show the `Group-Object Extension | Sort-Object Count -Descending` variant for a per-type count, not just a bare list.
  - **CMD**: no built-in "list unique file types" command exists, so both entries loop over files with `for` / `for /r`, print just the extension via `%~xf`, and pipe through `sort` — `(for %f in (*) do @echo %~xf) | sort` for one folder, `(for /r "C:\Path" %f in (*) do @echo %~xf) | sort` recursively/whole-drive. Sorting clusters identical extensions together since CMD has no true dedupe/uniq; the entry description says so plainly rather than pretending it is a real unique list.
  - **Unix**: `ls -p | grep -v / | sed 's/.*\.//' | sort -u` for one folder (strip filenames to their extension, dedupe); `find . -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn` recursively, which also gets a free per-type count via `uniq -c`.
* Registered the new tier name in the tier-ordering array (right after `'Search by file type'`) so it renders in a deliberate spot instead of falling back to alphabetical. No new section, `VALID_SECTIONS` entry, or CSS accent needed — this lives inside the existing `search` section and its hero/nav counts are computed dynamically from `DATA`.
* Updated the Search & Pattern Matching section subtitle to mention discovering file types alongside the existing search-by-type and modern-tools callouts.
* Verified: 332 total entries (326 + 6 new), 37 in Search (31 + 6 new), all 6 correctly tagged `s:'search'`, `t:'Discover file types (list every extension in use)'`; full inline script re-parses cleanly (`node --check`), and the `DATA` array literal was independently parsed and inspected to confirm each new entry's `sh`/`cmd` fields — including the escaped `sed` single-quotes — came through exactly as written.

## v5.2 - Install & setup: new "Shells: what they are & why" tier

* **New tier, 7 entries**, added right after "Bootstrap — do this first" (before Package managers) — closes a gap where the site told people *how* to install tools but never explained the shells they'd be typing into. Covers CMD, Windows PowerShell 5.1 (built-in), PowerShell 7/pwsh, WSL/bash, Git Bash, and Windows Terminal, plus a "Which shell should I use?" quick-reference card.
* Each shell entry explains what it actually is, how it differs from the others (text pipeline vs object pipeline, real Linux kernel vs emulation layer, built-in vs separately installed), and a **"Best for:"** line calling out the specific use case it wins at over the alternatives — not just install commands.
* Added the quick-reference card as the first entry in the tier: a plain "task → shell" lookup table (everyday scripting → PowerShell, legacy .bat → CMD, Linux-only tooling → WSL, quick git/unix → Git Bash) so the comparison is scannable in one glance before reading the individual cards.
* Windows Terminal is explicitly called out as a *host app*, not a shell itself, since it's easy to conflate the tabbed terminal with the shell running inside a given tab.
* Added `'Shells: what they are & why'` to the tier-ordering array right after `'Bootstrap — do this first'` so it renders early, before the install-focused tiers, as foundational context.
* Setup section entry count: 31 → 38. Verified inline script re-parses cleanly (`node --check`).

## v5.1 - Command Generator: extension chips are now multi-select, with correct per-shell syntax for 2+ extensions

* **Fixed:** v5.0's extension chips only ever held one value — clicking a second chip replaced the first instead of adding to it, so there was no way to build e.g. "find every .log or .txt file" from the picker. Chips on `ext` params (`extPicks`) now carry a new `multi:true` flag and behave as toggles: clicking one adds/removes it from a comma-separated list (`"log,txt"`) stored in that field, and a chip shows active whenever its extension is in the list. Drive-pick chips (`drivePicks`, on the "Folder to search" field) are untouched — still single-select, still replace the value on click. The "Any file" chip on **Search for text inside files** now clears the whole list instead of just itself.
* New `onGenExtToggle(key, value, isAll)` handles the toggle; `onGenQuickPick` stays as-is for drive picks and the select-type params.
* **Rewrote all 9 `build()` functions** (find-ext × 3 shells, delete-ext × 3 shells, search-text × 3 shells) to actually honor 2+ extensions with each shell's native "multiple patterns" syntax instead of silently only using the first one:
  - **CMD**: `dir`/`del`/`findstr` all accept several quoted `path\*.ext` specs as separate arguments on one line, so N extensions become N specs (`dir "C:\Projects\*.log" "C:\Projects\*.txt" /s /b`); the recursive `del` still uses `for /r "path" %f in (*.log *.txt) do @del "%f"` since `for`'s `(set)` already takes space-separated masks.
  - **PowerShell**: single extension keeps the exact `-Filter *.ext` output from before (byte-for-byte, so existing single-ext commands don't change); 2+ switches to `-Include *.log,*.txt` (comma list), which needs either `-Recurse` or a path ending in `\*` to actually filter — non-recursive ("top only") multi-extension search/find/delete now points `-Path` at `"folder\*"` to satisfy that.
  - **Unix**: `find -name`/`-iname` only take one pattern each, so 2+ extensions get OR'd in a parenthesized group (`\( -name "*.log" -o -name "*.txt" \)`); `grep --include` is simply repeated once per extension (`--include="*.log" --include="*.txt"`).
* New shared helpers: `extArr(ext)` splits the comma-separated field value into a clean trimmed array (used by every build() that reads an ext field), `findNameExpr(exts, flag)` builds the single-pattern-or-OR'd-group expression for `find` (used by find-ext and delete-ext's unix builds, and search-text's non-recursive unix build).
* Field labels updated from "Extension (no dot)" / "File type (optional, no dot)" to "Extension(s) (no dot)" / "File type(s) (optional, no dot)" to signal multi-select is available.
* Verified: `node --check` on the full inline script, plus an isolated test harness running all 9 `build()` functions through both a single extension and a two-extension case (and the all-drives / any-file edge cases) — single-extension output is unchanged from v5.0, multi-extension output uses correct native syntax per shell.

## v5.0 - Command Generator: file type quick-pick chips on every "Extension" field

* Added one-click extension chips (`.txt`, `.log`, `.pdf`, `.docx`, `.xlsx`, `.csv`, `.jpg`, `.png`, `.zip`, `.json`) under the **Extension** field on all three Quick recipes that take one — **Find files by extension**, **Delete all files with an extension**, and **Search for text inside files** — across all three shell tabs each (9 fields total), the same one-click pattern the "Folder to search" field's drive picks already used.
* **Search for text inside files**' extension field is optional (an empty value means "search every file"), so its chip row gets an extra leading **Any file** chip that clears the field back to no filter — the other two tasks require an extension to do anything, so they only get the 10 file-type chips.
* Implemented generically: a new `EXT_PICKS` array (plus `EXT_PICKS_OPTIONAL` = `EXT_PICKS` with the "Any file" chip prepended) is attached to each `ext` param the same way `drivePicks` already attaches to `path` params, and the render code that builds the quick-pick row now reads `p.drivePicks || p.extPicks` instead of only checking `drivePicks` — no new CSS, no new click handler, `onGenQuickPick` was already generic over field key.
* Browse mode (build-from-any-of-319-commands) is unaffected — its `<Token>` substitution only fires on literal `<Name>`-style placeholders, and none of the "search by file type" reference entries use one (they show `*.ext` as literal example text, not a fillable token), so there was nothing there for a picker to attach to.
* Verified: all 9 target fields (find-ext × 3 shells, delete-ext × 3 shells, search-text × 3 shells) carry the correct picks array, "Any file" only appears on search-text, full inline script re-parses cleanly (`node --check`).

## v4.9 - Search gets its own section; grep/findstr/Select-String expanded with file-type filtering, single-folder scoping, and modern tools

* **Split "Text Search & Data Processing" into two top-level sections.** Search was previously bundled together with sed/awk/sort/wc under one nav entry — now **Search & Pattern Matching** (`s:'search'`, teal accent, reusing the old section's color) covers finding text inside files, and **Data Processing** (`s:'dataproc'`, new magenta accent `--dataproc`) covers reshaping it once found. Existing entries were re-tagged, not rewritten: findstr, Select-String, PowerShell `-match`/`-replace`, and all 8 unix `grep` entries moved to Search (10 entries); `type`, `Get-Content`, `head`/`tail -f`, the full sed/awk tier, and `wc`/`diff`/`sort | uniq -c` stayed in Data Processing (15 entries). `findstr` was also re-tiered from "Viewing & filtering" into "Pattern search (grep family)" since it's a search tool, not a viewer.
* **New "Search by file type" tier (5 entries)**, closing a real gap — none of the existing grep-family entries showed how to scope a search to (or away from) a specific extension: `grep -r --include="*.ext"` / `--exclude`/`--exclude-dir` (unix), `Get-ChildItem -Include`/`-Exclude *.ext -Recurse | Select-String` (PowerShell), and a `for /r %f in (*.ext) do @findstr` loop (CMD, since findstr has no native `--include` flag).
* **New "Modern & extra search tools" tier (8 entries)**: ripgrep (`rg`, plus its `-t`/`-g` type-filtering), `zgrep` for searching inside `.gz` archives without extracting, `grep -f patterns.txt` for matching a whole list of patterns at once, `locate`/`updatedb` for instant filesystem-wide filename search, `... | fzf` for interactive fuzzy-picking piped results, `findstr /M` (CMD) and `Select-String -List` (PowerShell) as the Windows-side equivalents of `grep -l`.
* **Two more entries added directly to "Pattern search (grep family)"**: `grep -l` / `-L` (list matching/non-matching filenames — was missing from the unix grep entries despite CMD/PowerShell now having equivalents) and `grep -P` (Perl-compatible regex for lookahead/lookbehind that `-E` can't express).
* Registered `search` and `dataproc` in `VALID_SECTIONS`, the "All commands" tab's section list, and `setStats()` (both the `sections` array and `idSuffix` map) so hero stats and nav counts populate correctly. Added two new hero stat boxes (`statSearch` "search & grep", `statDataproc` "data processing") replacing the old single `statTextproc` box. Extended the tier-ordering array with `'Search by file type'` and `'Modern & extra search tools'` so they render in a deliberate order instead of falling back to alphabetical.
* Sidebar stays alphabetized per v4.7's convention: **Data Processing** slots in between "Apps: Install & Remove" and "Disk Cleanup" (D-a before D-i); **Search & Pattern Matching** slots in between "Scripting & Shell Environment" and "System Info & Hardware" (S-c, then S-e, then S-y).
* Verified: 313 total entries (298 + 15 new), 25 in Search (10 re-tagged + 15 new), 15 in Data Processing (all re-tagged, 0 new), 0 leftover `s:'textproc'` references anywhere in `DATA` or the wiring code.
* **New "Single folder: search & sort" tier (6 entries)**, added to tighten the search scope in the other direction — instead of casting wider (recursive, by file type), these keep a search to exactly one folder and help you see what's in it before searching: `grep "pattern" *` (unix — non-recursive by pointing grep at files, not a directory), `Select-String -Path * -Pattern "..."` (PowerShell — no `-Recurse`), `findstr "pattern" *.txt` (CMD — no `/S`), plus three file-type sorting commands to eyeball a folder's contents first: `dir /o:e` (CMD), `Get-ChildItem | Sort-Object Extension` (PowerShell), `ls -X` (unix).
* Final verified totals: 319 entries overall, 31 in Search. Full inline script re-parses cleanly (`node --check`).

## v4.7 - Sidebar alphabetized (except the two pinned items at top)

* Reordered every sidebar nav button alphabetically by its visible label — **Install & setup** and **Command generator** stay pinned at the top in that order (unchanged); everything else, including **All commands** and **FAQ for beginners**, now sorts A→Z: All commands, Apps: Install & Remove, Disk Cleanup, Docker, FAQ for beginners, Files Folders & Storage, Git, Networking & Remote Access, Outlook / PST, Processes Jobs & Scheduling, Registry, Scripting & Shell Environment, System Info & Hardware, Text Search & Data Processing, Troubleshooting & Fixes, Users Permissions & Policy, WSL & Linux Interop.
* The `nav-divider` moved with it — it now sits right after the two pinned buttons, marking them off from the alphabetized list below, instead of its old spot separating "All commands" from "FAQ."
* Pure markup reorder: no changes to `VALID_SECTIONS`, `SECTION_META`, `setStats()`, or any `DATA` entries — nav button count unchanged (19). Verified the full inline script still parses cleanly (`node --check`).
* Left the hero stat-boxes grid (the "n / label" numbers under the headline) in its existing order since it's a separate presentational element, not the navigation list this change was about — flag if you'd like that alphabetized too.

## v4.6 - Disk Cleanup promoted to its own top-level section

* The 8 cache/temp-clearing entries added in v4.4 move out of Troubleshooting & Fixes and into a new top-level section, **Disk Cleanup** (`s:'cleanup'`), with its own nav button (placed right after Troubleshooting & Fixes), hero stat box ("disk cleanup"), and accent color (`--cleanup`, a teal distinct from every existing accent).
* Split the single "Disk cleanup" tier into two clearer ones now that the section stands alone: **Temp & cache folders** (the 7 individual locations — user/system temp, Windows Update cache, Delivery Optimization, Prefetch, thumbnails, Recycle Bin) and **Full sweep** (the one combined script).
* Registered `cleanup` in `VALID_SECTIONS` and in `setStats()` (added to both the `sections` list and the `idSuffix` map) so its hero and nav counts populate correctly; added `'Temp & cache folders'` and `'Full sweep'` to the tier-ordering array so they render in a deliberate order rather than alphabetically.
* Troubleshooting & Fixes' subtitle reverts to its pre-v4.4 wording, with one added line pointing to the new Disk Cleanup section.
* Verified: 298 total entries unchanged, 8 correctly re-tagged from `s:'troubleshoot'` to `s:'cleanup'`, 20 remain under `s:'troubleshoot'` (28 − 8), full inline script still parses cleanly (`node --check`).
* **Known pre-existing gap, not touched here**: the "All commands" tab's `sectionsToShow` list (used only when `activeSection === 'all'`) already omitted `git`, `docker`, `reg`, `outlook`, and `troubleshoot` before this change — `cleanup` is consistent with that same gap rather than newly broken by it. Worth fixing in a future pass if that tab is meant to show every section.

## v4.5 - Command generator moved up in the sidebar, right below Install & setup

* Moved the **Command generator** nav button from its old spot (grouped with FAQ at the bottom, below a divider) to directly under **Install & setup** at the top of the sidebar — it's one of the most-used tools on the site, so it no longer sits below all 14 reference sections.
* Removed the now-orphaned `nav-divider` that used to separate it from FAQ; FAQ keeps its own divider above it since it's still a distinct "help" entry at the bottom of the list.
* No changes to section content, `VALID_SECTIONS`, or generator logic — purely a nav-order change. Verified the full inline script still parses cleanly (`node --check`) and the sidebar still renders all 18 nav buttons.

## v4.4 - New "Disk cleanup" tier: search and clear every cache/temp folder on C:

* Added a new **Disk cleanup** tier inside Troubleshooting & Fixes with 8 entries covering every major cache/temp bucket Windows accumulates on the system drive: user + system temp folders (CMD and PowerShell versions), Windows Update download cache (`SoftwareDistribution\Download`), Delivery Optimization's peer-to-peer update cache, Prefetch, the Explorer thumbnail cache, and the Recycle Bin (`Clear-RecycleBin -Force`).
* Added a flagship **"Full sweep"** PowerShell entry that chains all of the above — plus the Chrome and Edge cache folders — into a single elevated-session script, with `-ErrorAction SilentlyContinue` throughout so a file locked by a running process is skipped rather than aborting the whole run.
* Registered `'Disk cleanup'` in the tier-ordering array, right after "Troubleshooting & repair" and before "Sticky Keys & accessibility popups," so it renders in a deliberate spot instead of falling back to alphabetical order.
* Updated the Troubleshooting & Fixes section subtitle to mention the new tier. No new top-level section, CSS accent, or nav entry was needed — this lives inside the existing `troubleshoot` section and its hero/nav counts are computed dynamically from `DATA`.
* Verified: 298 total entries (290 + 8 new), all 8 new entries correctly tagged `s:'troubleshoot'`, `t:'Disk cleanup'`; full inline script still parses cleanly (`node --check`).

## v4.3 - Command Generator can now build from any of the 290 reference commands, not just the 13 curated recipes

* Added a mode toggle at the top of the Command Generator: **Quick recipes** (the existing 13 hand-built, multi-shell, scope-aware tasks — unchanged) and **Browse all commands**, a new mode that turns every entry in the full reference into a generator task.
* In Browse mode the left panel is a searchable, section-grouped list of all 290 commands (search matches command text, description, and keywords). Selecting one shows its description/use-case and, for the 22 entries whose `cmd` field contains `<Token>` placeholders (e.g. `wsl --install -d <Distro>`, `kill -9 <PID>`), one text input per unique token that live-substitutes into the output as you type. The other 268 entries have nothing to fill in — they render as ready-to-copy immediately, using the same `ex` field the static reference cards already show.
* Implemented generically off the existing `DATA` array (each item now carries a stable `_id`) rather than hand-writing 290 new recipes — any future entry added to the reference automatically becomes available in Browse mode with no extra work.
* "Recent commands" history now records both modes: recipe builds as before, and Browse-mode copies (labeled with the command's own text, and its shell badge when the entry carries a `sh` field). "Use" on a saved Browse-mode entry switches the generator back into Browse mode and re-selects that exact command with its filled-in values restored. Old saved history from before this change still loads correctly.
* Verified: all 290 `DATA` entries got a unique `_id`, 22 correctly detected as having `<Token>` placeholders, 268 with none; sample substitutions (`<Distro>` → `Ubuntu-22.04`, `<PID>` → `4821`) produce the expected output; full inline script still parses cleanly.

## v4.2 - Sidebar section list can be scrolled on its own

* **Bug**: the section nav (Install & setup, Files, Processes, etc.) had no scroll container of its own — on shorter viewports, reaching an item further down the list meant scrolling the entire page, not just the sidebar.
* **Fix**: gave `nav.sidebar` its own vertical scroll — capped to the viewport height below the sticky header (`max-height: calc(100vh - 94px)`) with `overflow-y: auto` — so the section list scrolls independently while staying pinned in place as the main content scrolls past it.

## v4.1 - Command text itself is now shell-colored, not just the badge

* On the 8 mixed-shell task sections (Files, Processes, Networking, Text Search, Scripting, Users/Permissions, System Info) every card whose `sh` field is set now renders its command text in that shell's accent color (`--cmd` blue / `--ps` blue / `--unix` teal-green), in addition to the existing color-coded badge next to it — so the shell reads at a glance without having to spot the small uppercase tag.
* Implemented as an inline `style="color:..."` on the `.cmd` div, applied only when `item.sh` is present; cards with no `sh` (WSL, Git, Docker, Setup, Apps, Registry, Outlook, Troubleshooting) are unaffected and keep the plain `--text` color, since those sections are already single-shell and colored at the section/border level.
* Verified the full inline script still parses cleanly after the change.

## v4.0 - Recategorized by utility instead of by shell: the four shell-named sections are gone

* **The core change**: Command Prompt, PowerShell, WSL, and "grep, sed, awk & friends" — the four top-level sections that grouped commands by *which shell they run in* — are dissolved. In their place, 8 new task-based sections group commands by *what you're trying to do*, regardless of shell: **Files, Folders & Storage** (25), **Processes, Jobs & Scheduling** (10), **Networking & Remote Access** (17), **Text Search & Data Processing** (25), **Scripting & Shell Environment** (23), **Users, Permissions & Policy** (3), **System Info & Hardware** (8), and **WSL & Linux Interop** (21, kept together — its commands manage the Linux environment itself rather than mapping to a files/process/network task the other shells share).
* Every migrated card now carries a small **shell badge** (CMD / PowerShell / Unix, color-coded using the same accent colors the old sections used) next to the command, since the syntax is still shell-specific even though the grouping no longer is. WSL cards don't carry a badge — the whole section is already "the WSL shell."
* Found and removed **2 true duplicates** in the process: cmd's `sfc /scannow` and `chkdsk C: /f /r` were byte-for-byte already present under Troubleshooting & Fixes' "Troubleshooting & repair" tier — deleted rather than re-homed. Also folded cmd's `reg query / add / delete` overview entry into the existing Registry section's "Read & query" tier instead of creating a redundant entry in a new category.
* Old Basic/Useful/Advanced/Hidden gems tiers (which only ever described difficulty, not task) are replaced with task-named tiers per section — e.g. Files splits into "Everyday file ops," "Search & bulk actions," "Permissions & attributes," "Disk, archives & integrity"; Networking splits into "Connectivity & diagnostics," "Wireless & remote sessions," "Downloads & transfers." WSL's Basic/Advanced/Workflow tiers become "Setup & management," "Configuration," "Cross-platform interop & workflow." The global tier-ordering array was extended so every new tier still renders in a deliberate sequence instead of falling back to alphabetical.
* New CSS accent variables (`--files`, `--procs`, `--netops`, `--textproc`, `--scripting`, `--useradmin`, `--sysdiag`) added for both themes, following the existing light-theme darkening/saturation convention for WCAG AA contrast. The four old shell accent vars (`--cmd`, `--ps`, `--wsl`, `--unix`) are kept — `--wsl` still colors the WSL section, and the other three now color shell badges instead of section headers.
* Updated `SECTION_META`, `VALID_SECTIONS`, the sidebar nav, hero stat boxes, `setStats()`, and the "All commands" tab's section list to match. The Command Generator's shell tabs (CMD / PowerShell / WSL·Unix) are unchanged — that's a "build this for shell X" tool where the shell genuinely is the relevant axis, not a reference-browsing category.
* Rewrote the hero headline and subhead to frame the site around task-first browsing instead of "four shells, one reference." The FAQ's "CMD vs PowerShell vs WSL" explainer is untouched — it's still useful for understanding what each shell actually is, independent of how the reference is organized.
* Verified: 290 total entries (292 − 2 removed duplicates), 0 malformed entries, shell-badge counts (cmd 38, powershell 35, unix 38) reconcile exactly against the original per-shell counts minus removed/merged entries. Full inline script re-parses cleanly (`node --check`).

## v3.9 - New top-level "Troubleshooting & Fixes" section: the actual clutter finally moved out of Install & setup

* v3.7/v3.8 never actually fixed the real complaint — v3.7 moved the wrong tiers out (Bootstrap, Package managers, Browsers, Languages & runtimes, Editors & dev tools, i.e. the actual installs), and v3.8 correctly reverted that but left the true clutter — **Drivers**, **Troubleshooting & repair**, and **Sticky Keys & accessibility popups** (20 entries) — sitting inside Install & setup, which was only ever supposed to cover getting shells/tools onto a fresh machine.
* Added a new top-level nav section, **Troubleshooting & Fixes** (`s:'troubleshoot'`), alongside Setup, Apps, Registry, and Outlook/PST, and moved those exact 20 entries into it unchanged (re-tagged from `s:'setup'` to `s:'troubleshoot'`) across the same 3 tiers, in the same order (Drivers → Troubleshooting & repair → Sticky Keys & accessibility popups).
* Install & setup now holds only what it was always meant to: Bootstrap, Package managers, Languages & runtimes, Editors & dev tools, Virtual environments, and Browsers — 31 entries, 6 tiers. Trimmed its subtitle to drop the "driver fixes, general troubleshooting, Sticky Keys popup" mention accordingly.
* Added a `--troubleshoot` accent color (dark + light, red-toned to read as "something's broken" rather than "something's a fresh install"), a new hero stat box (`statTroubleshoot`, labeled "fixes"), a nav button + count (`cTroubleshoot`) placed right after Outlook / PST, and registered `troubleshoot` in `VALID_SECTIONS` so it persists correctly via the last-viewed-section localStorage key.
* Verified the full script still parses and the split is exact: 292 total entries unchanged, 31 in Install & setup, 20 in the new Troubleshooting & Fixes, 0 leftover tagged `setup` that don't belong there.

## v3.8 - Corrected v3.7: kept Install & setup intact, new section renamed "Apps: Install & Remove"

* v3.7 had moved five tiers (Bootstrap, Package managers, Browsers, Languages & runtimes, Editors & dev tools) out of **Install & setup** and into the new section — that merged two things that were meant to stay separate. Reverted: all 28 of those entries are back under `s:'setup'`, and Install & setup is restored to its original label, subtitle, and full 51-entry, 9-tier shape (Bootstrap, Package managers, Languages & runtimes, Editors & dev tools, Virtual environments, Browsers, Drivers, Troubleshooting & repair, Sticky Keys & accessibility popups).
* The new section keeps its own content (the "Uninstall apps" tier from v3.7) but is renamed from **Install & Uninstall** (`s:'install'`) to **Apps: Install & Remove** (`s:'apps'`) so it doesn't read as a duplicate of Install & setup, and gets its own 3-entry **Install apps** tier (`winget search/install`, `winget upgrade --all`, `choco install/upgrade`) so it stands on its own instead of leaning on Setup's Package managers tier. Total: 10 entries across 2 tiers.
* Restored Install & setup as the default landing tab (was briefly Install & Uninstall in v3.7); Apps: Install & Remove is a normal secondary tab.
* Renamed the `--install` CSS accent to `--apps`, updated the hero stat box, "All commands" tab section list, and nav/stat count wiring (`cApps`/`statApps`) to match.
* Verified the full script still parses and the split is correct: 292 total entries, 51 in Install & setup (unchanged from before v3.7), 10 in the new Apps: Install & Remove, 0 leftover under the old `install` key.

## v3.7 - New top-level "Install & Uninstall" section, split out of Install & setup (superseded by v3.8)

* Added a brand-new top-level nav section, **Install & Uninstall** (`s:'install'`), alongside Setup, Registry, and Outlook/PST rather than as a tier inside another section — matches how the Command Generator's "Apps" category (added in v3.5) already separates finding a package from everything else.
* Moved five existing tiers into it wholesale: **Bootstrap — do this first**, **Package managers**, **Browsers**, **Languages & runtimes**, and **Editors & dev tools** (28 entries, unchanged content — just re-tagged from `s:'setup'` to `s:'install'`).
* Added a new **Uninstall apps** tier (7 entries) to round it out: `winget uninstall`, `winget list` (find the exact ID first), `choco uninstall`, `Get-Package | Where Name -like` (catches installs winget list misses), Programs and Features (`appwiz.cpl`) for apps with no clean silent uninstaller, `msiexec /x` for scripted MSI removal, and `Get-AppxPackage | Remove-AppxPackage` for pre-installed Store/UWP bloatware.
* The old **Install & setup** section is renamed **Setup & troubleshooting** and now holds only what didn't move: Virtual environments, Drivers, Troubleshooting & repair, and Sticky Keys & accessibility popups (25 entries). Updated its subtitle to point installs/uninstalls at the new section.
* Install & Uninstall is now the default landing tab (previously Setup) since it covers the more common day-one task; added its section to the "All commands" tab's section list, added a `--install` accent color (dark + light), a new hero stat box, and wired up its nav count/hero stat — all computed automatically from `DATA.filter(...)`.
* Verified the full script still parses and the entry counts split correctly (33 in Install & Uninstall, 25 in Setup & troubleshooting, 289 total) before committing.

## v3.6 - Fixed copy button silently failing (generator, history, and reference cards)

* **Bug**: all three copy buttons (`doCopy` on reference cards, `copyGenOutput` in the Command Generator, `onHistoryCopy` in Recent commands) called `navigator.clipboard.writeText()` with no `.catch()`. That call rejects — silently, with nothing shown to the user — whenever the page isn't focused at the moment of the click, the site isn't served over HTTPS/localhost (`window.isSecureContext` is false), or the browser withholds clipboard permission. The button just did nothing, which is what made the generator's copy button look broken.
* **Fix**: added a shared `copyToClipboard(text)` helper. It uses the async Clipboard API when available and the context is secure, and falls back to a hidden-textarea + `document.execCommand('copy')` otherwise or if the async call rejects. Added `showCopyFeedback(btn, ok)` so a real failure now shows "copy failed" on the button instead of nothing happening.
* All three copy call sites (`doCopy`, `copyGenOutput`, `onHistoryCopy`) now go through the shared helper and show explicit success/failure feedback.
* Verified the updated script still parses cleanly end to end.

## v3.5 - "Apps" category in the Command Generator: find a package by app name, then uninstall it

* Added a new **Apps** category to the Command Generator with two tasks that chain together: **"Find a package's exact name (to uninstall it)"** takes just a plain app name (e.g. "chrome") and builds a search command per shell — `winget list "<app>"` + `choco list --local-only "<app>"` on CMD, `winget list "<app>"` + `Get-Package -Name "*<app>*"` on PowerShell, `apt list --installed | grep -i "<app>"` on WSL/Unix — so the exact package ID/name can be found without already knowing it.
* **"Uninstall a package by name"** takes that exact ID (winget App ID like `Google.Chrome`, or the WSL/Unix package name) and builds the matching removal command: `winget uninstall --id "<id>" -e` on CMD/PowerShell, `sudo apt remove "<name>"` on WSL/Unix.
* The two-step split exists because most uninstall commands need an exact ID, not the friendly app name someone actually remembers — this makes "I want to remove that browser" a two-field generator flow instead of a manual `winget list` first.
* Verified both new generator tasks parse and their `build()` functions produce the expected command strings before committing.

## v3.4 - Browsers, Drivers, Troubleshooting & repair, and Sticky Keys tiers for Install & setup

* Added 23 new entries across 4 new tiers to the Install & setup section (28 → 51 entries): **Browsers** (winget/choco install of Chrome/Firefox/Edge, setting the default browser, clearing browser cache), **Drivers** (`pnputil` for finding/rescanning/listing/removing devices and drivers, Windows Update's optional-updates driver page, Device Manager shortcut, uninstall-and-reboot reinstall), **Troubleshooting & repair** (`sfc /scannow`, `DISM /RestoreHealth`, `chkdsk`, network stack reset, Explorer restart, Event Viewer, Windows Update troubleshooter, Task Manager), and **Sticky Keys & accessibility popups** (disabling the Sticky Keys / Filter Keys / Toggle Keys prompts individually or via one combined `.reg` file, plus a re-enable/undo entry).
* The Sticky Keys tier directly targets the "Do you want to turn on Sticky Keys?" popup that fires after five Shift taps — a recurring annoyance on shared showroom/counter machines — by writing the accessibility `Flags` registry values instead of just muting the sound.
* Updated the `setup` section subtitle (`SECTION_META.setup.sub`) to mention the new coverage. No changes needed to hero stat / section count wiring — both are computed from `DATA.filter(...)`, so the new entries count themselves automatically.
* Verified the new `DATA` entries parse correctly as valid JS objects (no syntax issues from the added entries) before committing.

## v3.3 - Sandbox-verified fixes to three broken Outlook / PST commands

* **"Find every PST/OST file" was missing the actual default PST location**: the command only searched `%userprofile%\AppData\Local\Microsoft\Outlook\*.pst` — that's the **OST** folder. Since Outlook 2010, new `.pst` files default to `%userprofile%\Documents\Outlook Files\`; AppData only holds a `.pst` left over from a pre-2010 profile that was never moved. Checking only AppData was the most common reason this command turned up nothing. Added the Documents\Outlook Files search as its own `dir` line ahead of the AppData one, and rewrote the description to explain why both locations matter. Confirmed against Microsoft's own documentation on default data-file paths.
* **`lspst -D` is not a real flag**: verified by installing `pst-utils` (libpst) in a sandbox and running the command directly against a real `.pst` test fixture — `lspst -D` returns `invalid option -- 'D'`. libpst has no such debug switch; `lspst` only takes `-d <file>` (writes a binary log, needs a separate `readlog` tool not present in this build) or `-l` (extra fields, not debug output). Replaced the entry with `readpst -L 1 -o folder file.pst`, which sets readpst's own debug verbosity and prints folder-by-folder progress directly to the terminal — re-tested end to end against the same fixture and confirmed working.
* **`schtasks /tr` nested-quote bug in "Schedule an automatic recurring backup"**: the command inlined the robocopy line inside `/tr` using backslash-escaped quotes (`\"..\"`) around the source/destination paths. `cmd.exe` does not reliably parse that nesting — a long-standing, well-documented schtasks gotcha — so the task could silently fail to register or fail to run. Fixed by moving the robocopy line into its own `.bat` file and pointing `/tr` at the plain `.bat` path instead, which sidesteps the nested-quote problem entirely. (Checked the neighboring "Schedule the reminder popup around office hours" entry too — it only has one level of quoting, no nesting, so it was left as-is.)
* Testing method: since this site's commands are Windows/PowerShell-specific and the available sandbox is Linux, the WSL/libpst-based commands (`readpst`, `lspst`, `pffinfo`) were verified by actually installing `pst-utils` and `pff-tools` and running them against a real `.pst` fixture pulled from a public test-data repo; the pure-Windows commands (`dir`, `schtasks`, `robocopy`) were checked against Microsoft's documented syntax and known parsing behavior rather than live-executed, since no Windows environment was available to run them in.

## v3.2 - Inline copy buttons, card height fix, light mode contrast pass

* **Copy button moved into the command block**: previously `.copy-btn` sat in `.card-top`, next to the command title, separate from the actual example text. Removed it from there and added a small `.copy-btn-inline` button positioned inside the `.example` block itself (absolute, top-right corner), so "copy" now lives directly on the command it copies. `.card-top` no longer needs `display:flex`/`justify-content:space-between` since it's just the title now; `.example` gained `position:relative` and extra right padding (`8px 34px 8px 10px`) so the button doesn't overlap wrapped command text.
* **Fixed inflated card heights**: `.cards` is a CSS grid (`repeat(auto-fill, minmax(300px, 1fr))`) and grid items default to `align-items:stretch`, so every card in a row was forced to match the height of the tallest card next to it — most visible in Outlook / PST → Reminders, where the short "Schedule the reminder popup" card (one-line `schtasks` command) was stretched to match the much longer PowerShell popup script beside it, leaving a big empty gap. Added `align-items:start` to `.cards` so each card only takes the height its own content needs. Fixes the effect site-wide, not just that one tier.
* **Light mode contrast pass**: light theme was reusing the same accent hex values tuned for the dark background (`--bg:#0B0E13`), which read too pale against white/near-white panels — several section accent colors (used as text for section-count badges, nav counts, and the "copied" state) were as low as 2.3–4.3:1 against white, and `--muted-2` (use-case notes, tier labels) was 2.9:1. Added a light-mode-only override block for all ten section accents (`--cmd`, `--ps`, `--wsl`, `--unix`, `--setup`, `--reg`, `--outlook`, `--faq`, `--git`, `--docker`) plus `--amber`, each darkened/saturated to clear WCAG AA (~4.5:1, or 3:1 minimum for the large hero heading / logo mark use of `--amber`). Also darkened `--muted-2` (`#8891A0` → `#6C7687`, 2.9:1 → 4.6:1) and deepened `--border`/`--border-soft` (`#DCE1E9`→`#C7CFDA`, `#E7EAF0`→`#DEE3EB`) so card and input outlines are actually visible against the white panel instead of ~1.2:1. Dark mode is untouched — all changes are scoped inside `html[data-theme="light"]`.

## v3.1 - "Third-party & cross-platform recovery" tier for Outlook / PST

* Added a new tier to the Outlook / PST section (5 new entries, 30 total in the section) covering the gap left when scanpst.exe simply can't open a file at all, rather than repairing one it can open: `readpst`/`lspst` (libpst, run from WSL/Linux — extracts mail with an independent parser that often succeeds where Outlook and scanpst both refuse the file, plus a debug mode to see exactly where parsing fails), `pffinfo` (libpff — checks PST encryption type before a repair attempt fails with no useful reason), `esentutl /g` and `/p` (the correct low-level repair path for `.ost` files specifically, since OST is an ESE database and a genuinely different format from PST — calls out that esentutl can't read a real `.pst` at all), and `New-MailboxExportRequest` (Exchange PowerShell — sidesteps a locally unrecoverable PST by pulling a fresh copy straight from the server-side mailbox instead).
* Sits between "Repair (Inbox Repair Tool)" and "Reset & recovery switches" so the flow now reads: look → back up → repair (built-in) → repair/recover (third-party, if built-in can't even open it) → reset → manage profile.
* Updated the section subtitle (`SECTION_META.outlook.sub`) to mention the fallback path. No changes needed to hero stat / section count wiring — both are computed from `DATA.filter(...)`, so the new entries count themselves automatically.

## v3.0 - Fluid container width + tab favicon

* **Layout fix**: `.header-inner`, `.hero`, `.layout`, and `footer` all had `max-width:1280px` hardcoded, so on anything wider than ~1280px (e.g. a 1920px monitor) the page left large fixed margins on both sides regardless of actual screen size. Replaced all four with a single `--container-max: min(1680px, 94vw)` custom property — width now scales with the viewport instead of hard-capping at one breakpoint, while the `1680px` ceiling keeps line lengths and card rows from stretching out uncomfortably on ultrawide/4K displays. The `.cards` grid (`repeat(auto-fill, minmax(300px, 1fr))`) needed no change — it already packs in more columns automatically as its container widens.
* **Missing favicon**: the page had no `<link rel="icon">` at all, so browser tabs fell back to a blank/generic icon. Added an inline SVG favicon as a `data:` URI (no extra file to host) — a dark rounded-square tile with an amber `>` and light `_`, echoing the site's own `> shell //` logo mark.

## v2.9 - Office-hours-aware schedule + clickable backup reminder

* **Schedule fix**: updated "Schedule an automatic recurring backup" to actually reflect office hours (9:30 AM–6:30 PM, closed Sunday) instead of a generic `/sc daily` guess — now `/sc weekly /d MON,TUE,WED,THU,FRI,SAT /st 19:00`, skipping Sunday and running a half-hour after close so Outlook is reliably shut down first.
* **New tier**: added "Reminders" to Outlook / PST (2 entries, 25 total in the section) — a PowerShell popup that doubles as the reminder and the launcher: a Yes/No message box that runs the robocopy backup immediately if Yes is clicked, no separate step to go find the backup command. Second entry schedules that popup script with `schtasks`, timed near end of day (6:15 PM) rather than after hours, since an unattended popup that fires when nobody's logged in never actually gets seen or clicked.

## v2.8 - NAS backup destination with local fallback

* Added 3 entries to the Outlook / PST "Backup to a set location" tier (7 total in the tier, 23 in the section) covering backing up to a network location instead of only a local folder.
* `if exist "%NAS%\" (...) else (...)` batch pattern: checks whether the NAS share is currently reachable before robocopying to it, and drops back to a local folder automatically if not — covers laptops that only see the office NAS on the office network/VPN.
* PowerShell equivalent using `Test-Path` on the UNC path to pick the destination, noted as the more reliable check to script against since it resolves quickly rather than potentially hanging like a full `ping` can when a NAS is off rather than merely unreachable.
* `net use` entry for authenticating to a credentialed NAS share ahead of time — called out specifically because a scheduled task with no interactive session will silently fall back to local every run if the share was never authenticated first.

## v2.7 - "Backup to a set location" tier for Outlook / PST

* Added a dedicated **Backup to a set location** tier to the Outlook / PST section (4 new entries, 20 total in the section), sitting between Diagnose first and Repair so the flow is now look → back up → repair → reset → manage profile.
* Covers: a one-off `copy` to a fixed backup folder; a `robocopy` version using `/B` backup-mode privileges with a timestamped rename so each day's backup is kept instead of overwritten; a PowerShell `Copy-Item` equivalent that bakes today's date into the destination filename; and a `schtasks` example that wraps the robocopy backup in a recurring scheduled task so it runs automatically without needing to be remembered.
* Each entry notes that Outlook locks the PST exclusively while running, so these only work with Outlook closed (or scheduled for a time it reliably is).

## v2.6 - Outlook / PST section (16 commands, 4 tiers)

* **New section**: added "Outlook / PST" as a first-class section, wired the same way as every other section — sidebar button, hero stat (`statOutlook`), section count (`cOutlook`), and a dedicated `--outlook` theme accent color.
* Organized into four tiers matching the actual troubleshooting flow — look, then repair, then reset, then manage profile: **Diagnose first** (finding every PST/OST on the machine, checking file size against the ~50GB Unicode-PST cap, confirming Outlook is fully closed before repair tools will touch a file), **Repair (Inbox Repair Tool)** (locating `scanpst.exe` by Outlook version/bitness, running it directly against a file, backing the PST up first since a repair can discard unreadable items rather than recovering them), **Reset & recovery switches** (`outlook.exe /safe`, `/resetnavpane`, `/cleanviews`, `/cleanreminders`, `/cleanrules`, `/resetfolders`, `/importprf`), and **Profile management** (`control mlcfg32.cpl`, `/profiles`, `/profile "name"`).
* Every entry follows the site's existing card format (description, use case, copyable example, keywords) and is wired into search/`matches()` like every other section.
* Section header carries a short safety note (`SECTION_META.outlook.sub`) about backing up a PST before running the repair tool, since scanpst.exe has no undo.

## v2.5 - Fix double backslash when a drive quick-pick is used in the generator

* **Bug fix**: selecting a drive chip (e.g. `C:`) in the Command Generator produced commands like `dir "C:\\*.pst" /s /b` — a double backslash. The drive picks store their value with a trailing backslash (`"C:\"`, a valid, unambiguous root), but the affected `build()` functions joined `v.path` with a hardcoded `\` before the pattern, assuming the path never ends in one. Typing `C:\Projects` (no trailing slash) worked fine; picking `C:\` did not.
* Added a `winPath()` helper that strips any trailing backslash/slash from a path before it's joined with a hardcoded separator, and applied it at the five spots that do this join: find-by-extension (CMD), find-by-name (CMD), delete-by-extension (CMD and PowerShell), and search-text-in-files (CMD, top-level scope). Both a drive pick and a manually typed path (with or without a trailing slash) now produce a single, correct backslash.
* No behavior changed for tasks that pass `v.path` straight into `-Path "..."` (PowerShell) or as a bare arg (`find`, `du`, `grep -r`, etc.) — those already tolerated a trailing backslash/slash fine and were not touched.

## v2.4 - Registry section (20 commands, 5 tiers)

* **New section**: added "Registry" as a first-class section covering `reg.exe` and the PowerShell registry provider, alongside sidebar button, hero stat (`statReg`), section count (`cReg`), and a dedicated `--reg` theme accent color.
* Organized into five tiers, deliberately ordered with safety first: **Backup & safety** (`reg export`, `reg import`, System Restore checkpoint, full-hive export), **Read & query** (`reg query`, `/s`, `/f` search, `Get-ItemProperty`, `Get-ChildItem`), **Add & modify** (`reg add`, `reg delete`, `Set-ItemProperty`/`New-ItemProperty`, `New-Item`/`Remove-Item`, `reg copy`), **.reg files** (authoring the file format, `regedit /s` silent import, writing a `-delete` .reg file), and **Compare & diagnose** (`reg compare`, `Get-PSDrive` sanity check, reading the Uninstall key for an installed-software audit).
* Every entry follows the site's existing card format (description, use case, copyable example, keywords) and is wired into search/`matches()` the same way as every other section — no separate code path.
* Added a section-level disclaimer (shown in the section header, `SECTION_META.reg.sub`) covering the core registry-editing risks: no Recycle Bin for a bad key change, always export before editing, only run `.reg` files you understand, and prefer a System Restore point before wide-reaching changes.
* Scope note: this section covers reading and modifying Windows configuration via the registry only. It does not include, and will not include, software activation/license-bypass commands or third-party "activator" scripts — those work by circumventing license checks, which is a different category of tool from the documentation-only reference this site provides.

## v2.3 - Fix unclickable drive-letter chips

* **Bug fix**: the drive quick-pick chips added in v2.2 used inline `onclick="onGenQuickPick('path','C:\')"` handlers built with `escapeHtml()`, which only escapes `&`/`<`/`>`. The trailing backslash in `C:\`, `D:\`, `E:\`, `F:\` escaped the closing `'` inside the inline JS string, breaking the attribute's parse and silently no-opping the click — the `C`/`D`/`E`/`F` chips did nothing, while backslash-free chips like "All drives" worked fine. Added a `jsAttr()` helper that escapes backslashes and stray quotes for safe embedding in an inline single-quoted JS string, and swapped it in for the two values passed to `onGenQuickPick`.

## v2.2 - Drive quick-picks in the Command Generator

* **Gap fix**: the "Folder to search" field in every generator task was a plain text box — there was no direct way to target a whole drive (C:, D:, E:, F:) or the entire machine without typing a path by hand. Added a row of quick-pick chips under the field on every task that touches a folder tree: find by extension, find by name, find recently modified, find large files, delete by extension, search text in files, and check folder size.
* CMD/PowerShell tasks get `C:` `D:` `E:` `F:` chips plus an "All drives (entire system)" chip; WSL/Unix tasks get `C:` `D:` `E:` `F:` (mapped to `/mnt/c` etc.) plus a "Whole filesystem (/)" chip. Clicking a chip fills the field instantly and re-generates the command.
* "All drives" isn't just the single-folder command pointed at a drive root — each shell's `build()` now branches to a real system-wide form: PowerShell loops `Get-PSDrive -PSProvider FileSystem` (fully dynamic, no hardcoded letters), CMD loops `for %d in (C D E F G H) do @if exist %d:\ ...` with each drive's existence checked first, and Unix/WSL runs `find /` or `grep -r /` with `2>/dev/null` to swallow permission-denied noise from system folders.
* Deliberately left off the "All drives" / whole-filesystem chip on the delete-by-extension task — it still gets the individual drive-root chips, but a one-click system-wide `del`/`Remove-Item`/`find -delete` felt like the wrong thing to make that easy.
* Added `.gen-drive-picks` / `.gen-drive-chip` styles (reusing existing theme variables) and an `onGenQuickPick()` handler alongside the existing `onGenInput()`.

## v2.1 - Git and Docker sections

* Added Git as a first-class section (27 commands): Basic (`init`, `clone`, `status`, `add`, `commit`, `push`/`pull`, `log`), Useful (`branch`, `checkout -b`, `diff`, `merge`, `stash`, `remote -v`, `.gitignore`, shallow clone), Advanced (`rebase -i`, `cherry-pick`, `bisect`, `blame`, `tag`, `submodule`), and a dedicated "Oh no — undo & recovery" tier (`reset --soft`/`--hard`, `restore`, `revert`, `reflog`, `commit --amend`).
* Added Docker as a first-class section (19 commands): Basic (`run`, `ps`, `stop`/`start`, `images`, `pull`, `exec -it`), Useful (`logs`, `build`, `rm`/`rmi`, `cp`, `network ls`/`volume ls`, `inspect`), Compose (`up`/`down`, `ps`/`logs`, `build`), and Cleanup (`system prune`, `container prune`/`image prune`, `stats`).
* Every new entry follows the site's existing format — description, use case, copyable example, keywords — and both sections got sidebar buttons, hero stats, and section counts wired in the same way as the existing shells.

## v2.0 - Use cases everywhere, WSL/Unix expansion, and a beginner FAQ

* Added a short "Use case" line to all 162 command entries site-wide — a concrete one-line scenario for when you'd actually reach for that command, shown between the description and the example.
* Expanded WSL with a new "Workflow" tier: `code .` (VS Code Remote-WSL), `wsl -e <command>` (run one Linux command without opening a shell), running Linux GUI apps via WSLg, the localhost-works-both-ways behavior, a performance gotcha about working under `/mnt/c` vs the Linux filesystem, and `wsl --status`.
* Expanded grep/sed/awk/find with a new "core utilities" tier: `head`/`tail -f`, `wc -l`, `diff`, `sort | uniq -c`, `grep -o`, `awk NR`/`NF`, and `find -delete`.
* Added a new "FAQ for beginners" section (accordion-style, grouped by Getting oriented / Common errors / Copy, paste & basics / Tools & installs) covering CMD vs PowerShell vs WSL, admin mode, PATH, environment variables, execution policy errors, and more.
* Search now also matches against the new use-case text, not just command/description/example/keywords.

## v1.9 - "Hidden gems" tier for CMD and PowerShell

* Added a new "Hidden gems" tier to both the CMD and PowerShell sections — commands that are gold when you actually need them but obscure the rest of the time.
* CMD: `| clip` (pipe output to clipboard), `where` (locate an exe on PATH), `net user` / `net localgroup` (local users & admin group membership), `schtasks` (scheduled tasks from the command line), `driverquery`, `vssadmin list shadows` (restore points/shadow copies), `attrib` (hidden/system/read-only file attributes), `getmac /v`.
* PowerShell: `Select-String` (built-in grep), `Out-GridView` (interactive filterable table), `Get-HotFix` (installed updates), `Get-LocalUser` / `Get-LocalGroupMember`, `Measure-Command` (benchmarking), `Get-WinEvent` (Event Log queries), `Tee-Object` (split output to file + console), `Test-Connection` (structured, scriptable ping).

## v1.8 - Fully hide "Jump to" label when sidebar is collapsed

* **Bug fix**: collapsing the sidebar re-centered the "Jump to" header and flipped its arrow, but never hid its label text — it clipped down to a truncated "Jum ⌃" instead of disappearing like every other label in the rail. Added `nav.sidebar.collapsed .nav-label .label-text{ display:none; }` so it now hides fully, matching the section buttons below it.

## v1.7 - Ready-made setup script download

* Added a card at the top of the "Bootstrap — do this first" tier in Install & setup linking to a downloadable `Setup.zip` (Setup-NewMachine.bat + .ps1) that automates the whole section: checks all terminals/shells present on the machine, installs Python, Node.js, PowerShell 7, Git, VS Code, Windows Terminal, Docker Desktop, 7-Zip, cURL, gsudo, and WSL via winget (falling back to Chocolatey per-package), and logs status to a local file — so the manual command-by-command walkthrough below it becomes optional.

## v1.6 - Persisted history for the Command Generator

* Every command copied from the generator is now saved to a "Recent commands" list underneath it — task name, shell, full command text, and a relative timestamp (e.g. "3m ago").
* History is stored in `localStorage` (`shellref-gen-history`, capped at 50 entries) so it survives page reloads and browser restarts; nothing leaves the browser.
* Saving happens on copy, not on every keystroke, so the list reflects commands actually used rather than every in-progress edit. Copying the same command again just refreshes its timestamp instead of adding a duplicate.
* Each saved entry has its own `copy` (re-copy that command), `use` (reload it back into the generator with its original task/shell/field values for tweaking), and `✕` (remove) actions, plus a `clear` control to wipe the whole list (confirms first if non-empty).
* Added `.gen-history-*` styles reusing the existing theme variables and shell accent colors, so the panel matches light/dark mode automatically.

## v1.5 - Subfolder scope toggle in the Command Generator

* Added a "Search in" dropdown (This folder + subfolders / This folder only) to every generator task that touches a folder tree: find by extension, find by name, find recently modified, find large files, delete by extension, search text in files.
* Generator now branches its `build()` output per shell so the correct flag is used both ways: `/s` `/b` vs plain `dir`, `-Recurse` vs none, `find` default-recursive vs `-maxdepth 1`, `for /r` loop vs plain `del`, `pushd && findstr /S` vs plain `findstr`, `grep -r` vs `find -maxdepth 1 -exec grep`.
* Added a reusable `SCOPE_PARAM` field definition and a `select`-type field renderer in the generator UI (previously all fields were plain text inputs).

## v1.4 - Fix del /s and findstr /S recursion with explicit paths

* **Bug fix**: `del /s "D:\Folder\*.ext"` (Delete all files with an extension → CMD) recursed from the *current* working directory rather than the path typed in the pattern, so it could report "File Not Found" even when matching files existed in subfolders of the target path. Replaced with a `for /r "path" %f in (*.ext) do @del "%f"` loop, which walks the given path correctly regardless of current directory.
* Same root cause affects `findstr /S` (Search for text inside files → CMD): fixed by wrapping the command in `pushd "path" && findstr /S ... & popd`, so the search runs from inside the target folder.
* Added gotcha notes to the static reference cards for `copy / move / del`, `findstr`, and `mkdir / rmdir` explaining the distinction — `dir /s`, `rmdir /s`, and `forfiles /s` all recurse correctly from an explicit path; `del /s` and `findstr /S` alone do not.

## v1.3 - Better search + command generator

* Added a `kw` (keywords) field to most command entries covering common alternate phrasings and use cases (e.g. "find files by extension", "kill process by name", "check disk space") so search finds a command even when the query doesn't match its literal syntax or description text.
* Rewrote several thin descriptions to explicitly name the task they solve, and added a few missing entries closing real search gaps: `dir *.ext /s /b` and `forfiles /m *.ext /s` in CMD for finding/acting on files by extension, alongside the existing PowerShell (`Get-ChildItem -Filter`) and Unix (`find -name`) equivalents.
* Added a Command Generator: a new sidebar section, separate from the reference list, where you pick a task (find files by extension, find recently modified files, find large files, delete by extension, search text in files, kill a process, find what's using a port, download a file, check folder size, compress a folder, hash a file), choose a shell (CMD / PowerShell / WSL·Unix), fill in a couple of plain-language fields, and copy the exact generated command.
* Search matching logic extended (`matches()`) to check the new keywords field alongside command, description, example, and tier text.

## v1.2 - Navigation and theming

* Added a floating "jump to top" button that fades in after scrolling and smooth-scrolls back to the top on click.
* Made the sidebar collapsible horizontally — it shrinks to an icon-only rail (dots visible, labels hidden) instead of collapsing the list vertically, toggled from the "Jump to" header.
* Added a light/dark theme toggle in the header. Defaults to the visitor's system preference, remembers the choice via `localStorage`, and applies before first paint to avoid a flash of the wrong theme.
* Reworked color values that were previously hardcoded (header background, code-example blocks, terminal shadow) into theme variables so both light and dark modes render correctly.

## v1.1 - Install & setup section

* Added a fifth reference section, "Install & setup", covering Python, Node.js, Git, VS Code, Windows Terminal, Docker Desktop, and Python virtual environments.
* Added a "Bootstrap — do this first" tier explaining the winget → Microsoft Store → Chocolatey fallback chain, so the one unavoidable browser step (if any) is called out explicitly.
* Updated the sidebar, hero stats, and section rendering logic to include the new section.

## v1.0 - Initial single-file reference

* Built a complete browser-based reference for CMD, PowerShell, WSL, and Unix tools (grep, sed, awk, find, and related process/network commands).
* Organized commands by shell (CMD / PowerShell / WSL / Unix) and by tier (Basic / Useful / Advanced) within each shell.
* Added a search bar filtering by command, description, and example text, plus a sidebar to filter by shell.
* Added copy-to-clipboard on every command card.
* Kept the project as a no-build static site that can be opened directly in a browser.
* Deployed to Cloudflare Pages as `shellref` (live at shellref.pages.dev).
* Added Cloudflare static assets configuration through `wrangler.jsonc` with project name `shellref`.
* Added push helpers: `Push.ps1` and `Push_Launcher.bat`.
* Added this README and changelog for project handoff and future maintenance.
