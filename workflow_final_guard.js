#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue } = require('./lib/cli-args');
const { readPngInfo } = require('./lib/image');

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    out: null,
    requireZip: false,
    requirePptx: false,
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, i, '--root')); i += 1; }
    else if (value === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (value === '--require-zip') args.requireZip = true;
    else if (value === '--require-pptx') args.requirePptx = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.out) args.out = path.join(args.root, 'final-showcase');
  return args;
}

function usage() {
  console.log(`Usage:
  node workflow_final_guard.js --root <theme-root> [--out <final-showcase-dir>] [--require-zip] [--require-pptx]

Checks:
  - progress ledger exists and has no pending/final checkpoint
  - final screenshots exist and are valid PNG files
  - desktop/mobile cropped screenshots have exact required dimensions
  - THEME_DESCRIPTION.html is an editor fragment
  - optional export zip exists when --require-zip is set
  - optional feature deck (.pptx) exists when --require-pptx is set
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
  if (/(<!doctype|<html\b|<head\b|<body\b)/i.test(text)) {
    failures.push('THEME_DESCRIPTION.html must be an editor fragment, not a full HTML document');
  }
  if (!text.trim()) { failures.push('THEME_DESCRIPTION.html is empty'); return; }
  if (text.trim().length < 200) failures.push('THEME_DESCRIPTION.html is too short (< 200 chars) - likely not filled in');
  if (!/<h[1-3][^>]*>/i.test(text)) failures.push('THEME_DESCRIPTION.html missing heading (h1/h2/h3)');
  if (!/<ul[^>]*>/i.test(text)) failures.push('THEME_DESCRIPTION.html missing feature list (<ul>)');
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

/** Resolve first existing filename among candidates (human-readable first, legacy second). */
function resolveShowcaseFile(outDir, candidates) {
  for (const name of candidates) {
    const full = path.join(outDir, name);
    if (fs.existsSync(full)) return full;
  }
  return path.join(outDir, candidates[0]);
}

function validateFinalArtifacts(args, failures) {
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

  if (args.requireZip) {
    const zips = fs.existsSync(args.out) ? fs.readdirSync(args.out).filter((file) => /\.zip$/i.test(file)) : [];
    if (!zips.length) failures.push(`missing theme export zip in ${args.out}`);
  }

  if (args.requirePptx) {
    const pptx = fs.existsSync(args.out)
      ? fs.readdirSync(args.out).filter((file) => /\.pptx$/i.test(file))
      : [];
    if (!pptx.length) failures.push(`missing feature deck pptx in ${args.out}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); return; }

  const failures = [];
  const ledgerPath = findLedger(args.root);
  if (!ledgerPath) {
    failures.push('no concrete progress ledger found');
  } else {
    const text = fs.readFileSync(ledgerPath, 'utf8');
    if (hasPendingLedgerGate(text)) failures.push(`final gate not clear in ${path.relative(args.root, ledgerPath)}`);
  }

  validateFinalArtifacts(args, failures);

  if (failures.length) {
    console.error('FAIL: final guard blocked handoff');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`PASS: final gate clear for ${args.root}`);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
