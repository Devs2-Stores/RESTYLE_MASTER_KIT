#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readValue } = require('./lib/cli-args');
const { readPngInfo } = require('./lib/image');
const { listZipEntries } = require('./lib/zip');
const { scanSettingsDataForThemeCdnUrls } = require('./final_theme_export');
const { findAllowListViolations } = require('./theme_package');
const {
  findContract,
  readContract,
  ledgerRequiresContract,
  ledgerClaimsConvertedWithoutPreview,
  validateRemakeContract
} = require('./lib/remake-contract');
const { validateDescriptionSync } = require('./lib/description-validator');
const { runSettingsSchemaAudit } = require('./lib/settings-audit');
function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    out: null,
    requireZip: false,
    requirePptx: false,
    requireRemakeContract: false,
    requirePreShowcase: false,
    designGate: false,
    homeCapture: null,
    allowStructuralQa: null,
    config: null,
    base: null,
    themeId: null,
    demoKit: null,
    navigations: null,
    brands: [],
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, i, '--root')); i += 1; }
    else if (value === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (value === '--require-zip') args.requireZip = true;
    else if (value === '--require-pptx') args.requirePptx = true;
    else if (value === '--require-remake-contract') args.requireRemakeContract = true;
    else if (value === '--require-pre-showcase') args.requirePreShowcase = true;
    else if (value === '--require-design-gate') args.designGate = true;
    else if (value === '--home-capture') { args.homeCapture = path.resolve(readValue(argv, i, '--home-capture')); i += 1; }
    else if (value === '--allow-structural-qa') {
      const reason = readValue(argv, i, '--allow-structural-qa').trim();
      if (!reason) throw new Error('Missing value for --allow-structural-qa');
      args.allowStructuralQa = reason;
      i += 1;
    }
    else if (value === '--config') { args.config = path.resolve(readValue(argv, i, '--config')); i += 1; }
    else if (value === '--base') { args.base = readValue(argv, i, '--base'); i += 1; }
    else if (value === '--theme-id') { args.themeId = readValue(argv, i, '--theme-id'); i += 1; }
    else if (value === '--demo-kit') { args.demoKit = path.resolve(readValue(argv, i, '--demo-kit')); i += 1; }
    else if (value === '--navigations') { args.navigations = path.resolve(readValue(argv, i, '--navigations')); i += 1; }
    else if (value === '--brand') { args.brands.push(readValue(argv, i, '--brand')); i += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.out) args.out = path.join(args.root, 'final-showcase');
  return args;
}

function usage() {
  console.log(`Usage:
  node workflow_final_guard.js --root <theme-root> [--out <final-showcase-dir>] [--require-zip] [--require-pptx] [--require-remake-contract]
    [--require-design-gate] [--home-capture <page_inventory.json>] [--allow-structural-qa "<reason>"]
    [--require-pre-showcase [--config <demo-kit-config.json> --base <shopUrl> --theme-id <id>] [--demo-kit <dir>] [--navigations <navigations.json>] [--brand <name>]...]

Checks:
  - progress ledger exists and has no pending/final checkpoint or uncertified structural/QA-debt status rows
  - final screenshots exist and are valid PNG files
  - desktop/mobile cropped screenshots have exact required dimensions
  - THEME_DESCRIPTION.html is an editor fragment
  - optional export zip exists when --require-zip is set
  - optional feature deck (.pptx) exists when --require-pptx is set
  - full-remake contract passes when required by ledger, artifact, or flag
  - design gate (token set, home section budget, reference captures) when requested or when the contract carries gate tokens
  - pre-showcase gate (readiness, CERTIFIED QA receipts, residue, claims, description, image health, ZIP freshness) with --require-pre-showcase;
    an UNMEASURED sub-check blocks the handoff like a failed one
`);
}

