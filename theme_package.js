#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readValue } = require('./lib/cli-args');
const { createZip, listZipEntries } = require('./lib/zip');

const THEME_DIRS = ['assets', 'config', 'layout', 'locales', 'snippets', 'templates'];
const ALLOWED_EXTENSIONS = new Set(['.liquid', '.json', '.html', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.ttf', '.woff', '.woff2', '.eot', '.js', '.css', '.scss', '.sass']);

function parseArgs(argv) {
  const args = { root: '', out: '', file: 'theme-preview.zip', help: false };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, index, '--root')); index += 1; }
    else if (value === '--out') { args.out = path.resolve(readValue(argv, index, '--out')); index += 1; }
    else if (value === '--file') { args.file = readValue(argv, index, '--file'); index += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node theme_package.js --root <theme-root> --out <directory> [--file theme-preview.zip]

Builds a local Haravan theme ZIP for the preview upload checkpoint.
It never invokes Haravan/HRV CLI and never uploads to a remote theme.
`);
}

function walk(root, relative, entries) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return;
  for (const item of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, item.name);
    if (item.isDirectory()) walk(root, child, entries);
    else if (item.isFile()) {
      const normalized = child.replace(/\\/g, '/');
      if (normalized.startsWith('assets/') && normalized.slice('assets/'.length).includes('/')) throw new Error(`assets must be flat for Haravan import: ${normalized}`);
      if (!ALLOWED_EXTENSIONS.has(path.extname(item.name).toLowerCase())) throw new Error(`unsupported theme package file: ${normalized}`);
      const stat = fs.statSync(path.join(root, child));
      entries.push({ name: normalized, data: fs.readFileSync(path.join(root, child)), mtime: stat.mtime });
    }
  }
}

function validateThemeRoot(root) {
  if (!root) throw new Error('--root is required');
  if (!fs.existsSync(path.join(root, 'layout', 'theme.liquid'))) throw new Error(`missing layout/theme.liquid: ${root}`);
  const hasSchema = fs.existsSync(path.join(root, 'config', 'settings_schema.json'));
  const hasSettingsHtml = fs.existsSync(path.join(root, 'config', 'settings.html'));
  if (!hasSchema && !hasSettingsHtml) {
    throw new Error(`missing config/settings_schema.json or config/settings.html: ${root}`);
  }
}

/** Drops a single common wrapper directory that is not itself a theme directory. */
function stripArchiveWrapper(names) {
  const files = names.filter((name) => !name.endsWith('/'));
  if (!files.length) return files;
  const firstParts = files.map((name) => name.split('/')[0]);
  const common = firstParts.every((part) => part === firstParts[0]) ? firstParts[0] : '';
  if (!common || THEME_DIRS.includes(common) || !files.every((name) => name.includes('/'))) return files;
  return files.map((name) => name.slice(common.length + 1));
}

function findAllowListViolations(names) {
  const violations = [];
  for (const name of stripArchiveWrapper(names)) {
    const parts = name.split('/');
    if (parts.some((part) => part === '..' || part === '')) violations.push(`${name} (invalid path)`);
    else if (!THEME_DIRS.includes(parts[0]) || parts.length < 2) violations.push(`${name} (outside ${THEME_DIRS.join('/')})`);
    else if (parts[0] === 'assets' && parts.length > 2) violations.push(`${name} (assets must be flat)`);
    else if (!ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())) violations.push(`${name} (extension not allowed)`);
  }
  return violations;
}

function assertZipAllowList(zipPath) {
  const names = listZipEntries(zipPath);
  if (!names.some((name) => !name.endsWith('/'))) throw new Error(`zip has no files: ${zipPath}`);
  const violations = findAllowListViolations(names);
  if (violations.length) {
    throw new Error(`zip allow-list violation (${violations.length}): ${violations.slice(0, 10).join('; ')}`);
  }
}

function buildPackage(root, outDir, file = 'theme-preview.zip') {
  validateThemeRoot(root);
  if (!outDir) throw new Error('--out is required');
  const zipName = file.toLowerCase().endsWith('.zip') ? file : `${file}.zip`;
  const entries = [];
  for (const directory of THEME_DIRS) walk(root, directory, entries);
  if (!entries.length) throw new Error(`no theme files found: ${root}`);
  const outputPath = path.join(outDir, path.basename(zipName));
  createZip(entries, outputPath);
  const packed = listZipEntries(outputPath);
  if (!packed.includes('layout/theme.liquid')) throw new Error('preview package missing layout/theme.liquid');
  if (!packed.includes('config/settings_schema.json') && !packed.includes('config/settings.html')) {
    throw new Error('preview package missing config/settings_schema.json or config/settings.html');
  }
  assertZipAllowList(outputPath);
  return { outputPath, count: entries.length };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); return; }
  const { outputPath, count } = buildPackage(args.root, args.out, args.file);
  console.log(`PASS: local preview package created (${count} files)`);
  console.log(outputPath);
  console.log('NEXT: request approval, upload this ZIP in Haravan Admin as a draft theme, then record the preview URL.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1); }
}

module.exports = { THEME_DIRS, ALLOWED_EXTENSIONS, buildPackage, findAllowListViolations, assertZipAllowList, stripArchiveWrapper };
