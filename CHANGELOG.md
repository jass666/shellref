# Changelog - Command Reference (shellref)

All notable changes to the Command Reference static site, tracked in order.

## v2.10 - Fluid container width + tab favicon

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

* Built `index.html` as a complete browser-based reference for CMD, PowerShell, WSL, and Unix tools (grep, sed, awk, find, and related process/network commands).
* Organized commands by shell (CMD / PowerShell / WSL / Unix) and by tier (Basic / Useful / Advanced) within each shell.
* Added a search bar filtering by command, description, and example text, plus a sidebar to filter by shell.
* Added copy-to-clipboard on every command card.
* Kept the project as a no-build static site that can be opened directly in a browser.
* Deployed to Cloudflare Pages as `shellref` (live at shellref.pages.dev).
* Added Cloudflare static assets configuration through `wrangler.jsonc` with project name `shellref`.
* Added local push helpers: `Push.ps1` and `Push_Launcher.bat`.
* Added this README and changelog for project handoff and future maintenance.