function findLedger(root) {
  const candidates = [
    path.join(root, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'),
    path.join(root, 'RESTYLE_PROGRESS_LEDGER.md'),
    path.join(root, 'deliverables', 'ledger.md')
  ];
  return candidates.find((file) => fs.existsSync(file));
}

function hasPendingLedgerGate(text) {
  return /\|\s*pending\s*\|/i.test(text)
    || /Checkpoint\s*-\s*chưa final/i.test(text)
    || /Checkpoint\s*-\s*chÆ°a final/i.test(text);
}

function findStructuralQaRows(text) {
  const lines = String(text || '').split(/\r?\n/);
  const rows = [];
  let inTable = false;
  let statusCol = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/^\s*\|.*\|\s*$/.test(line)) {
      inTable = false;
      statusCol = -1;
      continue;
    }
    const cells = line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
    const isSeparator = cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
    if (!inTable) {
      inTable = true;
      const nextLine = lines[i + 1] || '';
      const nextCells = /^\s*\|.*\|\s*$/.test(nextLine)
        ? nextLine.trim().slice(1, -1).split('|').map((cell) => cell.trim())
        : [];
      const nextIsSeparator = nextCells.length > 0 && nextCells.every((cell) => /^:?-+:?$/.test(cell));
      if (nextIsSeparator) {
        statusCol = cells.findIndex((cell) => /^status$/i.test(cell.replace(/[`*_]/g, '').trim()));
        continue;
      }
      statusCol = cells.length > 1 ? 1 : -1;
    }
    if (isSeparator || statusCol < 0 || statusCol >= cells.length) continue;
    const status = cells[statusCol];
    if (/structural|qa-debt/i.test(status)) {
      rows.push({ label: cells[0] || `line ${i + 1}`, status, line: i + 1 });
    }
  }
  return rows;
}

function assertFile(filePath, label, failures) {
  if (!fs.existsSync(filePath)) {
    failures.push(`missing ${label}: ${filePath}`);
  } else {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) failures.push(`${label} is empty (0 bytes): ${filePath}`);
  }
}

function validateDescription(filePath, failures) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const res = validateDescriptionSync(text);
  if (!res.valid) {
    failures.push(...res.failures);
  }
}

function validatePng(filePath, failures, expectedSize) {
  if (!fs.existsSync(filePath)) return;
  let info;
  try {
    info = readPngInfo(filePath);
  } catch (error) {
    failures.push(`${path.basename(filePath)}: ${error.message}`);
    return;
  }
  if (expectedSize && (info.width !== expectedSize.w || info.height !== expectedSize.h)) {
    failures.push(`${path.basename(filePath)}: expected ${expectedSize.w}x${expectedSize.h} but got ${info.width}x${info.height}`);
  }
}

function withoutArchiveWrapper(entries) {
  const files = entries.filter((entry) => !entry.endsWith('/'));
  if (!files.length) return files;
  const firstParts = files.map((entry) => entry.split('/')[0]);
  const common = firstParts.every((part) => part === firstParts[0]) ? firstParts[0] : '';
  if (!common || ['assets', 'config', 'layout', 'locales', 'snippets', 'templates'].includes(common)) return files;
  return files.map((entry) => entry.slice(common.length + 1));
}

function validateArchiveCandidates(files, label, requiredEntries, requiredPrefixes, failures) {
  const errors = [];
  let valid = 0;
  for (const filePath of files) {
    try {
      const entries = withoutArchiveWrapper(listZipEntries(filePath));
      const missingEntries = [];
      for (const req of requiredEntries) {
        if (Array.isArray(req)) {
          if (!req.some((alt) => entries.includes(alt))) {
            missingEntries.push(`(${req.join(' OR ')})`);
          }
        } else if (!entries.includes(req)) {
          missingEntries.push(req);
        }
      }
      const missingPrefixes = requiredPrefixes.filter((prefix) => !entries.some((entry) => entry.startsWith(prefix)));
      if (missingEntries.length || missingPrefixes.length) {
        errors.push(`${path.basename(filePath)} missing ${[...missingEntries, ...missingPrefixes.map((prefix) => `${prefix}*`)].join(', ')}`);
      } else {
        valid += 1;
      }
    } catch (error) {
      errors.push(`${path.basename(filePath)}: ${error.message}`);
    }
  }
  if (!valid) failures.push(`no valid ${label}: ${errors.join('; ')}`);
}

/** Resolve first existing filename among candidates (human-readable first, legacy second). */
function resolveShowcaseFile(outDir, candidates) {
  for (const name of candidates) {
    const full = path.join(outDir, name);
    if (fs.existsSync(full)) return full;
  }
  return path.join(outDir, candidates[0]);
}

function validateFinalArtifacts(args, failures, warnings = []) {
  // Prefer Vietnamese home names; accept legacy machine names for older packs
  const desktopCrop = resolveShowcaseFile(args.out, ['Trang chủ.png', 'desktop-876x2000.png']);
  const mobileCrop = resolveShowcaseFile(args.out, ['Trang chủ-mobile.png', 'mobile-276x480.png']);
  const desktopRaw = resolveShowcaseFile(args.out, ['Trang chủ-fullpage.png', 'desktop-fullpage-raw.png']);
  const mobileRaw = resolveShowcaseFile(args.out, ['Trang chủ-mobile-fullpage.png', 'mobile-fullpage-raw.png']);

  const required = [
    ['desktop screenshot (Trang chủ.png)', desktopCrop],
    ['mobile screenshot (Trang chủ-mobile.png)', mobileCrop],
    ['raw desktop screenshot', desktopRaw],
    ['raw mobile screenshot', mobileRaw],
    ['theme description', path.join(args.out, 'THEME_DESCRIPTION.html')]
  ];
  for (const [label, filePath] of required) assertFile(filePath, label, failures);
  validateDescription(path.join(args.out, 'THEME_DESCRIPTION.html'), failures);

  validatePng(desktopCrop, failures, { w: 876, h: 2000 });
  validatePng(mobileCrop, failures, { w: 276, h: 480 });
  validatePng(desktopRaw, failures);
  validatePng(mobileRaw, failures);

  // Check for raw CLI export zip sitting directly in final-showcase deliverables
  if (fs.existsSync(args.out)) {
    const outFiles = fs.readdirSync(args.out);
    for (const f of outFiles) {
      if (/-\d{1,2}_\d{1,2}_\d{4}\.zip$/i.test(f)) {
        failures.push(`raw CLI export zip (${f}) found directly in ${args.out} (raw exports must be placed in raw/ or removed; only canonical handoff zip allowed)`);
      }
    }
  }

  if (args.requireZip) {
    const zips = fs.existsSync(args.out)
      ? fs.readdirSync(args.out).filter((file) => /\.zip$/i.test(file)).map((file) => path.join(args.out, file))
      : [];
    if (!zips.length) failures.push(`missing theme export zip in ${args.out}`);
    else {
      validateArchiveCandidates(zips, 'theme export zip', ['layout/theme.liquid', ['config/settings_schema.json', 'config/settings.html']], ['templates/'], failures);
      for (const z of zips) {
        let violations = [];
        try { violations = findAllowListViolations(listZipEntries(z)); } catch (_) { continue; }
        if (violations.length) {
          failures.push(`theme export zip ${path.basename(z)} has ${violations.length} member(s) outside the delivery allow-list: ${violations.slice(0, 5).join('; ')}`);
        }
      }

      // Portability scan: scan config/settings_data.json inside each zip
      for (const z of zips) {
        try {
          const scan = scanSettingsDataForThemeCdnUrls(z);
          if (scan && scan.count > 0) {
            warnings.push(`portability: config/settings_data.json inside ${path.basename(z)} contains ${scan.count} theme-specific CDN URL(s) (keys: ${scan.keys.join(', ')})`);
          }
        } catch (_) {}
      }
    }
  }

  if (args.requirePptx) {
    const pptx = fs.existsSync(args.out)
      ? fs.readdirSync(args.out).filter((file) => /\.pptx$/i.test(file)).map((file) => path.join(args.out, file))
      : [];
    if (!pptx.length) failures.push(`missing feature deck pptx in ${args.out}`);
    else validateArchiveCandidates(pptx, 'feature deck pptx', ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml'], [], failures);
  }
}

function runPreShowcase(args, failures) {
  const gateArgs = [path.join(__dirname, 'pre_showcase_gate.js'), '--root', args.root, '--out', args.out, '--json'];
  if (args.config) gateArgs.push('--config', args.config);
  if (args.base) gateArgs.push('--base', args.base);
  if (args.themeId) gateArgs.push('--theme-id', args.themeId);
  if (args.demoKit) gateArgs.push('--demo-kit', args.demoKit);
  if (args.navigations) gateArgs.push('--navigations', args.navigations);
  for (const brand of args.brands) gateArgs.push('--brand', brand);
  const nodeBin = /^node(?:\.exe)?$/i.test(path.basename(process.execPath || '')) ? process.execPath : 'node';
  const res = spawnSync(nodeBin, gateArgs, { encoding: 'utf8', timeout: 900000, maxBuffer: 16 * 1024 * 1024 });
  let parsed = null;
  try { parsed = JSON.parse(res.stdout); } catch (_) { parsed = null; }
  if (!parsed || !Array.isArray(parsed.results)) {
    failures.push(`pre-showcase gate produced no result (exit ${res.status}): ${String(res.stderr || res.stdout || (res.error && res.error.message) || '').trim().split(/\r?\n/).slice(-2).join(' | ')}`);
    return;
  }
  for (const check of parsed.results) {
    if (check.status !== 'PASS') failures.push(`pre-showcase ${check.name} [${check.status}]: ${check.detail}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); return; }

  const failures = [];
  const warnings = [];
  const ledgerPath = findLedger(args.root);
  let ledgerText = '';
  if (!ledgerPath) {
    failures.push('no concrete progress ledger found (run `npm run ledger:init -- --root <theme>` to initialize)');
  } else {
    ledgerText = fs.readFileSync(ledgerPath, 'utf8');
    const ledgerRel = path.relative(args.root, ledgerPath).replace(/\\/g, '/');
    if (hasPendingLedgerGate(ledgerText)) failures.push(`final gate not clear in ${path.relative(args.root, ledgerPath)} (resolve a row with: node contract_promote.js --root <theme> --ledger-gate "<row>" --evidence <file>)`);
    if (ledgerClaimsConvertedWithoutPreview(ledgerText)) failures.push('ledger claims converted while preview QA or final evidence is pending');
    for (const row of findStructuralQaRows(ledgerText)) {
      if (args.allowStructuralQa) {
        warnings.push(`QA not certified in ${ledgerRel}: row "${row.label}" is ${row.status} (waived with --allow-structural-qa: "${args.allowStructuralQa}")`);
      } else {
        failures.push(`QA not certified in ${ledgerRel}: row "${row.label}" is ${row.status} (theme.qa_validate certification must be CERTIFIED; record a user waiver with --allow-structural-qa "<reason>")`);
      }
    }
  }

  const contractPath = findContract(args.root);
  if (args.requireRemakeContract || (ledgerText && ledgerRequiresContract(ledgerText)) || fs.existsSync(contractPath)) {
    if (!fs.existsSync(contractPath)) {
      failures.push(`missing full remake contract: ${contractPath}`);
    } else {
      const contract = readContract(contractPath);
      for (const finding of validateRemakeContract(args.root, contract, { final: true, designGate: args.designGate, homeCapturePath: args.homeCapture })) {
        failures.push(`full remake contract: ${finding}`);
      }
    }
  }

  if (fs.existsSync(path.join(args.root, 'config', 'settings_schema.json'))) {
    try {
      const settingsAudit = runSettingsSchemaAudit(args.root);
      for (const err of settingsAudit.errors) {
        failures.push(`settings schema audit [${err.rule}]: ${err.message}`);
      }
      for (const warn of settingsAudit.warnings) {
        warnings.push(`settings schema audit [${warn.rule}]: ${warn.message}`);
      }
    } catch (err) {
      failures.push(`settings schema audit failed: ${err.message}`);
    }
  }

  if (args.requirePreShowcase) runPreShowcase(args, failures);
  validateFinalArtifacts(args, failures, warnings);

  if (failures.length) {
    console.error('FAIL: final guard blocked handoff');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  if (warnings.length) {
    console.warn('\nWARNING: final guard detected portability warnings:');
    for (const warning of warnings) console.warn(`- ${warning}`);
  }

  console.log(`PASS: final gate clear for ${args.root}`);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
