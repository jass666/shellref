/* ==========================================================================
   shellref — section (category) registry
   ==========================================================================
   Every real command category lives in SECTION_META below. This is the
   SINGLE SOURCE OF TRUTH for categories: the sidebar, the "All commands"
   view, the section headers/descriptions, and the Command Generator's
   category list are all built FROM this object — none of them hardcode a
   category list of their own anymore.

   TO ADD A NEW CATEGORY:
     1. Add an entry below, e.g.
          mycat: { label:'My Category', color:'var(--mycat)', sub:'One line describing it.' }
     2. Add a matching --mycat color pair to :root and html[data-theme="light"]
        in css/styles.css (search for an existing one, e.g. --files, and copy
        both the dark and light lines so the color stays readable in both
        themes).
     3. Tag DATA items in js/data.js with s:'mycat'.
     4. If it should appear inside the "All commands" combined view, add its
        key to ALL_VIEW_SECTIONS below (some categories — git, docker, reg,
        outlook, troubleshoot, cleanup — are deliberately left out of the
        combined view and only reachable from their own sidebar entry).
   That's it — the sidebar button, its count, and its position (alphabetical,
   see buildNavConfig() in app.js) all appear automatically. No HTML to edit.
   ========================================================================== */

const SECTION_META = {
  files: {label:'Files, Folders & Storage', color:'var(--files)', sub:'Finding, moving, permissioning, and archiving files and disks — CMD, PowerShell, and Unix side by side, badged by shell.'},
  procs: {label:'Processes, Jobs & Scheduling', color:'var(--procs)', sub:'Starting, stopping, backgrounding, and scheduling work — from a one-off kill to a recurring scheduled task or cron job.'},
  netops: {label:'Networking & Remote Access', color:'var(--netops)', sub:'Checking connectivity, pulling files over the network, and reaching another machine — diagnostics, downloads, and remote sessions in one place.'},
  search: {label:'Search & Pattern Matching', color:'var(--search)', sub:'Finding text inside files — grep, findstr, Select-String, discovering what file types are even present, filtering a search by file type, and modern tools like ripgrep, zgrep, locate, and fzf.'},
  dataproc: {label:'Data Processing', color:'var(--dataproc)', sub:'Viewing and reshaping text once you\'ve found it — type/Get-Content/head/tail, sed/awk, and the sort/uniq/wc/diff utilities.'},
  scripting: {label:'Scripting & Shell Environment', color:'var(--scripting)', sub:'Shell basics, environment variables, pipelines, and small scripting patterns for CMD and PowerShell alike.'},
  useradmin: {label:'Users, Permissions & Policy', color:'var(--useradmin)', sub:'Local accounts, groups, and Group Policy — the day-to-day identity and access-control commands.'},
  sysdiag: {label:'System Info & Hardware', color:'var(--sysdiag)', sub:'Reading back what a machine is made of and how it\'s performing — hardware, drivers, and event/performance data.'},
  wsl: {label:'WSL & Linux Interop', color:'var(--wsl)', sub:'Installing, configuring, and living day-to-day in Windows Subsystem for Linux — plus the Windows↔Linux file and workflow interop tricks.'},
  git: {label:'Git', color:'var(--git)', sub:'Version control commands — from the daily-driver basics to the ones you look up mid-panic during a merge conflict.'},
  docker: {label:'Docker', color:'var(--docker)', sub:'Container and Compose commands — running, inspecting, and cleaning up what Docker Desktop leaves behind.'},
  setup: {label:'Install & setup', color:'var(--setup)', sub:'Getting Python, Node, Git, browsers, and the rest of your dev toolkit onto a fresh machine. One bootstrap step below (winget or Chocolatey) is the gate — once either exists, everything after it runs from the command line with no browser.'},
  apps: {label:'Apps: Install & Remove', color:'var(--apps)', sub:'A focused package-manager cheat sheet for one specific job: finding, installing, and cleanly removing a single app by name — not the fuller machine setup covered in Install & setup. The Command Generator’s "Apps" category builds the find → uninstall flow for you.'},
  reg: {label:'Registry', color:'var(--reg)', sub:'⚠️ Disclaimer: the Windows Registry has no Recycle Bin — an incorrect key change can stop Windows or an installed app from starting. Always export the key you are about to touch first (see the Backup & safety tier below), only run commands or .reg files you understand, and prefer a restore point before wide-reaching changes. These commands read and modify Windows configuration only — this reference does not cover software activation, license bypass, or third-party "activator" scripts.'},
  outlook: {label:'Outlook / PST', color:'var(--outlook)', sub:'One place for the recurring "Outlook is acting up" toolbox — finding and sizing PST/OST files, repairing a damaged PST with the built-in Inbox Repair Tool (or falling through to third-party/cross-platform tools when scanpst can\'t open the file at all), and the startup switches that reset a broken profile or view. Back up a PST before repairing it: scanpst.exe can discard unreadable items rather than recovering them.'},
  troubleshoot: {label:'Troubleshooting & Fixes', color:'var(--troubleshoot)', sub:'The "something on this machine is misbehaving" toolbox — separate from Install & setup, which is only about getting tools onto a fresh machine. Covers driver problems (find, update, remove, reinstall), general Windows repair (corrupted files, disk errors, stuck updates, dead network, frozen Explorer), and killing the Sticky Keys/Filter Keys/Toggle Keys popups on shared shop-floor machines. Clearing temp files and caches has its own Disk Cleanup section.'},
  cleanup: {label:'Disk Cleanup', color:'var(--cleanup)', sub:'Search out and clear every cache/temp bucket Windows piles up on C: — the per-user and system-wide temp folders, the Windows Update download cache, the Delivery Optimization peer-to-peer cache, Prefetch, the Explorer thumbnail cache, and the Recycle Bin — one at a time, or all at once with the Full sweep script.'},
};

