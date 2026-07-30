# Command Reference (shellref)

Single-file static reference site for CMD, PowerShell, WSL, and Unix tools (grep, sed, awk, find). The page is intended as a fast browser-based cheat sheet, not a generated app or documentation site.

Live at: **shellref.pages.dev**

## What it is

Everything lives in `index.html`: markup, styling, content (the command data), and JavaScript (search + filter). There is no build step, package manager, backend, or external project structure to maintain.

The Cloudflare project is configured in `wrangler.jsonc` with the project name `shellref`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Complete command reference site (CMD / PowerShell / WSL / Unix tools) |
| `wrangler.jsonc` | Cloudflare static assets configuration |
| `.gitignore` | Ignore rules |
| `Push.ps1` | Force-push helper |
| `Push_Launcher.bat` | One-click launcher for `Push.ps1` |

## Deployment

1. Edit `index.html`.
2. Check the affected section (CMD / PowerShell / WSL / Unix) before pushing.
3. Run `Push_Launcher.bat` or `Push.ps1` when the folder should become the GitHub branch state.
4. Cloudflare Pages serves the folder directly as static assets.

## Maintenance notes

- Keep new commands inside the existing single-page structure (the `DATA` array in `index.html`) unless the file becomes hard to navigate.
- When adding a new command, include: the command itself, a one-line description, and a real example — matching the existing card format.
- Slot new entries into the right shell (`cmd` / `powershell` / `wsl` / `unix`) and tier (`Basic` / `Useful` / `Advanced`, or a new tier label for the Unix section) so the sidebar counts and filters stay accurate.
- If public URLs change, update Cloudflare Pages settings and any links outside this folder.
- `Push.ps1` force-pushes the current state. Use it only when this folder is the intended source of truth.

## Tech stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | Inline CSS in `index.html` |
| Interactivity | Vanilla JavaScript |
| Hosting | Cloudflare Pages |
