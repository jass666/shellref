# Changelog - Command Reference (shellref)

All notable changes to the Command Reference static site, tracked in order.

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
