#!/usr/bin/env node
'use strict';
/**
 * Export theme zip for handoff.
 *
 * Default (--local): the zip is built from the theme directories on disk with the
 * same allow-list as theme_package.js; no Haravan CLI, no network.
 * --cli (explicit, remote): `haravan theme export` writes an auto-named zip in the theme
 * root and does NOT accept `--file` (CLI 1.1.x); this wrapper then
 *   1) runs export in --root
 *   2) finds the newest .zip in root
 *   3) copies/renames to --out/--file
 *   4) validates PK magic + non-empty size
 * Every mode ends with the zip allow-list assertion.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { listZipEntries, readZipEntriesWithData, createZip } = require('./lib/zip');
const { readValue } = require('./lib/cli-args');
const { buildPackage, assertZipAllowList } = require('./theme_package');
const { strip: stripHotReload } = require('./sanitize_theme_liquid');

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    out: '',
    file: 'final-theme.zip',
    fileExplicit: false,
    brand: '',
    version: '',
    fromZip: '',
    skipCli: false,
    local: false,
    cli: false,
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--root') args.root = path.resolve(readValue(argv, i++, '--root'));
    else if (value === '--out') args.out = path.resolve(readValue(argv, i++, '--out'));
    else if (value === '--file') { args.file = readValue(argv, i++, '--file'); args.fileExplicit = true; }
    else if (value === '--from-zip') args.fromZip = path.resolve(readValue(argv, i++, '--from-zip'));
    else if (value === '--skip-cli') args.skipCli = true;
    else if (value === '--local') args.local = true;
    else if (value === '--cli') args.cli = true;
    else if (value === '--brand') args.brand = readValue(argv, i++, '--brand');
    else if (value === '--version') args.version = readValue(argv, i++, '--version');
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  // Naming convention: Haravan-<Brand>-<Theme>-<Version>.zip
  // <Version> defaults to vYYYYMMDD-HHmm (local clock) so same-day re-exports never
  // collide. --brand auto-builds the canonical name; --file still wins when explicit.
  if (!args.fileExplicit) {
    const brandName = args.brand || path.basename(args.root).replace(/\s+/g, '-');
    args.file = `Haravan-${brandName}-${args.version || versionStamp()}.zip`;
  }
  if (!args.out) args.out = path.join(args.root, 'final-showcase');
  if (!args.file.toLowerCase().endsWith('.zip')) args.file += '.zip';
  return args;
}

/** Local-clock version stamp: vYYYYMMDD-HHmm (machine TZ = operator TZ). */
function versionStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `v${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function usage() {
  console.log(`Usage:
  node final_theme_export.js --root <theme> --brand <Brand-Theme> [--version <v...>] [--out <dir>] [--local]
  node final_theme_export.js --root <theme> --file "Haravan-Brand-Theme-vYYYYMMDD-HHmm.zip" [--out <dir>]
  node final_theme_export.js --root <theme> --cli [--brand ...]        (explicit remote export)
  node final_theme_export.js --root <theme> --from-zip <existing.zip>

Naming convention: Haravan-<Brand>-<Theme>-<Version>.zip
  - Pass --brand to auto-build the name; --version defaults to vYYYYMMDD-HHmm (local clock)
    so multiple exports in one day never overwrite each other. --file overrides both.

Modes:
  --local (default)  Build the zip from assets/config/layout/locales/snippets/templates of --root.
                     Never starts the Haravan CLI and never touches the network.
  --cli              Run \`haravan theme export\` in --root (downloads the remote theme), then copy the
                     newest zip. Remote export; run it only with explicit approval.
  --from-zip <zip>   Re-validate and copy an existing zip.
  --skip-cli         Copy the newest zip already sitting in --root (no CLI call).

Every mode ends with an allow-list assertion: the zip may only hold members under
assets/config/layout/locales/snippets/templates with allowed extensions; any other member exits 1.
`);
}