// Utility-based sections (files, procs, netops, search, dataproc, scripting, useradmin,
// sysdiag) mix commands from several shells under one task-oriented heading, so
// each card that needs it carries a small shell badge (sh field on the DATA item)
// to show which shell that exact syntax runs in.
const SHELL_COLORS = { cmd:'var(--cmd)', powershell:'var(--ps)', unix:'var(--unix)' };
const SHELL_LABELS = { cmd:'CMD', powershell:'PowerShell', unix:'Unix' };

// Sections combined together under the "All commands" nav entry. (git, docker,
// reg, outlook, troubleshoot, and cleanup are intentionally left out of the
// combined view and are only reachable from their own sidebar entry — add a
// key here if a future category should also show up under "All".)
const ALL_VIEW_SECTIONS = ['files','procs','netops','search','dataproc','scripting','useradmin','sysdiag','wsl','setup','apps'];

// Non-category sidebar destinations that aren't backed by DATA items (no
// per-section count badge, not part of SECTION_META).
const VIRTUAL_NAV_ITEMS = {
  generator: {label:'Command generator', color:'var(--amber)', title:'Command Generator'},
  all:       {label:'All commands',      color:'var(--amber)', title:'All commands'},
  faq:       {label:'FAQ for beginners', color:'var(--faq)',   title:'FAQ for beginners'},
};

// Sidebar keys pinned to the top, in this order, before the alphabetical rest.
const NAV_PINNED = ['setup', 'generator'];
// Where the divider line falls, and what comes right after it.
const NAV_DIVIDER_AFTER = 'generator';
const NAV_FIRST_AFTER_DIVIDER = 'all';

/**
 * Builds the full ordered list of sidebar entries: pinned items, a divider,
 * "All commands", then every remaining category + FAQ sorted alphabetically
 * by label. Adding a category to SECTION_META is enough to have it appear
 * here automatically in the right spot.
 */
function buildNavConfig(){
  const nav = [];
  const meta = key => SECTION_META[key] || VIRTUAL_NAV_ITEMS[key];

  NAV_PINNED.forEach(key=>{
    nav.push({key, ...meta(key), hasCount: !!SECTION_META[key]});
    if(key === NAV_DIVIDER_AFTER) nav.push({divider:true});
  });

  nav.push({key: NAV_FIRST_AFTER_DIVIDER, ...meta(NAV_FIRST_AFTER_DIVIDER), hasCount:true});

  const remainingKeys = [
    ...Object.keys(SECTION_META).filter(k => !NAV_PINNED.includes(k)),
    ...Object.keys(VIRTUAL_NAV_ITEMS).filter(k => !NAV_PINNED.includes(k) && k !== NAV_FIRST_AFTER_DIVIDER),
  ].sort((a,b) => meta(a).label.localeCompare(meta(b).label));

  remainingKeys.forEach(key=>{
    nav.push({key, ...meta(key), hasCount: !!SECTION_META[key]});
  });

  return nav;
}

const VALID_SECTIONS = [
  ...Object.keys(SECTION_META),
  ...Object.keys(VIRTUAL_NAV_ITEMS),
];
