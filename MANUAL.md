# Manual: Adding Content to shellref

This is the step-by-step guide for the two things you'll do most often:
adding a new command, and adding a whole new category. If you just want the
short version, the top of `js/data.js` and `js/sections.js` both carry the
same instructions inline — this document has the fuller walkthrough plus
copy-paste templates.

No build step is involved in either task. Edit the file, save, refresh the
page (or push and let Cloudflare Pages/Netlify redeploy).

---

## 1. Adding a new command

**File to edit: `js/data.js`. Nothing else.**

Every command is one object inside the `DATA` array. Copy an existing entry
near the bottom of the array and change the fields:

```js
{
  s:    'files',                          // section key — see the list below
  t:    'Everyday file ops',              // tier/subheading shown above the card
  sh:   'powershell',                     // OPTIONAL shell badge
  cmd:  'Copy-Item a b -Recurse',         // command shown as the card title
  desc: 'What it does, briefly.',
  use:  'OPTIONAL — when you would actually reach for this.',
  ex:   'Copy-Item C:\\a C:\\b -Recurse', // example invocation in the copy box
  kw:   'copy files recursive'            // OPTIONAL extra search keywords
},
```

### Field-by-field

| Field | Required? | What it does |
|---|---|---|
| `s` | Yes | Which category the card lives in. Must exactly match a key in `SECTION_META` (`js/sections.js`) — see the full list below. |
| `t` | Yes | The subheading ("tier") the card is grouped under within its section, e.g. `'Basic'`, `'Everyday file ops'`, `'Process control'`. Reuse an existing tier name from a card already in that section unless you're deliberately introducing a new subgroup (see [Adding a new tier](#adding-a-new-tier-inside-an-existing-section) below). |
| `sh` | No | One of `'cmd'`, `'powershell'`, or `'unix'`. Adds a small colored shell badge to the card. Omit it for commands that only make sense in one context anyway (Git, Docker, Registry commands don't get a badge — the whole section is already shell-specific). |
| `cmd` | Yes | The bold title line of the card — usually the command itself, sometimes a short description if the "command" is really a short recipe (see existing Disk Cleanup cards for examples of multi-line recipes titled descriptively). |
| `desc` | Yes | One or two sentences explaining what it does. This is searched, so mention the actual behavior, not just a restatement of the title. |
| `use` | No | "Use case" line — when you'd actually reach for this over the alternatives. Very useful for search since people often search by symptom ("stuck import", "wrong thumbnails") rather than by command name. |
| `ex` | Yes | The exact text that appears in the copy box and gets copied when the person clicks "copy". Use real values (a real path, a real flag) rather than a bare template unless the command is generic. If it's a URL, it renders as a clickable link automatically — no markup needed. |
| `kw` | No | Extra words for search that aren't already naturally present in `cmd`/`desc`/`ex`/`t`. Useful for symptom-based phrasing, common misspellings, or a well-known alternate name for the same tool. |

### Current section keys (`s` field)

```
setup, apps, files, procs, netops, search, dataproc, scripting,
useradmin, sysdiag, wsl, git, docker, reg, outlook, troubleshoot, cleanup
```

(The authoritative list always lives in `SECTION_META` in `js/sections.js` —
check there if this manual ever gets out of sync with the code.)

### That's it

You don't need to touch the sidebar, update a count anywhere, or edit any
HTML. The sidebar count, the "All commands" combined view (if the section is
listed in `ALL_VIEW_SECTIONS`), and search all read directly from `DATA` at
load time.

### Adding a new tier inside an existing section

Tiers (the `t` field) are grouped and ordered by a big priority list inside
`render()` in `js/app.js` (search for `const order = [`). If you introduce a
brand new tier name that isn't already in that list, it will still render —
it just falls to the end of its section, sorted alphabetically along with any
other unlisted tiers. If you want it to appear in a specific position instead
(e.g. right after "Basic"), add its exact string to that `order` array in the
right spot. This is the one place tier ordering is still centrally listed
rather than derived — it's a display-order preference, not per-item data, so
it stays in the render function.

---

## 2. Adding a new category

**Files to edit: `js/sections.js`, `css/styles.css`, and `js/data.js`.**

Three short steps.

### Step 1 — register the category

Open `js/sections.js` and add one entry to `SECTION_META`:

```js
const SECTION_META = {
  files: { ... },
  procs: { ... },
  // ...existing entries...

  mycat: {
    label: 'My New Category',
    color: 'var(--mycat)',
    sub: 'One sentence describing what this category covers, shown under the section heading.'
  },
};
```

The object key (`mycat` above) is the category's internal id — lowercase,
no spaces, this is what you'll use as the `s` field on `DATA` items. `label`
is the human-readable name shown in the sidebar and section header. `sub` is
the description shown under the heading when someone opens that section.

### Step 2 — give it a color

Open `css/styles.css` and add a `--mycat` color pair in **two** places —
once for dark mode, once for light mode — matching the pattern of an
existing category. Search for `--files:` to find both spots quickly:

```css
/* around line 19-35, inside :root{ } — dark theme (default) */
:root{
  ...
  --files:#6C8EBF;
  --mycat:#8A9EF0;   /* add your color here */
  ...
}

/* around line 59-74, inside html[data-theme="light"]{ } — light theme */
html[data-theme="light"]{
  ...
  --files:#4977BA;
  --mycat:#5568D0;   /* a darker/more-saturated variant for light backgrounds */
  ...
}
```

Two separate values are needed because the light-theme values are
specifically darkened/saturated versions of the dark-theme ones so they still
clear WCAG AA contrast (4.5:1) against a white panel — copying the same hex
into both spots will likely look washed-out in light mode. If you're not
sure what to pick, run your dark-mode hex through a contrast checker against
white (`#FFFFFF`) and darken/saturate until it clears 4.5:1.

### Step 3 — tag some commands

In `js/data.js`, set `s: 'mycat'` on any `DATA` entries that belong to the
new category (new entries or existing ones you're moving over).

### Optional — include it in "All commands"

By default, a brand-new category will **not** appear in the combined "All
commands" view — only in its own sidebar entry. This matches existing
categories like Git, Docker, and Registry, which are also sidebar-only.

If you want the new category included in "All commands" too, add its key to
`ALL_VIEW_SECTIONS` in `js/sections.js`:

```js
const ALL_VIEW_SECTIONS = ['files','procs','netops','search','dataproc',
  'scripting','useradmin','sysdiag','wsl','setup','apps','mycat'];
```

### What happens automatically

Once steps 1–3 are done, refresh the page and the new category:

- Appears as a sidebar button, in **alphabetical order** among the
  non-pinned entries (only `setup` and `generator` are pinned to the top,
  followed by the "All commands" divider — everything else, including your
  new category, sorts alphabetically by `label`).
- Shows a live count of how many `DATA` items are tagged with it.
- Gets its own section header and description (from `sub`) when opened.
- Is searchable and filterable exactly like every other category.
- Shows up automatically in the Command Generator's category list (Browse
  mode), if you later add generator recipes for it.

No sidebar HTML, no JavaScript event wiring, and no count-tracking code
needs to be touched.

---

## 3. Verifying your changes didn't break anything

There's no build step, but it's worth a quick sanity check before pushing,
especially after editing `js/data.js` by hand (a missing comma or unmatched
quote there will break the whole page since it's one JS array literal).

**Quickest check — open it in a browser:**
1. Open `index.html` directly, or serve the folder locally
   (`python3 -m http.server` from inside the project folder, then visit
   `http://localhost:8000`).
2. Open the browser's DevTools console (F12). A syntax error in `data.js`
   will show up immediately as a red error and the page will render mostly
   blank (no sidebar, no cards).
3. Click through: your new/edited command should appear under the right
   section, with the right shell badge (if any), and be findable via the
   search bar.

**If you have Node.js installed, a faster check without opening a browser:**

```bash
node --check js/data.js
node --check js/sections.js
node --check js/generators.js
node --check js/app.js
```

Each should print nothing and exit cleanly — that confirms the JavaScript
itself is syntactically valid (it won't catch a wrong section key, but it
will catch a broken comma/quote/brace in `data.js`, which is the far more
common mistake when hand-editing a big data array).

---

## Quick reference: file → what it's for

| File | Edit this when... |
|---|---|
| `js/data.js` | Adding, editing, or removing a command. |
| `js/sections.js` | Adding a new category, changing a category's name/description, or changing which categories appear in "All commands". |
| `css/styles.css` | Giving a new category a color, or changing the visual theme. |
| `js/generators.js` | Adding a new Command Generator recipe (a guided, fill-in-the-blanks command builder) — this is a more involved change than adding a reference card; look at an existing entry in the `GENERATORS` array as a template. |
| `js/app.js` | Changing how cards are rendered, search behavior, the sidebar mechanics, or the theme toggle. Rarely needed for content changes. |
| `index.html` | Changing the page's static structure (header, hero copy, footer text). Never needed just to add content. |
