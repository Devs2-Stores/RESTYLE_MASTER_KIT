#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readValue, parseCsv, parseFiniteNumber } = require('./lib/cli-args');
const { readRegistry, loadThresholds, loadWaivers } = require('./lib/registry');
const { navigateAndSettle } = require('./lib/puppeteer-utils');
const receiptAudit = require('./lib/receipt-audit');
const probes = require('./lib/registry-probes');

const DEFAULT_WIDTHS = [320, 375, 768, 1024, 1440];
const TOUCH_VIEWPORT_HEIGHT = 812;
const DESKTOP_VIEWPORT_HEIGHT = 900;
const TOUCH_MAX_WIDTH = 768;
const SETTLE_MS = 1500;
const OPEN_HOOK = /^data-action=(open-[\w-]+)$/;
const HARD_DOWN = /net::ERR_(CONNECTION|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE)/;
const NOT_FOUND_SCREEN = /^(?:404|not-?found)$/i;
const PROBE_SLUGS = ['min-font-size', 'control-height-band', 'wrapped-label', 'tap-target-hit-area', 'invisible-click-blocker', 'timed-popup-occluder', 'sticky-released-occluder', 'icon-stroke-mismatch', 'overlay-viewport-cap', 'text-overlap', 'overlay-close-failed'];

const USAGE = `Usage: node qa_gate.js --root <themeRoot> [--contract <json>] [--base <url> --themeid <id>] [--widths 320,375,768,1024,1440]
       [--coverage-floor 1] [--receipts-only|--probe-only] [--waivers <json>] [--out <dir>]
       node qa_gate.js --classify-receipts <dir> [--root <themeRoot>] [--out <dir>]
       node qa_gate.js --print-probe-bundle [--contract <json>] [--out <dir>]
Exit: 0 PASS, 1 FAIL, 2 UNMEASURED, 3 usage.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { receiptsOnly: false, probeOnly: false, printProbeBundle: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      try {
        return readValue(argv, i, arg);
      } catch (error) {
        throw new UsageError(error.message);
      }
    };
    switch (arg) {
      case '--root': opts.root = value(); i += 1; break;
      case '--contract': opts.contract = value(); i += 1; break;
      case '--base': opts.base = value(); i += 1; break;
      case '--themeid': opts.themeid = value(); i += 1; break;
      case '--widths': opts.widths = parseCsv(value(), (w) => parseFiniteNumber(w, '--widths')); i += 1; break;
      case '--coverage-floor': opts.coverageFloor = parseFiniteNumber(value(), '--coverage-floor'); i += 1; break;
      case '--waivers': opts.waivers = value(); i += 1; break;
      case '--out': opts.out = value(); i += 1; break;
      case '--classify-receipts': opts.classifyReceipts = value(); i += 1; break;
      case '--receipts-only': opts.receiptsOnly = true; break;
      case '--probe-only': opts.probeOnly = true; break;
      case '--print-probe-bundle': opts.printProbeBundle = true; break;
      case '--help': case '-h': throw new UsageError('help requested');
      default: throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  if (opts.receiptsOnly && opts.probeOnly) throw new UsageError('--receipts-only and --probe-only are mutually exclusive');
  if (opts.widths && (!opts.widths.length || opts.widths.some((w) => !Number.isInteger(w) || w <= 0))) throw new UsageError('--widths must be positive integers');
  if (opts.coverageFloor !== undefined && !(opts.coverageFloor > 0 && opts.coverageFloor <= 1)) throw new UsageError('--coverage-floor must be in (0, 1]');
  return opts;
}

function readJsonFile(file, label) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new UsageError(`${label} unreadable at ${file}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`${label} is not valid JSON (${file}): ${error.message}`);
  }
}

function writeOut(dir, name, text) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

function openHooks(contract) {
  const hooks = [];
  for (const feature of Array.isArray(contract.features) ? contract.features : []) {
    for (const hook of Array.isArray(feature.sourceHooks) ? feature.sourceHooks : []) {
      const match = typeof hook === 'string' ? OPEN_HOOK.exec(hook) : null;
      if (match && !hooks.includes(match[1])) hooks.push(match[1]);
    }
  }
  return hooks;
}

