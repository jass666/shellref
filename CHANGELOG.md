# Changelog - Command Reference (shellref)

All notable changes to the Command Reference static site, tracked in order.

## v1.0 - Initial single-file reference
- Built `index.html` as a complete browser-based reference for CMD, PowerShell, WSL, and Unix tools (grep, sed, awk, find, and related process/network commands).
- Organized commands by shell (CMD / PowerShell / WSL / Unix) and by tier (Basic / Useful / Advanced) within each shell.
- Added a search bar filtering by command, description, and example text, plus a sidebar to filter by shell.
- Added copy-to-clipboard on every command card.
- Kept the project as a no-build static site that can be opened directly in a browser.
- Deployed to Cloudflare Pages as `shellref` (live at shellref.pages.dev).
- Added Cloudflare static assets configuration through `wrangler.jsonc` with project name `shellref`.
- Added local push helpers: `Push.ps1` and `Push_Launcher.bat`.
- Added this README and changelog for project handoff and future maintenance.

## v1.1 - Install & setup section
- Added a fifth reference section, "Install & setup", covering Python, Node.js, Git, VS Code, Windows Terminal, Docker Desktop, and Python virtual environments.
- Added a "Bootstrap — do this first" tier explaining the winget → Microsoft Store → Chocolatey fallback chain, so the one unavoidable browser step (if any) is called out explicitly.
- Updated the sidebar, hero stats, and section rendering logic to include the new section.

## v1.2 - Navigation and theming
- Added a floating "jump to top" button that fades in after scrolling and smooth-scrolls back to the top on click.
- Made the sidebar collapsible horizontally — it shrinks to an icon-only rail (dots visible, labels hidden) instead of collapsing the list vertically, toggled from the "Jump to" header.
- Added a light/dark theme toggle in the header. Defaults to the visitor's system preference, remembers the choice via `localStorage`, and applies before first paint to avoid a flash of the wrong theme.
- Reworked color values that were previously hardcoded (header background, code-example blocks, terminal shadow) into theme variables so both light and dark modes render correctly.
