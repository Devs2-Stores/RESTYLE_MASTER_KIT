#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { walkTheme } = require('./lib/theme-walk');

const PROTECTED_UTILITIES = Object.freeze([
  '.hidden',
  '[hidden]',
  '.sr-only',
  '.visually-hidden',
  '.button-content'
]);

function isProtectedUtility(selectorOrClass) {
  if (!selectorOrClass) return false;
  const norm = String(selectorOrClass).trim().toLowerCase();
  for (const util of PROTECTED_UTILITIES) {
    const u = util.toLowerCase();
    if (norm === u) return true;
    if (norm === u.replace(/^\./, '')) return true;
    if (u.startsWith('.') && norm.startsWith(u)) return true;
    if (norm.includes(u)) return true;
  }
  return false;
}
function parseArgs(argv) {
  const args = { root: path.resolve(process.cwd(), '..'), help: false, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--root') args.root = path.resolve(argv[++i]);
    else if (v === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}
function usage() {
  console.log(`Usage:
  node orphan_sweep.js --root <theme-root> [--json]

Tim cac file orphan (khong reference) trong theme:
  - assets/* khong duoc reference qua asset_url, src=, url(), import.
  - snippets/* khong duoc include/render.
  - templates/sections/* khong duoc section trong layout/template.

Protected utilities invariant:
  Cac utility classes duoc bao ve tuyet doi khong bao gio bi danh dau xoa:
  ${PROTECTED_UTILITIES.join(', ')}

Output report. Khong tu xoa file. Agent xem va xoa thu cong.
`);
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) out.push(path.join(dir, entry.name));
    else if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name)));
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); return 0; }
  if (!fs.existsSync(args.root)) { console.error(`ERROR: --root not found`); return 1; }

  // Read every theme code file once.
  const codeFiles = walkTheme(args.root, {
    dirs: ['assets', 'config', 'layout', 'snippets', 'templates'],
    ext: /\.(liquid|js|css|html|json)$/i
  });
  const corpus = codeFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  // Collect candidates.
  const assetDir = path.join(args.root, 'assets');
  const snippetsDir = path.join(args.root, 'snippets');
  const sectionsDir = path.join(args.root, 'templates', 'sections');

  const orphanAssets = [];
  const orphanSnippets = [];
  const orphanSections = [];

  for (const file of listFiles(assetDir)) {
    const base = path.basename(file);
    if (/^(\.|README)/.test(base)) continue;
    // Strip Haravan asset_url suffix .liquid if any.
    const baseName = base.replace(/\.liquid$/, '');
    // Match: 'name.ext' or "name.ext" or url(name.ext) or asset_url
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`);
    if (!re.test(corpus)) orphanAssets.push(path.relative(args.root, file));
  }

  for (const file of listFiles(snippetsDir)) {
    if (!file.endsWith('.liquid')) continue;
    const name = path.basename(file, '.liquid');
    // Match include/render 'name' (with/without quotes)
    const re = new RegExp(`(?:include|render)\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    if (!re.test(corpus)) orphanSnippets.push(path.relative(args.root, file));
  }

  if (fs.existsSync(sectionsDir)) {
    for (const file of listFiles(sectionsDir)) {
      if (!file.endsWith('.liquid')) continue;
      const name = path.basename(file, '.liquid');
      const re = new RegExp(`section\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
      if (!re.test(corpus)) orphanSections.push(path.relative(args.root, file));
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ orphanAssets, orphanSnippets, orphanSections, protectedUtilities: PROTECTED_UTILITIES }, null, 2));
    return 0;
  }
  console.log('# Orphan Sweep');
  console.log(`Root: ${args.root}`);
  console.log(`Code files scanned: ${codeFiles.length}`);
  console.log(`Orphan assets: ${orphanAssets.length} | snippets: ${orphanSnippets.length} | sections: ${orphanSections.length}`);
  console.log(`Protected utilities guarded: ${PROTECTED_UTILITIES.join(', ')}`);
  if (orphanAssets.length) {
    console.log('\n## Orphan assets');
    for (const f of orphanAssets) console.log(`- ${f}`);
  }
  if (orphanSnippets.length) {
    console.log('\n## Orphan snippets');
    for (const f of orphanSnippets) console.log(`- ${f}`);
  }
  if (orphanSections.length) {
    console.log('\n## Orphan sections');
    for (const f of orphanSections) console.log(`- ${f}`);
  }
  console.log('\nNote: heuristic match. Verify before deleting (dynamic concat names may register false positives).');
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main() ?? 0;
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
  }
}

module.exports = {
  PROTECTED_UTILITIES,
  isProtectedUtility,
  main
};