function listZips(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /\.zip$/i.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { name, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function newestZip(dir) {
  const files = listZips(dir);
  return files[0] || null;
}

function validateZip(filePath) {
  const zipStat = fs.statSync(filePath);
  if (zipStat.size === 0) {
    throw new Error('export zip is empty (0 bytes)');
  }
  const entries = listZipEntries(filePath).filter((entry) => !entry.endsWith('/'));
  const root = entries.length && entries.every((entry) => entry.split('/')[0] === entries[0].split('/')[0])
    && !['assets', 'config', 'layout', 'locales', 'snippets', 'templates'].includes(entries[0].split('/')[0])
    ? entries[0].split('/')[0]
    : '';
  const normalized = root ? entries.map((entry) => entry.slice(root.length + 1)) : entries;
  if (!normalized.includes('layout/theme.liquid')) throw new Error('export zip missing layout/theme.liquid');
  const hasSettings = normalized.includes('config/settings_schema.json') || normalized.includes('config/settings.html');
  if (!hasSettings) throw new Error('export zip missing config/settings_schema.json or config/settings.html');
  return zipStat.size;
}

/**
 * Scan config/settings_data.json inside a zip for theme-specific CDN URLs:
 * e.g. cdn.hstatic.net/themes/<org>/<themeId>/...
 * Returns { count, keys, urls }
 */
function scanSettingsDataForThemeCdnUrls(zipPath) {
  const result = { count: 0, keys: [], urls: [] };
  if (!fs.existsSync(zipPath)) return result;

  try {
    const entries = readZipEntriesWithData(zipPath);
    const settingsEntry = entries.find((e) =>
      e.name === 'config/settings_data.json' ||
      e.name.endsWith('/config/settings_data.json')
    );
    if (!settingsEntry) return result;

    const text = settingsEntry.text || settingsEntry.data.toString('utf8');
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      return result;
    }

    const cdnRegex = /(?:https?:)?\/\/cdn\.hstatic\.net\/themes\/[^\s"'/]+\/[^\s"'/]+/i;

    function walk(obj, prefix = '') {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string') {
          if (cdnRegex.test(v)) {
            result.count += 1;
            result.keys.push(fullKey);
            result.urls.push(v);
          }
        } else if (typeof v === 'object' && v !== null) {
          walk(v, fullKey);
        }
      }
    }

    walk(data);
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// Strip Haravan CLI hot-reload leftover from layout/theme.liquid inside the
// exported ZIP. `haravan theme export` downloads the *remote* published theme,
// which may still carry the hot-reload block from a prior `haravan theme dev`
// session. The archive is read and rewritten in-process (the path is only ever an
// argument, never embedded in a script, so non-ASCII theme folders work) and is
// left untouched when the block is absent.
function sanitizeZipThemeLiquid(zipPath) {
  const entries = readZipEntriesWithData(zipPath);
  const target = entries.find((entry) => entry.name === 'layout/theme.liquid' || entry.name.endsWith('/layout/theme.liquid'));
  if (!target) {
    console.log('hot-reload: no layout/theme.liquid entry; skip');
    return false;
  }
  const { text, stripped } = stripHotReload(target.data.toString('utf8'));
  if (!stripped) {
    console.log('hot-reload: absent; clean');
    return false;
  }
  target.data = Buffer.from(text, 'utf8');
  createZip(entries.map(({ name, data }) => ({ name, data })), zipPath);
  console.log(`hot-reload: stripped from ${target.name}`);
  return true;
}

function resolveSource(args) {
  if (args.local && args.cli) throw new Error('--local and --cli are mutually exclusive');
  if (args.fromZip) return 'existing-zip';
  if (args.cli) {
    const cliDisabled = args.skipCli || process.env.HARAVAN_CLI_CMD === 'skip' || process.env.HARAVAN_CLI_CMD === 'none';
    return cliDisabled ? 'existing-zip' : 'cli';
  }
  return args.skipCli ? 'existing-zip' : 'local';
}

function exportFromExistingZip(args, source) {
  fs.mkdirSync(args.out, { recursive: true });
  const destPath = path.join(args.out, args.file);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

  const before = new Set(listZips(args.root).map((z) => z.full));
  const beforeNewest = newestZip(args.root);
  const beforeMtime = beforeNewest ? beforeNewest.mtime : 0;

  if (source === 'cli') {
    const cli = process.env.HARAVAN_CLI_CMD || 'haravan';
    // CLI: no --file support (verified Haravan CLI 1.1.x, 2026-07-15)
    const result = spawnSync(cli, ['theme', 'export'], {
      cwd: args.root,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (result.error) {
      console.error(`ERROR: failed to run ${cli}: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) return result.status || 1;
  }

  let candidate = null;
  if (args.fromZip) {
    if (!fs.existsSync(args.fromZip)) {
      console.error(`ERROR: specified --from-zip does not exist: ${args.fromZip}`);
      return 1;
    }
    candidate = {
      name: path.basename(args.fromZip),
      full: path.resolve(args.fromZip),
      mtime: fs.statSync(args.fromZip).mtimeMs
    };
  } else {
    // Prefer a zip created after this run; else newest overall
    candidate = listZips(args.root).find((z) => z.mtime > beforeMtime + 500) || null;
    if (!candidate) {
      candidate = newestZip(args.root);
    }
  }
  if (!candidate) {
    console.error('ERROR: export finished but no zip artifact was found in theme root.');
    return 1;
  }
  if (before.has(candidate.full) && candidate.mtime <= beforeMtime + 500) {
    console.warn(`WARN: using existing zip (mtime not newer): ${candidate.name}`);
  }
  fs.copyFileSync(candidate.full, destPath);
  let size;
  try {
    size = validateZip(destPath);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    return 1;
  }

  // Defense-in-depth: strip Haravan hot-reload from the exported zip's
  // layout/theme.liquid (remote may still hold a stale dev copy).
  sanitizeZipThemeLiquid(destPath);

  try {
    assertZipAllowList(destPath);
  } catch (e) {
    fs.unlinkSync(destPath);
    console.error(`ERROR: ${e.message}`);
    return 1;
  }

  // Move raw CLI export zip out of theme root into raw/ subfolder to avoid cluttering handoff
  try {
    const rawDir = path.join(args.out, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    const rawDest = path.join(rawDir, candidate.name);
    if (path.resolve(candidate.full) !== path.resolve(destPath)) {
      if (path.resolve(candidate.full) !== path.resolve(rawDest)) {
        if (fs.existsSync(rawDest)) fs.unlinkSync(rawDest);
        fs.renameSync(candidate.full, rawDest);
        console.log(`Moved raw CLI export: ${candidate.name} -> ${rawDest}`);
      }
    }
  } catch (moveErr) {
    console.warn(`WARN: could not move raw CLI export to raw/: ${moveErr.message}`);
  }

  return { destPath, size, sourceZip: candidate.full };
}

function exportLocal(args) {
  fs.mkdirSync(args.out, { recursive: true });
  const destPath = path.join(args.out, args.file);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  buildPackage(args.root, args.out, args.file);
  const size = validateZip(destPath);
  return { destPath, size, sourceZip: '(built locally from theme directories)' };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return 0;
  }

  if (!fs.existsSync(args.root) || !fs.existsSync(path.join(args.root, 'layout'))) {
    console.error(`ERROR: theme root looks invalid: ${args.root}`);
    return 1;
  }

  const source = resolveSource(args);
  let outcome;
  if (source === 'local') {
    try {
      outcome = exportLocal(args);
    } catch (e) {
      console.error(`ERROR: ${e.message}`);
      return 1;
    }
  } else {
    outcome = exportFromExistingZip(args, source);
    if (typeof outcome === 'number') return outcome;
  }
  const { destPath, size, sourceZip } = outcome;

  // Portability scan: detect hardcoded theme-specific CDN URLs in config/settings_data.json
  const cdnReport = scanSettingsDataForThemeCdnUrls(destPath);
  if (cdnReport.count > 0) {
    console.warn(`\nPORTABILITY WARNING: config/settings_data.json contains ${cdnReport.count} theme-specific CDN URL(s):`);
    console.warn(`Keys: ${cdnReport.keys.join(', ')}`);
    console.warn('Recommendation: hardcoded cdn.hstatic.net/themes/<org>/<themeId>/ URLs reduce portability across stores/themes.');
  }

  console.log('# Final Theme Export');
  console.log(`Mode:       ${source}`);
  console.log(`Theme root: ${args.root}`);
  console.log(`Source zip: ${sourceZip}`);
  console.log(`Handoff:    ${destPath}`);
  console.log(`Size:       ${size} bytes`);
  console.log('PASS: export zip contains only allow-listed theme members');
  if (cdnReport.count > 0) {
    console.log(`CDN report: ${cdnReport.count} theme-specific CDN URL(s) detected (keys: ${cdnReport.keys.join(', ')})`);
  }
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
  scanSettingsDataForThemeCdnUrls,
  parseArgs,
  validateZip,
  resolveSource,
  sanitizeZipThemeLiquid,
  main
};
