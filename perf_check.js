#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    baseline: '',
    out: path.resolve(process.cwd(), '..', 'scratch', 'perf'),
    base: '',
    paths: [],
    lighthouse: false,
    saveBaseline: false,
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--root') args.root = path.resolve(argv[++i]);
    else if (v === '--baseline') args.baseline = path.resolve(argv[++i]);
    else if (v === '--out') args.out = path.resolve(argv[++i]);
    else if (v === '--base') args.base = argv[++i];
    else if (v === '--paths') args.paths = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (v === '--lighthouse') args.lighthouse = true;
    else if (v === '--save-baseline') args.saveBaseline = true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node perf_check.js --root <theme-root> [--baseline <file>] [--save-baseline] [--lighthouse --base <preview-url> --paths /,/products/x]

Two modes (compose freely):

1. Bundle size scan + diff
   - Walks <root>/assets/*.{css,js} and reports per-file size.
   - --baseline <file>: compare against earlier scan saved with --save-baseline.
   - --save-baseline:   write current scan to <out>/perf-baseline.json.

2. Lighthouse perf snapshot (optional)
   - --lighthouse + --base + --paths: invokes 'npx --yes lighthouse' for each path.
   - Reports Performance score, LCP, TBT, CLS.
   - Requires npx + network. Skip if unavailable.

Output: <out>/perf-report.md and <out>/perf-results.json
`);
}

function listAssets(root) {
  const assetsDir = path.join(root, 'assets');
  if (!fs.existsSync(assetsDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(css|js)$/i.test(entry.name)) continue;
    const full = path.join(assetsDir, entry.name);
    out.push({ name: entry.name, size: fs.statSync(full).size });
  }
  return out.sort((a, b) => b.size - a.size);
}

function summarize(assets) {
  const css = assets.filter((a) => /\.css$/i.test(a.name));
  const js = assets.filter((a) => /\.js$/i.test(a.name));
  return {
    totalKb: Math.round(assets.reduce((s, a) => s + a.size, 0) / 1024),
    cssKb: Math.round(css.reduce((s, a) => s + a.size, 0) / 1024),
    jsKb: Math.round(js.reduce((s, a) => s + a.size, 0) / 1024),
    fileCount: assets.length
  };
}

function diffBaseline(current, baseline) {
  const baseMap = new Map((baseline.assets || []).map((a) => [a.name, a.size]));
  const rows = [];
  for (const a of current.assets) {
    const before = baseMap.get(a.name);
    if (before === undefined) rows.push({ name: a.name, before: 0, after: a.size, deltaKb: Math.round(a.size / 1024), status: 'new' });
    else if (before !== a.size) rows.push({ name: a.name, before, after: a.size, deltaKb: Math.round((a.size - before) / 1024), status: a.size > before ? 'grew' : 'shrank' });
  }
  const curMap = new Map(current.assets.map((a) => [a.name, true]));
  for (const a of (baseline.assets || [])) {
    if (!curMap.has(a.name)) rows.push({ name: a.name, before: a.size, after: 0, deltaKb: -Math.round(a.size / 1024), status: 'removed' });
  }
  return rows.sort((a, b) => Math.abs(b.deltaKb) - Math.abs(a.deltaKb));
}

function runLighthouse(url, outDir) {
  const cli = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const safe = url.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  const json = path.join(outDir, `lh-${safe}.json`);
  const result = spawnSync(cli, ['--yes', 'lighthouse', url, '--quiet', '--chrome-flags=--headless', '--output=json', '--output-path=' + json, '--only-categories=performance,accessibility,best-practices,seo'], {
    stdio: 'inherit', shell: process.platform === 'win32'
  });
  if (result.status !== 0 || !fs.existsSync(json)) return { url, error: `lighthouse exit ${result.status}` };
  try {
    const data = JSON.parse(fs.readFileSync(json, 'utf8'));
    return {
      url,
      perfScore: Math.round((data.categories.performance.score || 0) * 100),
      a11yScore: Math.round((data.categories.accessibility.score || 0) * 100),
      bestPracticesScore: Math.round((data.categories['best-practices'].score || 0) * 100),
      seoScore: Math.round((data.categories.seo.score || 0) * 100),
      lcpMs: Math.round(data.audits['largest-contentful-paint']?.numericValue || 0),
      tbtMs: Math.round(data.audits['total-blocking-time']?.numericValue || 0),
      cls: Number((data.audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3)),
      fcpMs: Math.round(data.audits['first-contentful-paint']?.numericValue || 0)
    };
  } catch (e) { return { url, error: e.message }; }
}

function buildReport(args, current, baseline, baselineDiff, lighthouse) {
  const lines = ['# Perf Check', ''];
  lines.push(`Theme root: ${args.root}`);
  lines.push(`Bundle: ${current.summary.totalKb} kB total | css ${current.summary.cssKb} kB | js ${current.summary.jsKb} kB | files ${current.summary.fileCount}`);
  lines.push('');

  lines.push('## Top files');
  lines.push('| File | Size (kB) |');
  lines.push('|---|---:|');
  for (const a of current.assets.slice(0, 15)) lines.push(`| ${a.name} | ${Math.round(a.size / 1024)} |`);

  if (baseline) {
    lines.push('');
    lines.push(`## Bundle diff vs baseline (${args.baseline})`);
    lines.push(`Total: ${baseline.summary.totalKb} kB -> ${current.summary.totalKb} kB (${current.summary.totalKb - baseline.summary.totalKb >= 0 ? '+' : ''}${current.summary.totalKb - baseline.summary.totalKb} kB)`);
    if (baselineDiff.length) {
      lines.push('');
      lines.push('| File | Before (B) | After (B) | Delta (kB) | Status |');
      lines.push('|---|---:|---:|---:|---|');
      for (const r of baselineDiff.slice(0, 25)) lines.push(`| ${r.name} | ${r.before} | ${r.after} | ${r.deltaKb >= 0 ? '+' : ''}${r.deltaKb} | ${r.status} |`);
    } else {
      lines.push('No bundle changes vs baseline.');
    }
  }

  if (lighthouse && lighthouse.length) {
    lines.push('');
    lines.push('## Lighthouse');
    lines.push('| URL | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS | FCP (ms) |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of lighthouse) {
      if (r.error) { lines.push(`| ${r.url} | err: ${r.error} |  |  |  |  |  |  |  |`); continue; }
      lines.push(`| ${r.url} | ${r.perfScore} | ${r.a11yScore} | ${r.bestPracticesScore} | ${r.seoScore} | ${r.lcpMs} | ${r.tbtMs} | ${r.cls} | ${r.fcpMs} |`);
    }
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }
  fs.mkdirSync(args.out, { recursive: true });

  const assets = listAssets(args.root);
  const summary = summarize(assets);
  const current = { assets, summary, generatedAt: new Date().toISOString() };

  let baseline = null;
  let baselineDiff = [];
  if (args.baseline) {
    if (!fs.existsSync(args.baseline)) { console.error(`baseline not found: ${args.baseline}`); process.exit(1); }
    baseline = JSON.parse(fs.readFileSync(args.baseline, 'utf8'));
    baselineDiff = diffBaseline(current, baseline);
  }
  if (args.saveBaseline) {
    fs.writeFileSync(path.join(args.out, 'perf-baseline.json'), JSON.stringify(current, null, 2), 'utf8');
    console.log(`Baseline saved: ${path.join(args.out, 'perf-baseline.json')}`);
  }

  let lighthouse = [];
  if (args.lighthouse) {
    if (!args.base || !args.paths.length) { console.error('--lighthouse requires --base and --paths'); process.exit(1); }
    for (const p of args.paths) {
      const url = args.base.replace(/\/+$/, '') + (p.startsWith('/') ? p : '/' + p);
      console.log(`\n>> lighthouse ${url}`);
      lighthouse.push(runLighthouse(url, args.out));
    }
  }

  fs.writeFileSync(path.join(args.out, 'perf-results.json'), JSON.stringify({ current, baseline: baseline ? baseline.summary : null, baselineDiff, lighthouse }, null, 2), 'utf8');
  fs.writeFileSync(path.join(args.out, 'perf-report.md'), buildReport(args, current, baseline, baselineDiff, lighthouse), 'utf8');

  console.log('\n# Perf Check');
  console.log(`Bundle: ${summary.totalKb} kB (css ${summary.cssKb} | js ${summary.jsKb}, ${summary.fileCount} files)`);
  if (baseline) console.log(`Diff vs baseline: ${current.summary.totalKb - baseline.summary.totalKb >= 0 ? '+' : ''}${current.summary.totalKb - baseline.summary.totalKb} kB`);
  if (lighthouse.length) {
    for (const r of lighthouse) {
      if (r.error) console.log(`  ${r.url}: ${r.error}`);
      else console.log(`  ${r.url}: perf ${r.perfScore} | a11y ${r.a11yScore} | LCP ${r.lcpMs}ms | TBT ${r.tbtMs}ms | CLS ${r.cls}`);
    }
  }
  console.log(`Output: ${args.out}`);
}

try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
