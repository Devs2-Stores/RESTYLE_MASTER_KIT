#!/usr/bin/env node
'use strict';
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
  return args;
}

function usage() {
  console.log(`Usage:
  node final_theme_export.js --root .. --file "project-final-theme.zip" [--out ../final-showcase]
`);
}

function newestZip(dir, requestedFile) {
  const requestedBase = requestedFile.replace(/\.zip$/i, '');
  const files = fs.readdirSync(dir)
    .filter((name) => /\.zip$/i.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { name, full, mtime: fs.statSync(full).mtimeMs };
    })
    .filter((item) => item.name === requestedFile || item.name.startsWith(requestedBase))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0];
}

function normalizeZip(outDir, requestedFile) {
  const requestedPath = path.join(outDir, requestedFile);
  if (fs.existsSync(requestedPath)) return requestedPath;
  const candidate = newestZip(outDir, requestedFile);
  if (!candidate) return '';
  if (candidate.full !== requestedPath) {
    if (fs.existsSync(requestedPath)) fs.unlinkSync(requestedPath);
    fs.renameSync(candidate.full, requestedPath);
  }
  return requestedPath;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return 0;
  }

  fs.mkdirSync(args.out, { recursive: true });
  const requestedPath = path.join(args.out, args.file);
  if (fs.existsSync(requestedPath)) fs.unlinkSync(requestedPath);

  const cli = process.env.HARAVAN_CLI_CMD || 'haravan';
  const result = spawnSync(cli, ['theme', 'export', '--file', requestedPath], {
    cwd: args.root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    console.error(`ERROR: failed to run ${cli}: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) return result.status || 1;

  const finalPath = normalizeZip(args.out, args.file);
  if (!finalPath) {
    console.error('ERROR: export finished but no zip artifact was found.');
    return 1;
  }

  const zipStat = fs.statSync(finalPath);
  if (zipStat.size === 0) {
    console.error('ERROR: export zip is empty (0 bytes).');
    return 1;
  }
  const header = Buffer.alloc(4);
  const fd = fs.openSync(finalPath, 'r');
  fs.readSync(fd, header, 0, 4, 0);
  fs.closeSync(fd);
  if (header[0] !== 0x50 || header[1] !== 0x4B || header[2] !== 0x03 || header[3] !== 0x04) {
    console.error('ERROR: export zip has invalid magic bytes (not a valid zip file).');
    return 1;
  }

  console.log('# Final Theme Export');
  console.log(`Theme root: ${args.root}`);
  console.log(`Zip: ${finalPath}`);
  return 0;
}

try { process.exitCode = main() ?? 0; } catch (e) { console.error('ERROR: ' + e.message); process.exitCode = 1; }