function resolveSettings(opts, contract) {
  const gate = contract && contract.qaGate && typeof contract.qaGate === 'object' ? contract.qaGate : {};
  const widths = opts.widths || (Array.isArray(gate.widths) && gate.widths.length ? gate.widths : DEFAULT_WIDTHS);
  const coverageFloor = opts.coverageFloor !== undefined ? opts.coverageFloor : (Number.isFinite(gate.coverageFloor) ? gate.coverageFloor : 1);
  if (!(coverageFloor > 0 && coverageFloor <= 1)) throw new UsageError(`coverage floor ${coverageFloor} must be in (0, 1]`);
  return { widths, coverageFloor };
}

function requireProbeSlugs(registry) {
  const known = new Set(registry.map((entry) => entry.slug));
  const missing = PROBE_SLUGS.filter((slug) => !known.has(slug));
  if (missing.length) throw new UsageError(`defect registry has no entry for probe slug(s): ${missing.join(', ')}`);
}

function pageUrl(base, screenPath, themeid) {
  const url = new URL(screenPath, base);
  if (themeid) url.searchParams.set('themeid', String(themeid));
  return url.toString();
}

function watchNavigation(page) {
  const state = { status: null, url: null };
  page.on('response', (response) => {
    const request = response.request();
    if (request.isNavigationRequest() && response.frame() === page.mainFrame()) {
      state.status = response.status();
      state.url = response.url();
    }
  });
  return state;
}

/** A screen named 404/not-found, or one declaring expectStatus 404, is reachable only when the response is 404 and the body is the theme's own 404 template. */
function expectedStatusOf(contract, screenName) {
  const screen = (Array.isArray(contract.screens) ? contract.screens : []).find((s) => s && String(s.name) === screenName);
  if (screen && screen.expectStatus === 404) return 404;
  return NOT_FOUND_SCREEN.test(screenName) ? 404 : 200;
}

function isThemeNotFound(page) {
  return page.evaluate(() => /404|not-?found/i.test(document.body.className) || !!document.querySelector('[class*="404"],[id*="404"]'));
}

async function measureCell(page, nav, cellInfo, ctx) {
  const { url, hooks, thresholds } = ctx;
  const expectStatus = cellInfo.expectStatus || 200;
  nav.status = null;
  await navigateAndSettle(page, url, { waitMs: SETTLE_MS });
  const finalPath = new URL(page.url()).pathname;
  if (finalPath === '/password') return { unreachable: `redirected to /password (preview locked or not authenticated) for ${url}` };
  if (nav.status !== expectStatus) return { unreachable: `HTTP ${nav.status} for ${url}${expectStatus === 200 ? '' : ` (expected ${expectStatus})`}` };
  if (expectStatus === 404 && !(await isThemeNotFound(page))) return { unreachable: `HTTP 404 for ${url} but the page is not the theme 404 template` };
  await probes.installProbes(page);
  const result = await probes.runPageProbes(page, thresholds);
  const findings = result.findings.map((f) => ({ ...f, state: 'page' }));
  const overlays = [];
  if (result.popups) await page.evaluate(() => window.__registryProbes.hidePopups());
  for (const hook of hooks) {
    const state = await probes.runOverlayState(page, thresholds, hook);
    if (!state.present) continue;
    overlays.push({ hook, opened: state.opened, closeMethod: state.close ? state.close.method : null, escapeClosed: state.close ? state.close.attempts.escape : null, findings: state.findings.length, error: state.error || null });
    findings.push(...state.findings.map((f) => ({ ...f, state: `overlay:${hook}` })));
    if (!state.opened || state.stillOpen) {
      await navigateAndSettle(page, url, { waitMs: SETTLE_MS });
      await probes.installProbes(page);
      if (result.popups) await page.evaluate(() => window.__registryProbes.hidePopups());
    }
  }
  return { findings, overlays, popups: result.popups };
}

