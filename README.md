# Command Reference (shellref)

Static reference site for CMD, PowerShell, WSL, and Unix tools (grep, sed, awk, find). The page is intended as a fast browser-based cheat sheet, not a generated app or documentation site.

Live at: **shellref.pages.dev**

## What it is

A small set of plain files: markup, styling, content (the command data), and JavaScript (search, filter, the sidebar, and the command generator). There is still no build step, package manager, backend, or bundler — it deploys to Cloudflare Pages / Netlify exactly as-is, as static files.

The Cloudflare project is configured in `wrangler.jsonc` with the project name `shellref`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup only — head, header, hero, sidebar shell, footer. No command data or app logic lives here. |
| `css/styles.css` | All styling, including the dark/light theme color variables. |
| `js/data.js` | **The command data.** `DATA` (all command cards) and `FAQ_DATA` (the FAQ tab). This is the file you touch to add, edit, or remove a command — see the comment at the top of the file for the exact shape of an entry. |
| `js/sections.js` | **The category registry.** `SECTION_META` (label/color/description per category) and `buildNavConfig()`, which generates the sidebar's button order automatically. This is the file you touch to add a new category. |
| `js/generators.js` | The Command Generator tab: the interactive recipe builder, the "browse & fill in the blanks" mode, the multi-command combine list, and the FAQ tab renderer. |
| `js/app.js` | Core app: search/filter, card rendering, the sidebar (built from `sections.js`), theme toggle, and the hero terminal typer. |
| `MANUAL.md` | Step-by-step guide for adding a new command or category, with copy-paste templates. |
| `wrangler.jsonc` | Cloudflare static assets configuration |
| `.gitignore` | Ignore rules |
| `Push.ps1` | Force-push helper |
| `Push_Launcher.bat` | One-click launcher for `Push.ps1` |

## Adding content

See **[MANUAL.md](./MANUAL.md)** for the full step-by-step guide (with templates) on adding a command or a new category. Short version:

**A new command** — add one object to the `DATA` array in `js/data.js`. Copy an existing entry as a template; the comment at the top of that file explains every field. Nothing else needs to change — the sidebar count, the "All commands" view (if applicable), and search all pick it up automatically.

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

## Tech stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS (custom properties for theming) |
| Interactivity | Vanilla JavaScript, plain `<script>` tags (no bundler) |
| Hosting | Cloudflare Pages |
