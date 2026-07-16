#!/usr/bin/env node
'use strict';
/**
 * Export theme zip for handoff.
 *
 * Haravan CLI 1.1.x: `haravan theme export` writes an auto-named zip in the theme root
 * and does NOT accept `--file`. This wrapper:
 *   1) runs export in --root
 *   2) finds the newest .zip in root
 *   3) copies/renames to --out/--file
 *   4) validates PK magic + non-empty size
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    out: path.resolve(process.cwd(), '..', 'final-showcase'),
    file: 'final-theme.zip',
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--root') args.root = path.resolve(argv[++i]);
    else if (value === '--out') args.out = path.resolve(argv[++i]);
    else if (value === '--file') args.file = argv[++i];
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.file.toLowerCase().endsWith('.zip')) args.file += '.zip';
  return args;
}

function usage() {
  console.log(`Usage:
  node final_theme_export.js --root <theme> --file "Brand-final-theme.zip" [--out <dir>]

Notes:
  - Runs: haravan theme export  (cwd = theme root; no --file flag — CLI rejects it)
  - Copies newest theme-root *.zip → --out/--file
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
  const header = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, header, 0, 4, 0);
  fs.closeSync(fd);
  if (header[0] !== 0x50 || header[1] !== 0x4B || header[2] !== 0x03 || header[3] !== 0x04) {
    throw new Error('export zip has invalid magic bytes (not a valid zip file)');
  }
  return zipStat.size;
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

  fs.mkdirSync(args.out, { recursive: true });
  const destPath = path.join(args.out, args.file);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

  const before = new Set(listZips(args.root).map((z) => z.full));
  const beforeNewest = newestZip(args.root);
  const beforeMtime = beforeNewest ? beforeNewest.mtime : 0;

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

  // Prefer a zip created after this run; else newest overall
  let candidate = listZips(args.root).find((z) => z.mtime > beforeMtime + 500) || null;
  if (!candidate) {
    candidate = newestZip(args.root);
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

  console.log('# Final Theme Export');
  console.log(`Theme root: ${args.root}`);
  console.log(`CLI zip:    ${candidate.full}`);
  console.log(`Handoff:    ${destPath}`);
  console.log(`Size:       ${size} bytes`);
  return 0;
}

try {
  process.exitCode = main() ?? 0;
} catch (e) {
  console.error('ERROR: ' + e.message);
  process.exitCode = 1;
}