async function runProbeCells(ctx) {
  const { cells, widths, deps } = ctx;
  const failures = [];
  const warnings = [];
  const out = [];
  const launch = deps.launchBrowser || probes.launchBrowser;
  let browser;
  try {
    browser = await launch();
  } catch (error) {
    failures.push({ code: 'PREVIEW_UNREACHABLE', rule: null, detail: `browser could not start: ${error.message}` });
    return { failures, warnings, cells: cells.map((c) => ({ source: 'probe', screen: c.screen, path: c.path, width: c.width, status: 'unmeasured', durationMs: 0 })), measured: 0 };
  }
  let hardDown = null;
  try {
    const page = await browser.newPage();
    const nav = watchNavigation(page);
    for (const width of widths) {
      await page.setViewport({ width, height: width <= TOUCH_MAX_WIDTH ? TOUCH_VIEWPORT_HEIGHT : DESKTOP_VIEWPORT_HEIGHT, deviceScaleFactor: 1 });
      for (const cell of cells.filter((c) => c.width === width)) {
        const row = { source: 'probe', screen: cell.screen, path: cell.path, width, status: 'unmeasured', durationMs: 0 };
        out.push(row);
        if (hardDown) continue;
        const started = Date.now();
        const url = pageUrl(ctx.base, cell.path, ctx.themeid);
        let outcome;
        try {
          outcome = await measureCell(page, nav, cell, { url, hooks: ctx.hooks, thresholds: ctx.thresholds });
        } catch (error) {
          outcome = { unreachable: `${error.message} for ${url}`, hard: HARD_DOWN.test(error.message) };
        }
        row.durationMs = Date.now() - started;
        if (outcome.unreachable) {
          row.status = 'unreachable';
          failures.push({ code: 'PREVIEW_UNREACHABLE', rule: null, detail: `${cell.screen}@${width}: ${outcome.unreachable}` });
          if (outcome.hard) hardDown = outcome.unreachable;
          continue;
        }
        row.status = 'measured';
        row.overlays = outcome.overlays;
        row.findings = outcome.findings.length;
        for (const finding of outcome.findings) {
          const entry = ctx.bySlug.get(finding.slug);
          if (!entry) throw new UsageError(`probe emitted slug ${finding.slug} that the defect registry does not know`);
          const item = { code: finding.slug, rule: finding.slug, detail: `${cell.screen}@${width} [${finding.state}] ${finding.selector}: ${finding.detail}` };
          if (entry.tier === 'blocker') failures.push(item);
          else warnings.push({ ...item, tier: entry.tier });
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (hardDown) failures.push({ code: 'PREVIEW_UNREACHABLE', rule: null, detail: `preview host is down, remaining cells not attempted: ${hardDown}` });
  return { failures, warnings, cells: out, measured: out.filter((c) => c.status === 'measured').length };
}

function applyWaivers(failures, waivers) {
  const kept = [];
  const waived = [];
  for (const item of failures) {
    const waiver = item.rule ? waivers.find((w) => w.rule === item.rule) : null;
    if (waiver) waived.push({ rule: waiver.rule, reason: waiver.reason, finding: { code: item.code, detail: item.detail } });
    else kept.push(item);
  }
  return { kept, waived };
}

function verdictOf(failures) {
  if (failures.some((f) => !receiptAudit.UNMEASURED_CODES.has(f.code))) return { verdict: 'FAIL', exitCode: 1 };
  if (failures.length) return { verdict: 'UNMEASURED', exitCode: 2 };
  return { verdict: 'PASS', exitCode: 0 };
}

function summaryLines(report, outFile) {
  const lines = [`QA_GATE ${report.verdict}`];
  for (const f of report.failures) lines.push(`  FAIL ${f.code}${f.rule ? ` [${f.rule}]` : ''}: ${f.detail}`);
  for (const w of report.waived) lines.push(`  WAIVED ${w.rule}: ${w.reason}`);
  for (const w of report.warnings) lines.push(`  WARN ${w.code}: ${w.detail}`);
  lines.push(`  coverage ${report.coverage.measured}/${report.coverage.expected}`);
  if (outFile) lines.push(`  report ${outFile}`);
  return lines;
}

async function classify(opts) {
  const result = receiptAudit.classifyReceipts(opts.classifyReceipts, { root: opts.root });
  const outDir = opts.out || process.cwd();
  const file = writeOut(outDir, 'classification.json', `${JSON.stringify(result, null, 2)}\n`);
  const lines = [`classified ${result.total} receipt(s) in ${result.groups.length} group(s), ${result.unparseable.length} unparseable; nothing was deleted`, `  ${file}`];
  for (const g of result.groups) lines.push(`  ${g.count}\t${g.host}\t${g.workspaceRoot}${g.matchesRoot === null ? '' : g.matchesRoot ? '\t(theme root)' : ''}`);
  return { exitCode: 0, lines, classification: result };
}

async function printBundle(opts) {
  const contract = opts.contract ? readJsonFile(opts.contract, 'contract') : null;
  const thresholds = loadThresholds({ contract });
  const call = `window.__registryProbes.run(${JSON.stringify(thresholds)})`;
  if (opts.out) {
    const file = writeOut(opts.out, 'registry-probes.browser.js', probes.bundleSource());
    return { exitCode: 0, lines: [`probe bundle written to ${file}`, `evaluate the file once per page load, then evaluate: ${call}`] };
  }
  return { exitCode: 0, lines: [probes.bundleSource().trimEnd()], rawStdout: true };
}

async function runGate(opts, deps = {}) {
  if (!opts.root) throw new UsageError('--root <themeRoot> is required');
  const root = path.resolve(opts.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new UsageError(`--root is not a directory: ${root}`);
  if (!opts.contract) throw new UsageError('--contract <json> is required: expected cells come from the contract screens');
  const contract = readJsonFile(opts.contract, 'contract');
  const registry = deps.registry || readRegistry();
  requireProbeSlugs(registry);
  const bySlug = new Map(registry.map((entry) => [entry.slug, entry]));
  const waivers = opts.waivers ? loadWaivers(opts.waivers, registry) : [];
  const { widths, coverageFloor } = resolveSettings(opts, contract);
  const thresholds = loadThresholds({ contract });
  const doReceipts = !opts.probeOnly;
  const doProbes = !opts.receiptsOnly;
  if (doProbes && !opts.base) throw new UsageError('--base <url> is required for probes (use --receipts-only to audit receipts alone)');
  if (doProbes) {
    try {
      new URL(opts.base);
    } catch (_) {
      throw new UsageError(`--base is not a URL: ${opts.base}`);
    }
  }

  const failures = [];
  const warnings = [];
  const notes = [];
  const cells = [];
  const bySource = {};

  if (doReceipts) {
    const receiptsDir = path.join(root, '.antifan', 'qa-receipts');
    const audit = receiptAudit.auditReceipts({ root, receiptsDir, contract, widths, coverageFloor, debtFile: path.join(root, '.antifan', 'qa-debt.json'), contentIndexFile: path.join(root, '.antifan', 'qa-content-index.json') });
    failures.push(...audit.failures);
    notes.push(...audit.notes);
    cells.push(...audit.cells);
    bySource.receipt = { expected: audit.expected, measured: audit.measured };
  }
  if (doProbes) {
    const { cells: expectedRaw, missingPath } = receiptAudit.expectedCells(contract, widths);
    const expected = expectedRaw.map((cell) => ({ ...cell, expectStatus: expectedStatusOf(contract, cell.screen) }));
    if (!doReceipts && missingPath.length) failures.push({ code: 'SCREEN_PATH_MISSING', rule: null, detail: `contract screen(s) without a path: ${missingPath.join(', ')}` });
    if (expected.length) {
      const result = await runProbeCells({ cells: expected, widths, base: opts.base, themeid: opts.themeid, thresholds, hooks: openHooks(contract), bySlug, deps });
      failures.push(...result.failures);
      warnings.push(...result.warnings);
      cells.push(...result.cells);
      bySource.probe = { expected: expected.length, measured: result.measured };
    } else {
      bySource.probe = { expected: 0, measured: 0 };
    }
  }

  const { kept, waived } = applyWaivers(failures, waivers);
  const { verdict, exitCode } = verdictOf(kept);
  const report = {
    verdict,
    failures: kept,
    waived,
    warnings,
    notes,
    coverage: {
      expected: Object.values(bySource).reduce((n, s) => n + s.expected, 0),
      measured: Object.values(bySource).reduce((n, s) => n + s.measured, 0),
      bySource,
      cells
    },
    root,
    contract: path.resolve(opts.contract),
    mode: doReceipts && doProbes ? 'receipts+probes' : doReceipts ? 'receipts-only' : 'probe-only',
    base: doProbes ? opts.base : null,
    themeid: opts.themeid || null,
    widths,
    coverageFloor,
    thresholds,
    generatedAt: new Date().toISOString()
  };
  let outFile = null;
  if (opts.out) outFile = writeOut(opts.out, 'qa-gate-report.json', `${JSON.stringify(report, null, 2)}\n`);
  return { exitCode, report, lines: summaryLines(report, outFile) };
}

async function main(argv, deps = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.printProbeBundle) return await printBundle(opts);
    if (opts.classifyReceipts) return await classify(opts);
    return await runGate(opts, deps);
  } catch (error) {
    const detail = error instanceof UsageError ? error.message : (error.stack || error.message);
    return { exitCode: 3, lines: [`qa_gate: ${detail}`, USAGE], usage: true };
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((result) => {
    const stream = result.exitCode === 3 ? process.stderr : process.stdout;
    stream.write(`${result.lines.join('\n')}\n`);
    process.exit(result.exitCode);
  });
}

module.exports = { parseArgs, runGate, main, openHooks, UsageError, USAGE };
