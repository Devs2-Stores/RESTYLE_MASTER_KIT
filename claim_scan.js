#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readValue } = require('./lib/cli-args');
const { walkTheme } = require('./lib/theme-walk');

// Default banned phrases from HaravanDemoKit content-validator.js
let demoKitBanned = [
  /giao hàng toàn quốc/i,
  /giao trong ngày/i,
  /xe chuyên dụng|khoang điều hòa/i,
  /chính hãng 100/i,
  /làm giả nhiều nhất/i,
  /tem nhập khẩu/i,
  /thiết kế hầm/i,
  /tư vấn tại nhà/i,
  /cam kết hoàn tiền/i,
  /đền bù gấp/i
];

// Try reading directly from HaravanDemoKit if available
const demoKitValidatorPath = path.resolve('E:/Work/tools/HaravanDemoKit/src/content-validator.js');
if (fs.existsSync(demoKitValidatorPath)) {
  try {
    const text = fs.readFileSync(demoKitValidatorPath, 'utf8');
    const m = text.match(/const DEFAULT_BANNED_PHRASES = \[([\s\S]*?)\];/);
    if (m) {
      const parsed = m[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('/'))
        .map((line) => {
          const match = line.match(/^\/(.*)\/([gimsuy]*),?$/);
          return match ? new RegExp(match[1], match[2] || 'i') : null;
        })
        .filter(Boolean);
      if (parsed.length) demoKitBanned = parsed;
    }
  } catch {}
}

const FABRICATED_CLAIM_PATTERNS = [
  // Commercial commitments & guarantees
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /chính hãng 100|100%\s*chính hãng/i, label: 'chính hãng 100%' },
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /trả góp 0(?:\s*%|\b)/i, label: 'trả góp 0%' },
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /cam kết hoàn tiền/i, label: 'cam kết hoàn tiền' },
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /đền bù gấp/i, label: 'đền bù gấp' },
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /giao hàng toàn quốc/i, label: 'giao hàng toàn quốc' },
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /giao trong ngày/i, label: 'giao trong ngày' },
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /đổi (?:trả|size)\s*(?:trong\s*)?\d+\s*ngày/i, label: 'đổi trả x ngày' },
  { rule: 'BANNED_COMMERCIAL_CLAIM', regex: /\bVAT\s*\d+\s*%/i, label: 'VAT x%' },

  // Fabricated tech specs and certifications
  { rule: 'FABRICATED_TECH_SPEC', regex: /\bUCI Approved\b/i, label: 'UCI Approved' },
  { rule: 'FABRICATED_TECH_SPEC', regex: /\bCdA\s*0\.\d+/i, label: 'CdA spec' },
  { rule: 'FABRICATED_TECH_SPEC', regex: /\bToray\s*T\d+/i, label: 'Toray carbon spec' },
  { rule: 'FABRICATED_TECH_SPEC', regex: /\bPark Tool\b/i, label: 'Park Tool' },
  { rule: 'FABRICATED_TECH_SPEC', regex: /\bRetül\b|\bRetul\b/i, label: 'Retül bike fit' },
  { rule: 'FABRICATED_TECH_SPEC', regex: /<\s*0\.2\s*Nm/i, label: 'torque spec' },

  // Inherited DemoKit banned phrases
  ...demoKitBanned.map((regex) => ({
    rule: 'DEMOKIT_BANNED_PHRASE',
    regex,
    label: regex.source
  }))
];

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    json: false,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') {
      args.help = true;
    } else if (v === '--root' || v === '--theme') {
      args.root = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--json') {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${v}`);
    }
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node claim_scan.js [--root <theme-root>] [--json]

Options:
  --root, --theme <path>  Theme root directory (default: parent of cwd).
  --json                  Output raw findings as JSON.
  --help, -h              Show this help message.

Scans Liquid templates, JSON configs, settings defaults, and locales for
fabricated commercial claims (chính hãng 100%, trả góp 0%, UCI Approved,
VAT x%, đổi trả x ngày, giao hàng toàn quốc, cam kết hoàn tiền, Toray T1000,
CdA 0.218, etc.). Exit 1 on any match.`);
}

function scanClaims(root) {
  const findings = [];
  const files = walkTheme(root, {
    dirs: ['layout', 'snippets', 'templates', 'sections', 'config', 'locales'],
    ext: /\.(liquid|html|json)$/i
  });

  for (const filePath of files) {
    if (/\.min\./i.test(filePath)) continue;
    const relPath = path.relative(root, filePath).replace(/\\/g, '/');
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
      const lineText = lines[lineIdx];
      // Skip commented-out liquid lines if purely comment
      if (/^\s*\{%-?\s*comment\s*-?%\}/.test(lineText)) continue;

      for (const pattern of FABRICATED_CLAIM_PATTERNS) {
        const match = lineText.match(pattern.regex);
        if (match) {
          findings.push({
            rule: pattern.rule,
            label: pattern.label,
            location: `${relPath}:${lineIdx + 1}`,
            match: match[0],
            matched: match[0],
            snippet: lineText.trim()
          });
        }
      }
    }
  }

  return findings;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    usage();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    usage();
    process.exitCode = 0;
    return;
  }

  const findings = scanClaims(args.root);

  if (args.json) {
    console.log(JSON.stringify({ findings, count: findings.length }, null, 2));
    process.exitCode = findings.length > 0 ? 1 : 0;
    return;
  }

  console.log('# Claim Scan');
  console.log(`Root: ${args.root}`);
  console.log(`Findings: ${findings.length}\n`);

  if (findings.length > 0) {
    for (const f of findings) {
      console.log(`- ${f.location} [${f.rule}: ${f.label}] -> "${f.matched}" in: ${f.snippet.slice(0, 100)}`);
    }
    console.log(`\nFAIL: Fabricated commercial claims found (${findings.length} occurrences).`);
    process.exitCode = 1;
  } else {
    console.log('PASS: No fabricated commercial claims or banned commitment phrases found.');
    process.exitCode = 0;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  FABRICATED_CLAIM_PATTERNS,
  scanClaims,
  scanTheme: scanClaims
};
