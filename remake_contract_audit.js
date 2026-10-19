#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue } = require('./lib/cli-args');
const { findContract, readContract, validateRemakeContract } = require('./lib/remake-contract');

function parseArgs(argv) {
  const args = { root: path.resolve(process.cwd(), '..'), contract: null, final: false, designGate: false, homeCapture: null, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, i, '--root')); i += 1; }
    else if (value === '--contract') { args.contract = path.resolve(readValue(argv, i, '--contract')); i += 1; }
    else if (value === '--final') args.final = true;
    else if (value === '--design-gate') args.designGate = true;
    else if (value === '--home-capture') { args.homeCapture = path.resolve(readValue(argv, i, '--home-capture')); i += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node remake_contract_audit.js --root <theme-root> [--contract <file>] [--final] [--design-gate] [--home-capture <page_inventory.json>]

Validates full-remake evidence, feature preservation, merchant-data policy,
CSS ownership and theme-owned !important usage.

  --design-gate    Phase 0 design gate: every designDefaults token key, the home section budget
                   (registry/home-structure.json) and deliverables/reference/*.json are required.
                   A contract that already carries any token key is gated without this flag.
  --home-capture   anti.inspect.page_inventory result of the live home page; its section order
                   must follow designDefaults.homeSectionOrder (HOME_ORDER_MISMATCH).`);
}

function main(customArg) {
  let args;
  if (typeof customArg === 'string') {
    args = { root: path.resolve(customArg), contract: null, final: false, designGate: false, homeCapture: null, help: false };
  } else if (Array.isArray(customArg)) {
    args = parseArgs(customArg);
  } else {
    args = parseArgs(process.argv);
  }
  if (args.help) return usage();
  const contractPath = findContract(args.root, args.contract);
  if (!fs.existsSync(contractPath)) throw new Error(`Missing full remake contract: ${contractPath}`);
  const contract = readContract(contractPath);
  const findings = validateRemakeContract(args.root, contract, { final: args.final, designGate: args.designGate, homeCapturePath: args.homeCapture });
  console.log('# Full Remake Contract Audit');
  console.log(`Root: ${args.root}`);
  console.log(`Contract: ${contractPath}`);
   console.log(`Mode: ${args.final ? 'final' : 'static'}`);

  const allowlists = contract.allowlists || {};
  const allowlistRows = [];
  for (const [category, entries] of Object.entries(allowlists)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry === 'object' && entry !== null) {
        const target = entry.file ? `${entry.file}${entry.line ? ':' + entry.line : ''}${entry.contains ? ' ("' + entry.contains + '")' : ''}` : (entry.setting ? `setting:${entry.setting}` : category);
        const reasonStr = entry.reason ? ` — reason: ${entry.reason}` : '';
        allowlistRows.push(`- [${category}] ${target}${reasonStr}`);
      } else if (typeof entry === 'string') {
        allowlistRows.push(`- [${category}] ${entry}`);
      }
    }
  }
  if (allowlistRows.length > 0) {
    console.log(`Allowlists: ${allowlistRows.length}`);
    for (const row of allowlistRows) console.log(row);
  }

  console.log(`Findings: ${findings.length}`);
  for (const finding of findings) console.log(`- ${finding}`);
  if (findings.length) {
    process.exitCode = 1;
    return 1;
  }
  console.log('PASS: full remake contract clear.');
  return 0;
}

if (require.main === module) {
  try {
    const code = main();
    if (code) process.exit(code);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main
};
