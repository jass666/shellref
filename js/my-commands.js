/* ==========================================================================
   shellref — your permanent library (lives in the repo)
   ==========================================================================
   Saved commands and File-builder presets are stored in your browser the
   moment you save them. Browser storage can be wiped (clearing site data,
   a new device, a different browser), so this file is the permanent copy.

   TO MAKE EVERYTHING PERMANENT:
     1. Open the site -> "My saved commands" -> "Export for repo".
     2. Replace this file (js/my-commands.js) with the downloaded one.
     3. Run Push_Launcher.bat. Cloudflare Pages redeploys and every device
        now loads your library from this file.

   You can also edit this file by hand; each command needs at least `uid`
   (a unique number, 100000 or higher) and `command`. See MANUAL.md section 3.
   ========================================================================== */

const MY_LIBRARY_FILE = {
  "commands": [],
  "presets": []
};
