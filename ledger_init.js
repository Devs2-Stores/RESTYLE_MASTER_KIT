#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue } = require('./lib/cli-args');

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, i, '--root')); i += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node ledger_init.js --root <theme-root>

Initializes deliverables/RESTYLE_PROGRESS_LEDGER.md from the canonical template
if and only if no progress ledger exists yet. Never overwrites existing ledgers.`);
}

function findExistingLedger(root) {
  const candidates = [
    path.join(root, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'),
    path.join(root, 'RESTYLE_PROGRESS_LEDGER.md'),
    path.join(root, 'deliverables', 'ledger.md')
  ];
  return candidates.find((f) => fs.existsSync(f));
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return 0;
  }

  const existing = findExistingLedger(args.root);
  if (existing) {
    console.log(`SKIP: Progress ledger already exists at ${path.relative(args.root, existing)}`);
    return 0;
  }

  const templatePath = path.join(__dirname, 'RESTYLE_PROGRESS_LEDGER.template.md');
  if (!fs.existsSync(templatePath)) {
    console.error(`ERROR: Template file not found: ${templatePath}`);
    return 1;
  }

  const content = fs.readFileSync(templatePath, 'utf8');
  const targetDir = path.join(args.root, 'deliverables');
  const targetFile = path.join(targetDir, 'RESTYLE_PROGRESS_LEDGER.md');

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log(`CREATED: ${path.relative(process.cwd(), targetFile)}`);
  return 0;
}

try {
  process.exitCode = main() ?? 0;
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
}
