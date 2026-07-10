#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const { walkTheme } = require('./lib/theme-walk');
const { readValue, normalizeEnum } = require('./lib/cli-args');
const { shouldFail, countBySeverity } = require('./lib/findings');
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

function usage() {
  console.log(`Usage:
  node liquid_content_audit.js [--root <theme-root>] [--fail-on blocker|warn]

Options:
  --root <path>      Theme root. Default: parent of cwd.
  --fail-on <level>  Exit 1 on blocker (default) or warn.
  --dry-run          Report findings but always exit 0.
`);
}

function scanFile(file, root) {
  const text = fs.readFileSync(file, 'utf8');
  const findings = [];
  const patterns = [
    { id: 'HARD_1280', severity: 'blocker', regex: /1280px/g, message: 'Hard-coded 1280px. Map to page-width/container.' },
    { id: 'MOJIBAKE', severity: 'blocker', regex: /Ã[-¿]|Â[-¿]|áº|á»/g, message: 'Possible mojibake in ship source. Verify UTF-8 before editing.' },
    { id: 'HREF_HASH', severity: 'warn', regex: /href\s*=\s*["']#["']/g, message: 'Anchor hash placeholder candidate.' },
    { id: 'JS_VOID', severity: 'warn', regex: /javascript:void\(0\)/g, message: 'javascript:void(0) candidate.' },
    { id: 'STITCH_LEAK', severity: 'warn', regex: /\bStitch\b|\bSitch\b/g, message: 'Leaked design-tool label.' },
    { id: 'DEMO_COPY', severity: 'warn', regex: /\b(lorem ipsum|placeholder text|your brand|sample text|demo content)\b/gi, message: 'Demo copy candidate.' },
    { id: 'FALLBACK_COPY', severity: 'warn', regex: /\b(fallback|default content|default text)\b/gi, message: 'Fallback/default copy candidate.' },
    { id: 'LOW_VALUE_COMMENT', severity: 'warn', regex: /(?:\/\*+\s*(TODO|FIXME|old|unused|remove|temporary|stitch)|<!--\s*(TODO|FIXME|old|unused|remove|temporary|stitch)|{%-?\s*comment\s*-?%}\s*(TODO|FIXME|old|unused|remove|temporary|stitch))/gi, message: 'Low-value or stale comment candidate.' },
    { id: 'IMPORTANT_ABUSE', severity: 'warn', regex: /!important/g, message: '!important usage. Verify cascade/source order before keeping.' },
    { id: 'HARDCODE_COLOR', severity: 'warn', regex: /(?:color|background(?:-color)?|border(?:-color)?|fill|stroke)\s*:\s*#[0-9a-fA-F]{3,8}\b/g, message: 'Hardcoded hex color. Should use CSS variable/design token.' },
    { id: 'HARDCODE_FONT', severity: 'warn', regex: /font-family\s*:\s*(?!var\()(?!inherit\b)(?!sans-serif\b)(?!serif\b)(?!monospace\b)["']?[A-Za-z]/g, message: 'Hardcoded font-family. Should use theme font variable.' },
    { id: 'INLINE_STYLE', severity: 'warn', regex: /style\s*=\s*["'][^"']{20,}["']/g, message: 'Inline style with significant rules. Move to CSS class/token.' },
    { id: 'ENGLISH_HARDCODE', severity: 'warn', regex: /(?:>|'|")\s*(Shop now|Buy now|Add to cart|View all|Read more|Learn more|Subscribe|See more|Load more|Show more|Contact us|Our story|About us|Sign up|Log in|Sign in|Free shipping|New arrival|Best seller|Sale|Sold out|Out of stock|View details|Continue shopping)\s*(?:<|'|")/gi, message: 'English hardcode candidate. Should be Vietnamese or settings-driven.' }
  ];

  for (const pattern of patterns) {
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
    dirs: ['assets', 'config', 'layout', 'snippets', 'templates'],
    ext: /\.(liquid|js|css|html|json)$/i
  });
  const findings = files.flatMap((file) => scanFile(file, args.root));
  const bySeverity = countBySeverity(findings);

  console.log('# Liquid Content Audit');
  console.log(`Root: ${args.root}`);
  console.log(`Files scanned: ${files.length}`);
  console.log(`Findings: ${findings.length} (${bySeverity.blocker || 0} blocker, ${bySeverity.warn || 0} warn)`);
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
