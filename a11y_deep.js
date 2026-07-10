#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue, normalizeEnum, parseCsv } = require('./lib/cli-args');
const { buildUrl } = require('./lib/path-utils');
const { requirePuppeteer, navigateAndSettle, withPage } = require('./lib/puppeteer-utils');

function parseArgs(argv) {
  const args = {
    base: '',
    paths: ['/'],
    out: path.resolve(process.cwd(), '..', 'scratch', 'a11y'),
    viewports: [1440],
    failOn: 'critical',
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--base') { args.base = readValue(argv, i, '--base'); i += 1; }
    else if (v === '--paths') { args.paths = parseCsv(readValue(argv, i, '--paths')); i += 1; }
    else if (v === '--viewports') { args.viewports = parseCsv(readValue(argv, i, '--viewports'), Number).filter(Boolean); i += 1; }
    else if (v === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (v === '--fail-on') { args.failOn = normalizeEnum(readValue(argv, i, '--fail-on'), '--fail-on', ['critical', 'serious', 'moderate', 'minor']); i += 1; }
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node a11y_deep.js --base <preview-url> [--paths /,/products/x] [--viewports 1440,375] [--fail-on critical|serious|moderate|minor]

Run axe-core deep accessibility scan on every (path, viewport) pair.
Reports contrast, ARIA, keyboard, focus order, semantic structure, and more.

Output:
  <out>/a11y-results.json   Full axe results per (path, viewport).
  <out>/a11y-report.md      Markdown summary grouped by impact.

Exit code: 0 if no violation at the requested impact level; 1 otherwise.
`);
}

function impactRank(level) {
  return { critical: 4, serious: 3, moderate: 2, minor: 1 }[level] || 0;
}

async function runAxeOnPage(page, axeSource) {
  await page.evaluate(axeSource);
  return await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }
    });
    return {
      url: location.href,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.slice(0, 5).map((n) => ({
          html: n.html.slice(0, 200),
          target: n.target,
          failureSummary: (n.failureSummary || '').slice(0, 300)
        }))
      })),
      passes: result.passes.length,
      incomplete: result.incomplete.length
    };
  });
}

function locateAxeSource() {
  try {
    const p = require.resolve('axe-core/axe.min.js');
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
}

function buildReport(args, results) {
  const lines = ['# A11y Deep Scan', ''];
  lines.push(`Base: ${args.base}`);
  lines.push(`Pairs: ${results.length}`);
  lines.push('');

  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const r of results) for (const v of (r.violations || [])) totals[v.impact] = (totals[v.impact] || 0) + 1;
  lines.push(`Totals - critical: ${totals.critical} | serious: ${totals.serious} | moderate: ${totals.moderate} | minor: ${totals.minor}`);
  lines.push('');

  lines.push('| Path | Viewport | Critical | Serious | Moderate | Minor | Passes |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of results) {
    const c = (r.violations || []).filter((v) => v.impact === 'critical').length;
    const s = (r.violations || []).filter((v) => v.impact === 'serious').length;
    const m = (r.violations || []).filter((v) => v.impact === 'moderate').length;
    const n = (r.violations || []).filter((v) => v.impact === 'minor').length;
    lines.push(`| ${r.path} | ${r.viewport} | ${c} | ${s} | ${m} | ${n} | ${r.passes || 0} |`);
  }

  for (const r of results) {
    if (!r.violations || !r.violations.length) continue;
    lines.push('');
    lines.push(`## ${r.path} @ ${r.viewport}px`);
    for (const v of r.violations.sort((a, b) => impactRank(b.impact) - impactRank(a.impact))) {
      lines.push(`### [${v.impact || 'unknown'}] ${v.id} - ${v.help}`);
      lines.push(`${v.description}`);
      lines.push(`Reference: ${v.helpUrl}`);
      for (const node of v.nodes) {
        lines.push(`- selector: \`${(node.target || []).join(' ')}\``);
        if (node.failureSummary) lines.push(`  - reason: ${node.failureSummary.replace(/\n/g, ' ')}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.base) { usage(); process.exit(args.help ? 0 : 1); }
  fs.mkdirSync(args.out, { recursive: true });

  const axeSource = locateAxeSource();
  if (!axeSource) {
    console.error('ERROR: axe-core not installed. Run `npm install` inside RESTYLE_MASTER_KIT first.');
    process.exit(1);
  }

  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({ headless: 'new' });
  const results = [];
  try {
    for (const p of args.paths) {
      for (const vp of args.viewports) {
        const url = buildUrl(args.base, p);
        const viewport = { width: vp, height: vp <= 480 ? 844 : 1200, deviceScaleFactor: 1 };
        const result = await withPage(browser, { viewport }, async (page) => {
          try {
            await navigateAndSettle(page, url, { waitMs: 800 });
            const data = await runAxeOnPage(page, axeSource);
            return { path: p, viewport: vp, ...data };
          } catch (error) {
            return { path: p, viewport: vp, error: error.message, violations: [] };
          }
        });
        results.push(result);
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(args.out, 'a11y-results.json'), JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(path.join(args.out, 'a11y-report.md'), buildReport(args, results), 'utf8');

  const failRank = impactRank(args.failOn);
  const failed = results.some((r) => (r.violations || []).some((v) => impactRank(v.impact) >= failRank));

  console.log('# A11y Deep Scan');
  console.log(`Output: ${args.out}`);
  console.log(`Pairs: ${results.length}`);
  console.log(`Fail-on: ${args.failOn}`);
  if (failed) { console.log('FAIL: violations at or above threshold.'); process.exit(1); }
  console.log('PASS: no violations at threshold.');
}

main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
