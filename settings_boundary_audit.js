#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { walkTheme } = require('./lib/theme-walk');
const { readValue, normalizeEnum } = require('./lib/cli-args');
const { shouldFail } = require('./lib/findings');
const { printFindingsTable } = require('./lib/report');

function parseArgs(argv) {
  const args = { root: path.resolve(process.cwd(), '..'), failOn: 'blocker', help: false, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, i, '--root')); i += 1; }
    else if (value === '--fail-on') { args.failOn = normalizeEnum(readValue(argv, i, '--fail-on'), '--fail-on', ['blocker', 'warn']); i += 1; }
    else if (value === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function collectSettingsKeys(settingsHtml) {
  const keys = new Set();
  for (const match of settingsHtml.matchAll(/settings\.([a-zA-Z0-9_]+)/g)) keys.add(match[1]);
  for (const match of settingsHtml.matchAll(/\b(?:name|id|key|setting)\s*=\s*["'][^"']*?([a-zA-Z0-9_:-]+)[^"']*?["']/g)) keys.add(match[1]);
  return keys;
}

function collectSectionSchemaKeys(text, file, findings, root) {
  const keys = new Set();
  const schemaMatch = text.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!schemaMatch) return keys;
  try {
    const schema = JSON.parse(schemaMatch[1].trim());
    for (const s of (schema.settings || [])) { if (s.id) keys.add(s.id); }
    for (const block of (schema.blocks || [])) {
      for (const s of (block.settings || [])) { if (s.id) keys.add(s.id); }
    }
  } catch (error) {
    findings.push({
      severity: 'warn',
      rule: 'SCHEMA_PARSE_ERROR',
      location: path.relative(root, file),
      message: `Section schema JSON parse failed: ${error.message}`
    });
  }
  return keys;
}

function collectSettingReferences(text) {
  const keys = new Set();
  for (const match of text.matchAll(/(?<!section\.)settings\.([a-zA-Z0-9_]+)/g)) keys.add(match[1]);
  for (const match of text.matchAll(/(?<!section\.)settings\[['"]([a-zA-Z0-9_:-]+)['"]\]/g)) keys.add(match[1]);
  return keys;
}

function usage() {
  console.log(`Usage:
  node settings_boundary_audit.js [--root <theme-root>] [--fail-on blocker|warn]

Options:
  --root <path>      Theme root. Default: parent of cwd.
  --fail-on <level>  Exit 1 on blocker (default) or warn.
  --dry-run          Report findings but always exit 0.
`);
}

function main() {
  let args;
  try { args = parseArgs(process.argv); } catch (e) { console.error('ERROR: ' + e.message); usage(); process.exit(1); }
  if (args.help) { usage(); return; }
  const settingsPath = path.join(args.root, 'config', 'settings.html');
  const findings = [];

  if (!fs.existsSync(settingsPath)) {
    findings.push({
      severity: 'blocker',
      rule: 'SETTINGS_HTML_MISSING',
      location: 'config/settings.html',
      message: 'settings.html not found.'
    });
  }

  let availableKeys = new Set();
  if (fs.existsSync(settingsPath)) {
    const settingsHtml = fs.readFileSync(settingsPath, 'utf8');
    availableKeys = collectSettingsKeys(settingsHtml);
  }

  const files = walkTheme(args.root, {
    dirs: ['assets', 'layout', 'snippets', 'templates'],
    ext: /\.(liquid|js)$/i
  });

  const allSectionKeys = new Set();
  const references = new Map();

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const key of collectSectionSchemaKeys(text, file, findings, args.root)) allSectionKeys.add(key);
    for (const key of collectSettingReferences(text)) {
      if (!references.has(key)) references.set(key, []);
      references.get(key).push(file);
    }
  }

  for (const [key, locations] of references) {
    if (!availableKeys.has(key)) {
      findings.push({
        severity: 'blocker',
        rule: 'MISSING_SETTINGS_BOUNDARY',
        location: locations[0].replace(args.root + path.sep, ''),
        message: `settings.${key} used in code but not found in config/settings.html`
      });
    }
  }

  for (const key of availableKeys) {
    if (!references.has(key) && key.length > 2) {
      findings.push({
        severity: 'warn',
        rule: 'ORPHAN_SETTING',
        location: 'config/settings.html',
        message: `settings.${key} defined in settings.html but not referenced in theme code`
      });
    }
  }

  console.log('# Settings Boundary Audit');
  console.log(`Root: ${args.root}`);
  console.log(`settings.html fields: ${availableKeys.size}`);
  console.log(`settings keys used (global): ${references.size}`);
  console.log(`section schema keys found: ${allSectionKeys.size}`);
  console.log(`Findings: ${findings.length}`);
  if (findings.length) {
    console.log('');
    printFindingsTable(findings);
  }

  const fail = !args.dryRun && shouldFail(findings, args.failOn);
  if (args.dryRun && findings.length) console.log('(dry-run: exit suppressed)');
  if (fail) process.exit(1);
  console.log('');
  console.log('PASS: no findings at selected fail level.');
}

try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
