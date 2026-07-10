#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const { walkTheme } = require('./lib/theme-walk');
const { readValue, normalizeEnum } = require('./lib/cli-args');
const { shouldFail, countBySeverity, summarizeByRule } = require('./lib/findings');
const { printFindingsTable, printRuleSummary } = require('./lib/report');

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

function usage() {
  console.log(`Usage:
  node css_token_audit.js [--root <theme-root>] [--fail-on blocker|warn]

Scans CSS and Liquid files for hardcoded design values that should use
CSS variables or theme tokens: colors, font sizes, spacing, border-radius,
font-family, z-index magic numbers, and transition durations.

Options:
  --root <path>      Theme root. Default: parent of cwd.
  --fail-on <level>  Exit 1 on blocker (default) or warn.
  --dry-run          Report findings but always exit 0.
`);
}

const PATTERNS = [
  {
    id: 'HARDCODE_COLOR_HEX',
    severity: 'warn',
    regex: /(?:^|[;:{,\s])(?:color|background(?:-color)?|border(?:-color)?|fill|stroke|outline(?:-color)?|box-shadow|text-shadow)\s*:[^;}\n]*#[0-9a-fA-F]{3,8}\b/gm,
    message: 'Hardcoded hex color. Use CSS variable/token.'
  },
  {
    id: 'HARDCODE_COLOR_RGB',
    severity: 'warn',
    regex: /(?:color|background(?:-color)?|border(?:-color)?|fill|stroke)\s*:\s*rgba?\(\s*\d/gm,
    message: 'Hardcoded rgb/rgba color. Use CSS variable/token.'
  },
  {
    id: 'HARDCODE_FONT_SIZE',
    severity: 'warn',
    regex: /font-size\s*:\s*(?!var\()[0-9]+(?:\.[0-9]+)?(?:px|rem|em)\b/gm,
    message: 'Hardcoded font-size. Use CSS variable/token or theme scale.'
  },
  {
    id: 'HARDCODE_SPACING',
    severity: 'warn',
    regex: /(?:^|[;:{,\s])(?:margin|padding)(?:-(?:top|right|bottom|left))?\s*:\s*(?!var\()[0-9]{2,}px\b/gm,
    message: 'Hardcoded spacing >= 10px. Consider CSS variable/token.'
  },
  {
    id: 'HARDCODE_BORDER_RADIUS',
    severity: 'warn',
    regex: /border-radius\s*:\s*(?!var\()[0-9]+(?:\.[0-9]+)?(?:px|rem|em|%)\b/gm,
    message: 'Hardcoded border-radius. Use CSS variable/token.'
  },
  {
    id: 'HARDCODE_FONT_FAMILY',
    severity: 'warn',
    regex: /font-family\s*:\s*(?!var\()(?!inherit)(?!sans-serif)(?!serif)(?!monospace)["']?[A-Z]/gim,
    message: 'Hardcoded font-family. Use theme font variable.'
  },
  {
    id: 'MAGIC_ZINDEX',
    severity: 'warn',
    regex: /z-index\s*:\s*(?!var\()(?![-]?[0-9]$)[-]?[0-9]{2,}\b/gm,
    message: 'Magic z-index value. Use CSS variable or documented z-index scale.'
  },
  {
    id: 'HARDCODE_TRANSITION',
    severity: 'warn',
    regex: /transition(?:-duration)?\s*:[^;}\n]*[0-9]+(?:\.[0-9]+)?(?:ms|s)\b/gm,
    message: 'Hardcoded transition duration. Consider CSS variable for motion tokens.'
  }
];

function scanFile(file, root) {
  const text = fs.readFileSync(file, 'utf8');
  const findings = [];
  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      findings.push({
        severity: pattern.severity,
        rule: pattern.id,
        location: `${path.relative(root, file)}:${line}`,
        message: pattern.message
      });
    }
  }
  return findings;
}

function main() {
  let args;
  try { args = parseArgs(process.argv); } catch (e) { console.error('ERROR: ' + e.message); usage(); process.exit(1); }
  if (args.help) { usage(); return; }

  const files = walkTheme(args.root, {
    dirs: ['assets', 'snippets', 'templates', 'layout'],
    ext: /\.(css|liquid|html)$/i
  });

  const findings = files.flatMap((file) => scanFile(file, args.root));
  const bySeverity = countBySeverity(findings);
  const byRule = summarizeByRule(findings);

  console.log('# CSS Token Audit');
  console.log(`Root: ${args.root}`);
  console.log(`Files scanned: ${files.length}`);
  console.log(`Findings: ${findings.length} (${bySeverity.blocker || 0} blocker, ${bySeverity.warn || 0} warn)`);

  if (Object.keys(byRule).length) {
    console.log('');
    console.log('## Summary by Rule');
    printRuleSummary(byRule);
  }

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
