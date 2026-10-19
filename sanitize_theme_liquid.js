#!/usr/bin/env node
'use strict';
/**
 * Strip Haravan CLI (`haravan theme dev`) hot-reload leftover from a theme layout.
 *
 * `haravan theme dev` injects into layout/theme.liquid:
 *   {% comment %}hrv-hot-reload{% endcomment %}
 *   <script>(function(){if(window.__hrvHotReload)return;window.__hrvHotReload=1;
 *   … var ws=new WebSocket("ws://127.0.0.1:<PORT>") … connect();})();</script>
 *
 * The block points at localhost (useless in prod) and is dev noise. Run this
 * BEFORE final:export so the local source is clean (and any subsequent push
 * sends a clean file to the remote that `haravan theme export` downloads from).
 *
 * The exported ZIP is also sanitized post-export by final_theme_export.js as
 * defense-in-depth (works even if remote still holds a stale copy).
 *
 * Usage:
 *   node sanitize_theme_liquid.js --root <theme-root>
 *   node sanitize_theme_liquid.js --file <path-to-theme.liquid>
 */
const fs = require('fs');
const path = require('path');

// Match the <script> block by the __hrvHotReload sentinel (port-agnostic).
// Then the orphan {% comment %}hrv-hot-reload{% endcomment %} marker left after.
const STRIP_PATTERNS = [
  /\s*<script\b[^>]*>[\s\S]*?__hrvHotReload[\s\S]*?<\/script>\s*/gi,
  /\s*\{%[-]?\s*comment\s*[-]?%\}\s*hrv-hot-reload\s*\{%[-]?\s*endcomment\s*[-]?%\}\s*/gi,
];

function parseArgs(argv) {
  const a = { root: null, file: null, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--root') a.root = argv[++i];
    else if (v === '--file') a.file = argv[++i];
    else if (v === '--help' || v === '-h') a.help = true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  return a;
}

function strip(text) {
  let out = text;
  let stripped = false;
  for (const re of STRIP_PATTERNS) {
    if (re.test(out)) {
      stripped = true;
      out = out.replace(re, '\n');
    }
    re.lastIndex = 0;
  }
  if (stripped) out = out.replace(/\n{3,}/g, '\n\n');
  return { text: out, stripped };
}

function sanitizeFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: not found: ${filePath}`);
    return 1;
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const markers = ['__hrvHotReload', 'hrv-hot-reload', '127.0.0.1', 'WebSocket'];
  const hits = markers.map((m) => ({ m, n: (before.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length }));
  const found = hits.filter((h) => h.n > 0);
  if (!found.length) {
    console.log(`OK: no hot-reload marker in ${path.basename(filePath)}`);
    return 0;
  }
  const { text: after, stripped } = strip(before);
  if (!stripped) {
    console.warn(`WARN: markers present but no block matched (manual review): ${filePath}`);
    hits.filter((h) => h.n).forEach((h) => console.warn(`  ${h.m}: ${h.n}`));
    return 2;
  }
  fs.writeFileSync(filePath, after, 'utf8');
  console.log(`sanitized: ${filePath}`);
  hits.filter((h) => h.n).forEach((h) => console.log(`  removed ${h.m}: ${h.n} hit(s)`));
  return 0;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node sanitize_theme_liquid.js --root <theme-root>
  node sanitize_theme_liquid.js --file <path-to-theme.liquid>`);
    return 0;
  }
  let file = args.file;
  if (!file && args.root) file = path.join(args.root, 'layout', 'theme.liquid');
  if (!file) {
    console.error('ERROR: pass --root <theme> or --file <path>');
    return 1;
  }
  return sanitizeFile(file);
}

if (require.main === module) {
  try {
    process.exitCode = main() ?? 0;
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  }
}

module.exports = { strip, sanitizeFile, parseArgs };
