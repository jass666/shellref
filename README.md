# Command Reference (shellref)

Static reference site for CMD, PowerShell, WSL, and Unix tools (grep, sed, awk, find). It also includes a browser-based command library admin screen so commands can be maintained without editing source code.

Live at: **shellref.pages.dev**

## What it is

A small set of plain files: markup, styling, content (the command data), and JavaScript (search, filter, the sidebar, the command generator, and the library editor). There is no build step, package manager, or bundler. The site works as static files, with an optional Cloudflare D1 backend for shared command editing across devices.

The Cloudflare project is configured in `wrangler.jsonc` with the project name `shellref`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup only — head, header, hero, sidebar shell, footer. No command data or app logic lives here. |
| `css/styles.css` | All styling, including the dark/light theme color variables. |
| `js/data.js` | **The command data.** `DATA` (all command cards) and `FAQ_DATA` (the FAQ tab). This is the file you touch to add, edit, or remove a command — see the comment at the top of the file for the exact shape of an entry. |
| `js/sections.js` | **The category registry.** `SECTION_META` (label/color/description per category) and `buildNavConfig()`, which generates the sidebar's button order automatically. This is the file you touch to add a new category. |
| `js/my-commands.js` | **Your permanent library** — saved commands and File-builder presets, baked in via "Export for repo". |
| `js/mine.js` | Command library admin UI, browser storage, export/import, and saved-command management. |
| `js/backend.js` | Optional API bridge. Hydrates the library from `/api/commands` and mirrors admin edits when the backend is deployed; otherwise it safely falls back to browser storage. |
| `backend/worker.js` | Cloudflare Worker API for shared command records. |
| `backend/schema.sql` | Cloudflare D1 schema for the command library. |
| `backend/README.md` | Backend deployment and API notes. |
| `js/filebuilder.js` | The File builder tab: template registry (.bat/.ps1/.sh, PS1 → BAT launchers, PowerShell menu launchers, Git push, cache cleaner, .gitignore/…), presets, .zip writer. |
| `js/analyzer.js` | The **Analyze file** tab: parses an uploaded script, cross-checks it against `DATA`, lets you remove/add steps and repackage it, and turns library gaps into LLM prompts + a backlog. |
| `js/generators.js` | The Command Generator tab: the interactive recipe builder, the "browse & fill in the blanks" mode, the multi-command combine list, and the FAQ tab renderer. |
| `js/app.js` | Core app: search/filter, card rendering, the sidebar (built from `sections.js`), theme toggle, and the hero terminal typer. |
| `MANUAL.md` | Step-by-step guide for adding a new command or category, with copy-paste templates. |
| `wrangler.jsonc` | Cloudflare static assets configuration |
| `.gitignore` | Ignore rules |
| `Push.ps1` | Force-push helper |
| `Push_Launcher.bat` | One-click launcher for `Push.ps1` |

## Analyze a file (and grow the library from it)

Command generator -> **Analyze file**. Upload or paste a script; each step is checked against the library, risky steps are flagged, and you can remove/add/reorder steps and download the edited file (or a zip with the original and an `ANALYSIS.md`). Missing commands become an LLM prompt; paste the JSON reply back to validate, de-duplicate, and save. Details in `MANUAL.md` section 5.

## Managing commands without source-code edits

Open the **Command library** section in the sidebar. Use **+ Add a command** to enter a command, title, shell, group, notes, and source link. Existing saved commands can be edited or deleted from their cards. The command, notes, and group are searchable, and multi-line scripts are supported.

Use **Export backup** for a portable JSON backup. Use **Import** to merge a backup or a previously exported `my-commands.js`. Use **Export for repo** when the library should become the permanent static copy shipped with the site.

The browser editor works without a server. If the optional `/api/commands` endpoint is available, it hydrates the shared library and mirrors create, edit, and delete actions to the backend. See [`backend/README.md`](./backend/README.md) for the Cloudflare D1 setup.

## Adding built-in content

See **[MANUAL.md](./MANUAL.md)** for the full step-by-step guide (with templates) on adding a command or a new category. Short version:

**A new built-in command** — add one object to the `DATA` array in `js/data.js`. Copy an existing entry as a template; the comment at the top of that file explains every field. For commands that should be managed from the UI instead, add them through **Command library** and export the library rather than editing `DATA`.

**A new category** — three steps, all covered in detail in `MANUAL.md`:
1. Add an entry to `SECTION_META` in `js/sections.js` (label, color, one-line description).
2. Add a matching `--yourcategory` color pair to `:root` and `html[data-theme="light"]` in `css/styles.css` (copy an existing pair, e.g. `--files`, so the color stays readable in both themes).
3. Tag `DATA` items in `js/data.js` with that category's key (the `s` field).

The sidebar button, its position (alphabetical, after the pinned/"All commands" entries), and its count all appear automatically — no HTML to hand-edit. If the new category should also show up under "All commands", add its key to `ALL_VIEW_SECTIONS` in `js/sections.js` (a few categories — Git, Docker, Registry, Outlook, Troubleshooting, Disk Cleanup — are deliberately excluded from that combined view and only reachable from their own sidebar entry).

## Deployment

1. Edit the content (`js/data.js`) or a category (`js/sections.js`) as above.
2. Check the affected section in a browser before pushing.
3. Run `Push_Launcher.bat` or `Push.ps1` when the folder should become the GitHub branch state.
4. Cloudflare Pages / Netlify serves the folder directly as static assets — no build step.
5. For shared backend editing, deploy `backend/worker.js` with `backend/schema.sql`, bind the D1 database as `DB`, set the runtime `ADMIN_EMAIL`, and serve the API at `/api/commands` on the same origin. The backend API is documented in `backend/README.md`.

## Tech stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS (custom properties for theming) |
| Interactivity | Vanilla JavaScript, plain `<script>` tags (no bundler) |
| Hosting | Cloudflare Pages |
| Optional shared storage | Cloudflare Worker + D1 |
