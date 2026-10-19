#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue } = require('./lib/cli-args');
const { readPngInfo } = require('./lib/image');
const {
  findContract,
  readContract,
  validateScreens,
  validateFeatures,
  PREVIEW_VERIFIED,
  FINAL_APPROVED
} = require('./lib/remake-contract');

const LANDMARK_RESOLVED = new Set(['matched', 'approved-deviation']);
const FEATURE_RESOLVED = new Set(['preserved', 'approved-deviation']);
const LEDGER_RESOLVED = new Set(['passed', 'done', 'waived']);

class Refusal extends Error {}

function parseArgs(argv) {
  const args = {
    root: '',
    contract: '',
    ledger: '',
    screen: '',
    feature: '',
    preview: '',
    status: '',
    evidence: '',
    ledgerGates: [],
    ledgerStatus: 'passed',
    dryRun: false,
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--dry-run') args.dryRun = true;
    else if (value === '--root') args.root = path.resolve(readValue(argv, i++, '--root'));
    else if (value === '--contract') args.contract = path.resolve(readValue(argv, i++, '--contract'));
    else if (value === '--ledger') args.ledger = path.resolve(readValue(argv, i++, '--ledger'));
    else if (value === '--screen') args.screen = readValue(argv, i++, '--screen');
    else if (value === '--feature') args.feature = readValue(argv, i++, '--feature');
    else if (value === '--preview') args.preview = readValue(argv, i++, '--preview');
    else if (value === '--status') args.status = readValue(argv, i++, '--status');
    else if (value === '--evidence') args.evidence = readValue(argv, i++, '--evidence');
    else if (value === '--ledger-gate') args.ledgerGates.push(readValue(argv, i++, '--ledger-gate'));
    else if (value === '--ledger-status') args.ledgerStatus = readValue(argv, i++, '--ledger-status');
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node contract_promote.js --root <theme> --screen <name> --status <value> --evidence <file.json> [--dry-run]
  node contract_promote.js --root <theme> --feature <name> --status <preserved|approved-deviation> --evidence <file> [--dry-run]
  node contract_promote.js --root <theme> --preview passed --evidence <file> [--dry-run]
  node contract_promote.js --root <theme> --ledger-gate "<row label>" [--ledger-gate ...] --evidence <file> [--ledger-status passed|done|waived]

Promotes contract entries and resolves pending ledger rows from real evidence files.
One run may combine one contract action with any number of --ledger-gate rows; nothing is
written unless every requested change is accepted.

--screen <name> --status <value>
    value: ${[...PREVIEW_VERIFIED].join(' | ')}
    --evidence is a JSON file: { "desktop": "<png>", "mobile": "<png>", "landmarks": { "<landmark>": "matched|approved-deviation" } }
    (desktop/mobile are not required for verified-static-hosted-auth). Image paths resolve against --root, then the evidence file directory.
    The screen must end with every landmark matched or approved-deviation.
--feature <name> --status <value>
    value: ${[...FEATURE_RESOLVED].join(' | ')}; evidence file path is appended to feature.evidence; targetHooks are re-verified.
--preview passed
    Sets preview.status to passed (requires preview.baseUrl).
--ledger-gate <label>
    Turns the single pending row whose first cell equals <label> into the ledger status, recording the evidence path.
    The legacy "Checkpoint - chưa final" line is resolved with --ledger-gate Checkpoint.

Options:
  --contract <file>   Contract path (default: deliverables/FULL_REMAKE_CONTRACT.json under --root)
  --ledger <file>     Ledger path (default: deliverables/RESTYLE_PROGRESS_LEDGER.md under --root)
  --dry-run           Print the planned changes without writing

Exit codes: 0 applied (or dry-run accepted), 1 refused, 2 usage error.
`);
}

function toRelative(root, absolute) {
  const rel = path.relative(root, absolute).replace(/\\/g, '/');
  return rel.startsWith('..') || path.isAbsolute(rel) ? absolute.replace(/\\/g, '/') : rel;
}

function locateFile(value, bases) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidates = path.isAbsolute(value) ? [value] : bases.map((base) => path.resolve(base, value));
  return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

function requireEvidenceFile(file, label) {
  const stat = fs.statSync(file);
  if (stat.size === 0) throw new Refusal(`${label} is empty (0 bytes): ${file}`);
  if (/\.png$/i.test(file)) {
    try { readPngInfo(file); } catch (error) { throw new Refusal(`${label} is not a valid PNG: ${file} (${error.message})`); }
  }
}

function loadEvidence(root, evidenceArg) {
  if (!evidenceArg) throw new Refusal('--evidence <file> is required');
  const file = locateFile(evidenceArg, [root, process.cwd()]);
  if (!file) throw new Refusal(`evidence file not found: ${evidenceArg}`);
  requireEvidenceFile(file, 'evidence file');
  return { file, dir: path.dirname(file), rel: toRelative(root, file) };
}

function readEvidenceJson(evidence) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(evidence.file, 'utf8'));
  } catch (error) {
    throw new Refusal(`screen evidence must be a JSON file: ${evidence.file} (${error.message})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Refusal('screen evidence JSON must be an object');
  return data;
}

function promoteScreen(root, contract, name, status, evidence) {
  if (!PREVIEW_VERIFIED.has(status)) {
    throw new Refusal(`status "${status}" is not promotable (allowed: ${[...PREVIEW_VERIFIED].join(', ')})`);
  }
  const screen = (contract.screens || []).find((item) => item.name === name);
  if (!screen) throw new Refusal(`screen not found in contract: ${name}`);
  const data = readEvidenceJson(evidence);
  const next = JSON.parse(JSON.stringify(screen));
  next.evidence = { ...(next.evidence || {}) };
  if (status !== 'verified-static-hosted-auth') {
    for (const key of ['desktop', 'mobile']) {
      const file = locateFile(data[key], [root, evidence.dir]);
      if (!file) throw new Refusal(`evidence.${key} file not found: ${JSON.stringify(data[key])}`);
      requireEvidenceFile(file, `evidence.${key}`);
      next.evidence[key] = toRelative(root, file);
    }
  }
  for (const [landmarkName, landmarkStatus] of Object.entries(data.landmarks || {})) {
    const landmark = (next.landmarks || []).find((item) => item.name === landmarkName);
    if (!landmark) throw new Refusal(`evidence names an unknown landmark: ${landmarkName}`);
    if (!LANDMARK_RESOLVED.has(landmarkStatus)) {
      throw new Refusal(`landmark ${landmarkName}: status "${landmarkStatus}" is not one of ${[...LANDMARK_RESOLVED].join(', ')}`);
    }
    landmark.status = landmarkStatus;
  }
  next.status = status;
  next.promotion = { evidence: evidence.rel, promotedAt: new Date().toISOString() };
  const findings = validateScreens({ screens: [next] }, FINAL_APPROVED.has(status), root);
  if (findings.length) throw new Refusal(`screen ${name} not promotable: ${findings.join('; ')}`);
  return { ...contract, screens: contract.screens.map((item) => (item === screen ? next : item)) };
}

function promoteFeature(root, contract, name, status, evidence) {
  if (!FEATURE_RESOLVED.has(status)) {
    throw new Refusal(`status "${status}" is not promotable for a feature (allowed: ${[...FEATURE_RESOLVED].join(', ')})`);
  }
  const feature = (contract.features || []).find((item) => item.name === name);
  if (!feature) throw new Refusal(`feature not found in contract: ${name}`);
  const next = JSON.parse(JSON.stringify(feature));
  const existing = Array.isArray(next.evidence) ? next.evidence : [];
  next.evidence = existing.includes(evidence.rel) ? existing : [...existing, evidence.rel];
  next.status = status;
  const findings = validateFeatures(root, { features: [next] }, true);
  if (findings.length) throw new Refusal(`feature ${name} not promotable: ${findings.join('; ')}`);
  return { ...contract, features: contract.features.map((item) => (item === feature ? next : item)) };
}

function promotePreview(contract, value, evidence) {
  if (value !== 'passed') throw new Refusal(`--preview only accepts "passed" (got "${value}")`);
  const baseUrl = contract.preview && contract.preview.baseUrl;
  if (!baseUrl || !String(baseUrl).trim()) throw new Refusal('preview.baseUrl is empty; record the verified preview URL first');
  return {
    ...contract,
    preview: { ...contract.preview, status: 'passed', evidence: evidence.rel, verifiedAt: new Date().toISOString() }
  };
}

function normalizeLabel(text) {
  return String(text).replace(/[`*_]/g, '').trim().toLowerCase();
}

const LEGACY_CHECKPOINT = /Checkpoint\s*-\s*(?:chưa|chÆ°a) final/gi;

function resolveLedgerGate(text, label, status, evidenceRel) {
  if (!LEDGER_RESOLVED.has(status)) throw new Refusal(`ledger status "${status}" is not one of ${[...LEDGER_RESOLVED].join(', ')}`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const wanted = normalizeLabel(label);
  const hits = [];
  lines.forEach((line, index) => {
    if (!/^\s*\|.*\|\s*$/.test(line)) return;
    const cells = line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
    if (normalizeLabel(cells[0]) !== wanted) return;
    const statusIndex = cells.findIndex((cell, cellIndex) => cellIndex > 0 && /^pending$/i.test(cell));
    if (statusIndex > 0) hits.push({ index, cells, statusIndex });
  });
  if (hits.length > 1) {
    throw new Refusal(`ledger row "${label}" is ambiguous: ${hits.length} pending rows (lines ${hits.map((hit) => hit.index + 1).join(', ')})`);
  }
  if (hits.length === 1) {
    const { index, cells, statusIndex } = hits[0];
    const next = cells.slice();
    next[statusIndex] = status;
    if (next[statusIndex + 1] === '') next[statusIndex + 1] = evidenceRel;
    else next[statusIndex] = `${status} (evidence: ${evidenceRel})`;
    lines[index] = `| ${next.join(' | ')} |`;
    return lines.join(eol);
  }
  if (wanted === 'checkpoint') {
    let replaced = 0;
    const resolved = lines.map((line) => line.replace(LEGACY_CHECKPOINT, () => {
      replaced += 1;
      return `Checkpoint - final cleared (evidence: ${evidenceRel})`;
    }));
    if (replaced) return resolved.join(eol);
  }
  throw new Refusal(`ledger row not found or not pending: ${label}`);
}

function findLedgerFile(root, explicit) {
  if (explicit) return explicit;
  const candidates = [
    path.join(root, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'),
    path.join(root, 'RESTYLE_PROGRESS_LEDGER.md'),
    path.join(root, 'deliverables', 'ledger.md')
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

function writeAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

function runPromote(args) {
  const actions = [args.screen, args.feature, args.preview].filter(Boolean);
  if (actions.length > 1) {
    const error = new Error('--screen, --feature and --preview are mutually exclusive');
    error.exitCode = 2;
    throw error;
  }
  if (!actions.length && !args.ledgerGates.length) {
    const error = new Error('nothing to do: pass --screen, --feature, --preview or --ledger-gate');
    error.exitCode = 2;
    throw error;
  }
  if ((args.screen || args.feature) && !args.status) {
    const error = new Error('--status is required with --screen/--feature');
    error.exitCode = 2;
    throw error;
  }

  if (!fs.existsSync(args.root) || !fs.statSync(args.root).isDirectory()) throw new Refusal(`theme root not found: ${args.root}`);
  const evidence = loadEvidence(args.root, args.evidence);
  const messages = [];
  const writes = [];

  if (actions.length) {
    const contractPath = args.contract || findContract(args.root);
    if (!fs.existsSync(contractPath)) throw new Refusal(`contract not found: ${contractPath}`);
    let contract = readContract(contractPath);
    if (args.screen) {
      contract = promoteScreen(args.root, contract, args.screen, args.status, evidence);
      messages.push(`screen ${args.screen} -> ${args.status} (evidence: ${evidence.rel})`);
    } else if (args.feature) {
      contract = promoteFeature(args.root, contract, args.feature, args.status, evidence);
      messages.push(`feature ${args.feature} -> ${args.status} (evidence: ${evidence.rel})`);
    } else {
      contract = promotePreview(contract, args.preview, evidence);
      messages.push(`preview -> passed (evidence: ${evidence.rel})`);
    }
    writes.push({ file: contractPath, content: `${JSON.stringify(contract, null, 2)}\n` });
  }

  if (args.ledgerGates.length) {
    const ledgerPath = findLedgerFile(args.root, args.ledger);
    if (!ledgerPath || !fs.existsSync(ledgerPath)) throw new Refusal(`ledger not found under ${args.root}`);
    let text = fs.readFileSync(ledgerPath, 'utf8');
    for (const gate of args.ledgerGates) {
      text = resolveLedgerGate(text, gate, args.ledgerStatus, evidence.rel);
      messages.push(`ledger row "${gate}" -> ${args.ledgerStatus} (evidence: ${evidence.rel})`);
    }
    writes.push({ file: ledgerPath, content: text });
  }

  if (!args.dryRun) for (const item of writes) writeAtomic(item.file, item.content);
  return { messages, written: args.dryRun ? [] : writes.map((item) => item.file) };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    usage();
    return 2;
  }
  if (args.help) {
    usage();
    return 0;
  }
  if (!args.root) {
    console.error('ERROR: --root <theme> is required');
    usage();
    return 2;
  }
  try {
    const result = runPromote(args);
    for (const message of result.messages) console.log(`${args.dryRun ? 'DRY-RUN' : 'PASS'}: ${message}`);
    if (args.dryRun) console.log('(dry-run: no files written)');
    else for (const file of result.written) console.log(`Wrote: ${file}`);
    return 0;
  } catch (error) {
    console.error(`${error instanceof Refusal ? 'REFUSED' : 'ERROR'}: ${error.message}`);
    return error instanceof Refusal ? 1 : (error.exitCode || 1);
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { parseArgs, promoteScreen, promoteFeature, promotePreview, resolveLedgerGate, runPromote, Refusal };
