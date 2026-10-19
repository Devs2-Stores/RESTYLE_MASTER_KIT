'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const KIT_ROOT = path.resolve(__dirname, '..');
const QA_FIXTURES = path.join(__dirname, 'fixtures', 'qa');
const RECEIPT_FIXTURES = path.join(QA_FIXTURES, 'receipts');
const GATE = path.join(KIT_ROOT, 'qa_gate.js');
const registry = require('../lib/registry');
const gate = require('../qa_gate');
const probes = require('../lib/registry-probes');
const { sleep } = require('../lib/puppeteer-utils');

let passed = 0;
let failed = 0;
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label);
  ok ? passed++ : failed++;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-gate-tests-'));
let tmpCounter = 0;
function tmpDir(name) {
  tmpCounter += 1;
  const dir = path.join(TMP, `${tmpCounter}-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function removeTree(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) removeTree(full);
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(dir);
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const HOUR = 3600 * 1000;

/** Builds a theme root, receipts and contract from receipts/<case>/case.json. Receipt mtimes are set explicitly, never inherited from git. */
function materialize(caseName, tweak = {}) {
  const spec = JSON.parse(fs.readFileSync(path.join(RECEIPT_FIXTURES, caseName, 'case.json'), 'utf8'));
  const dir = tmpDir(caseName);
  const root = path.join(dir, 'theme');
  copyDir(path.join(RECEIPT_FIXTURES, 'theme'), root);
  const themeTime = new Date(Date.now() - 2 * HOUR);
  for (const file of listFiles(root)) fs.utimesSync(file, themeTime, themeTime);
  const receiptsDir = path.join(root, '.antifan', 'qa-receipts');
  fs.mkdirSync(receiptsDir, { recursive: true });
  const template = JSON.parse(fs.readFileSync(path.join(RECEIPT_FIXTURES, spec.template || 'receipt.template.json'), 'utf8'));
  const hasViewport = !!template.viewport;
  const workspaceRoot = spec.root === 'theme' ? root : spec.root;
  const receiptTime = spec.receiptAge === 'older-than-theme' ? new Date(themeTime.getTime() - HOUR) : new Date(themeTime.getTime() + HOUR);
  let n = 0;
  for (const p of spec.paths) {
    for (const width of spec.widths) {
      n += 1;
      const receipt = {
        ...template,
        workspaceRoot,
        ...(template.workspaceRootRequested ? { workspaceRootRequested: workspaceRoot } : {}),
        expectedUrl: `https://qa-fixture.myharavan.com${p}?themeid=1`,
        observedUrl: `https://qa-fixture.myharavan.com${p}?themeid=1`,
        ...(hasViewport ? { viewport: { width, height: 812 } } : {}),
        ...(spec.overrides || {}),
        ...(tweak.receiptOverrides || {})
      };
      if (tweak.dropReceipt && tweak.dropReceipt(p, width)) continue;
      const file = path.join(receiptsDir, `${1792000000000 + n}-run-fixture.json`);
      fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
      fs.utimesSync(file, receiptTime, receiptTime);
    }
  }
  for (const [name, text] of Object.entries(spec.extraFiles || {})) {
    const file = path.join(receiptsDir, name);
    fs.writeFileSync(file, text);
    const newest = new Date(receiptTime.getTime() + 60 * 1000);
    fs.utimesSync(file, newest, newest);
  }
  const contract = JSON.parse(fs.readFileSync(path.join(RECEIPT_FIXTURES, 'contract.json'), 'utf8'));
  if (tweak.contract) tweak.contract(contract);
  const contractFile = path.join(dir, 'contract.json');
  fs.writeFileSync(contractFile, JSON.stringify(contract, null, 2));
  return { dir, root, receiptsDir, contractFile, themeTime, receiptTime };
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', cwd: options.cwd || KIT_ROOT, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function gateReceipts(fx, extra = []) {
  const out = path.join(fx.dir, 'out');
  const result = runCli(['--root', fx.root, '--receipts-only', '--contract', fx.contractFile, '--coverage-floor', '1', '--out', out, ...extra]);
  const reportFile = path.join(out, 'qa-gate-report.json');
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
  return { ...result, report, codes: report ? report.failures.map((f) => f.code) : [] };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function startFixtureServer(root, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'browser-fixture-server.js'), root, String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('fixture server did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('browser-fixture-server')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('error', reject);
  });
}

function blockerRegistry() {
  return registry.readRegistry().map((entry) => ({ ...entry, tier: 'blocker' }));
}

async function main() {
  // 1. registry wiring for the slugs this gate owns
  const entries = registry.readRegistry();
  const mine = entries.filter((e) => e.gate === 'receipt' || e.gate === 'probe' || ['icon-stroke-mismatch', 'overlay-viewport-cap', 'font-below-min'].includes(e.slug));
  check('registry: receipt and probe entries are present', ['wrong-root-receipt', 'zero-coverage', 'stale-receipt', 'degraded-run', 'min-font-size', 'control-height-band', 'wrapped-label', 'tap-target-hit-area', 'invisible-click-blocker', 'timed-popup-occluder', 'sticky-released-occluder', 'text-overlap', 'overlay-close-failed'].every((slug) => entries.some((e) => e.slug === slug)));
  const missingFixtures = mine.flatMap((e) => registry.missingFixtures(e));
  check(`registry: every receipt/probe fixture exists (${missingFixtures.length} missing)`, missingFixtures.length === 0);
  const sources = ['qa_gate.js', 'lib/receipt-audit.js', 'lib/registry-probes.js', 'lib/registry-probes.browser.js'].map((f) => fs.readFileSync(path.join(KIT_ROOT, f), 'utf8')).join('\n');
  check('thresholds: no numeric default for any registry threshold in gate code', !/(minTextPx|minTapHitPx)\s*[:=]\s*\d/.test(sources));
  const bundleText = fs.readFileSync(path.join(KIT_ROOT, 'lib', 'registry-probes.browser.js'), 'utf8');
  check('bundle: self-contained, no require()', !/\brequire\s*\(/.test(bundleText) && !/\bimport\s/.test(bundleText));

  // 2. receipt audit through the real CLI
  const pass = gateReceipts(materialize('pass'));
  check('receipts pass: exit 0', pass.status === 0);
  check('receipts pass: 15 of 15 cells measured, no failures', !!pass.report && pass.report.coverage.measured === 15 && pass.report.coverage.expected === 15 && pass.report.failures.length === 0 && pass.report.verdict === 'PASS');
  check('receipts pass: cells carry screen, path, width, status, durationMs', !!pass.report && pass.report.coverage.cells.length === 15 && pass.report.coverage.cells.every((c) => c.screen && c.path && c.width && c.status === 'measured' && typeof c.durationMs === 'number'));

  const wrong = gateReceipts(materialize('wrong-root'));
  check('receipts wrong-root: exit 1 with RECEIPT_WRONG_ROOT', wrong.status === 1 && wrong.codes.includes('RECEIPT_WRONG_ROOT'));
  check('receipts wrong-root: coverage is 0 of 15 and below the floor', !!wrong.report && wrong.report.coverage.measured === 0 && wrong.codes.includes('COVERAGE_BELOW_FLOOR'));
  check('receipts wrong-root: failure rule is the registry slug', !!wrong.report && wrong.report.failures.find((f) => f.code === 'RECEIPT_WRONG_ROOT').rule === 'wrong-root-receipt');

  const zero = gateReceipts(materialize('zero-coverage'));
  check('receipts zero-coverage: exit 1 with COVERAGE_BELOW_FLOOR and 0 measured', zero.status === 1 && zero.codes.includes('COVERAGE_BELOW_FLOOR') && zero.report.coverage.measured === 0);

  const fx14 = materialize('pass', { dropReceipt: (p, width) => p === '/' && width === 320 });
  const short = gateReceipts(fx14);
  check('receipts 14 of 15 with floor 1: exit 1 COVERAGE_BELOW_FLOOR', short.status === 1 && short.codes.includes('COVERAGE_BELOW_FLOOR') && short.report.coverage.measured === 14);
  const lenient = runCli(['--root', fx14.root, '--receipts-only', '--contract', fx14.contractFile, '--coverage-floor', '0.9']);
  check('receipts 14 of 15 with floor 0.9: exit 0', lenient.status === 0);

  const staleFx = materialize('stale', { receiptOverrides: { createdAt: '2099-01-01T00:00:00.000Z' } });
  const stale = gateReceipts(staleFx);
  check('receipts stale (file mtime older than theme, createdAt in the future): exit 1 RECEIPT_STALE', stale.status === 1 && stale.codes.includes('RECEIPT_STALE'));
  const touched = materialize('pass');
  const later = new Date(Date.now() + 5 * 60 * 1000);
  fs.utimesSync(path.join(touched.root, 'assets', 'theme.css'), later, later);
  const afterEdit = gateReceipts(touched);
  check('receipts pass then a theme file is edited: exit 1 RECEIPT_STALE', afterEdit.status === 1 && afterEdit.codes.includes('RECEIPT_STALE'));
  const touchOnly = materialize('pass');
  check('receipts pass seeds the content index', gateReceipts(touchOnly).status === 0 && fs.existsSync(path.join(touchOnly.root, '.antifan', 'qa-content-index.json')));
  const cssFile = path.join(touchOnly.root, 'assets', 'theme.css');
  fs.utimesSync(cssFile, later, later);
  const afterTouch = gateReceipts(touchOnly);
  check('receipts pass then a theme file is touched with identical bytes: still exit 0', afterTouch.status === 0 && !afterTouch.codes.includes('RECEIPT_STALE'));
  fs.appendFileSync(cssFile, '\n.qa-content-change { color: red; }\n');
  fs.utimesSync(cssFile, later, later);
  const afterContent = gateReceipts(touchOnly);
  check('receipts pass then a touched file changes bytes: exit 1 RECEIPT_STALE', afterContent.status === 1 && afterContent.codes.includes('RECEIPT_STALE'));

  const degraded = gateReceipts(materialize('degraded'));
  check('receipts degraded: exit 1 with RECEIPT_DEGRADED', degraded.status === 1 && degraded.codes.includes('RECEIPT_DEGRADED'));

  const unparse = gateReceipts(materialize('unparseable'));
  check('receipts unparseable newest: exit 1 RECEIPT_UNPARSEABLE', unparse.status === 1 && unparse.codes.includes('RECEIPT_UNPARSEABLE'));

  const emptyFx = materialize('pass');
  for (const f of fs.readdirSync(emptyFx.receiptsDir)) fs.unlinkSync(path.join(emptyFx.receiptsDir, f));
  const empty = gateReceipts(emptyFx);
  check('receipts empty dir: exit 2 RECEIPTS_MISSING', empty.status === 2 && empty.codes.includes('RECEIPTS_MISSING') && empty.report.verdict === 'UNMEASURED');

  const noDirFx = materialize('pass');
  removeTree(path.join(noDirFx.root, '.antifan'));
  check('receipts dir absent: exit 2 RECEIPTS_MISSING', gateReceipts(noDirFx).status === 2);

  const noPathFx = materialize('pass', { contract: (c) => { delete c.screens.find((s) => s.name === 'product').path; } });
  const noPath = gateReceipts(noPathFx);
  check('contract screen without path: exit 2 SCREEN_PATH_MISSING naming the screen', noPath.status === 2 && noPath.codes.includes('SCREEN_PATH_MISSING') && /product/.test(noPath.report.failures.find((f) => f.code === 'SCREEN_PATH_MISSING').detail));
  check('contract: shell screen has no path and is not reported', !/shell/.test(noPath.report.failures.find((f) => f.code === 'SCREEN_PATH_MISSING').detail));

  const real12 = gateReceipts(materialize('v1.2-real-shape'));
  check('receipts real v1.2 shape without a coverage field: exit 0, 15 of 15 measured, no RECEIPT_DEGRADED', real12.status === 0 && real12.report.coverage.measured === 15 && !real12.codes.includes('RECEIPT_DEGRADED'));
  const real12Wrong = gateReceipts(materialize('v1.2-real-shape', { receiptOverrides: { workspaceRoot: 'C:\\Other\\Project' } }));
  check('receipts real v1.2 shape with another workspaceRoot: exit 1 RECEIPT_WRONG_ROOT', real12Wrong.status === 1 && real12Wrong.codes.includes('RECEIPT_WRONG_ROOT'));
  const legacy = gateReceipts(materialize('v1.1-legacy'));
  check('receipts v1.1 (no viewport, no execution) never cover a cell: exit 1, 0 measured', legacy.status === 1 && legacy.report.coverage.measured === 0 && legacy.codes.includes('COVERAGE_BELOW_FLOOR'));
  check('receipts v1.1 for this root are reported as RECEIPT_DEGRADED (legacy, cannot prove a cell)', legacy.codes.includes('RECEIPT_DEGRADED') && /1\.1/.test(legacy.report.failures.find((f) => f.code === 'RECEIPT_DEGRADED').detail));
  const mixed = materialize('v1.2-real-shape');
  const legacyTemplate = JSON.parse(fs.readFileSync(path.join(RECEIPT_FIXTURES, 'receipt.v1.1.template.json'), 'utf8'));
  fs.writeFileSync(path.join(mixed.receiptsDir, '1-legacy.json'), JSON.stringify({ ...legacyTemplate, workspaceRoot: mixed.root }));
  const mixedRun = gateReceipts(mixed);
  check('receipts: a legacy v1.1 receipt next to full v1.2 coverage still fails RECEIPT_DEGRADED but coverage stays 15 of 15', mixedRun.status === 1 && mixedRun.report.coverage.measured === 15 && mixedRun.codes.includes('RECEIPT_DEGRADED') && !mixedRun.codes.includes('COVERAGE_BELOW_FLOOR'));

  const v12 = gateReceipts(materialize('pass', { receiptOverrides: { receiptVersion: '1.2', profile: undefined, measuredRules: undefined, coverage: undefined, workspaceRootRequested: undefined, workspaceRootRedirected: undefined, callId: undefined } }));
  check('receipts v1.2 shape is accepted', v12.status === 0);
  const redirected = gateReceipts(materialize('pass', { receiptOverrides: { workspaceRootRedirected: true } }));
  check('receipts v1.3 redirected workspaceRoot: exit 1 RECEIPT_WRONG_ROOT', redirected.status === 1 && redirected.codes.includes('RECEIPT_WRONG_ROOT'));
  const nativeShort = gateReceipts(materialize('pass', { receiptOverrides: { coverage: { measured: 3, expected: 5, viewports: [375] } } }));
  check('receipts v1.3 with native coverage below expected: exit 1 RECEIPT_DEGRADED', nativeShort.status === 1 && nativeShort.codes.includes('RECEIPT_DEGRADED'));
  const failedRun = gateReceipts(materialize('pass', { receiptOverrides: { verdict: 'QA_FAILED', passed: false } }));
  check('receipts completed QA_FAILED are not coverage: exit 1 COVERAGE_BELOW_FLOOR', failedRun.status === 1 && failedRun.codes.includes('COVERAGE_BELOW_FLOOR') && failedRun.report.coverage.measured === 0);

  const debtOpen = materialize('pass');
  fs.writeFileSync(path.join(debtOpen.root, '.antifan', 'qa-debt.json'), JSON.stringify({ root: debtOpen.root, since: new Date(Date.now() + 10 * 60 * 1000).toISOString(), files: ['assets/theme.css'] }));
  const debtRun = gateReceipts(debtOpen);
  check('qa debt newer than every passing receipt: exit 1 RECEIPT_STALE naming the debt', debtRun.status === 1 && debtRun.report.failures.some((f) => f.code === 'RECEIPT_STALE' && /qa debt/.test(f.detail)));
  const debtCleared = materialize('pass');
  fs.writeFileSync(path.join(debtCleared.root, '.antifan', 'qa-debt.json'), JSON.stringify({ root: debtCleared.root, since: new Date(debtCleared.themeTime.getTime() + 60 * 1000).toISOString(), files: ['assets/theme.css'] }));
  check('qa debt older than a passing receipt is cleared: exit 0', gateReceipts(debtCleared).status === 0);
  const debtBroken = materialize('pass');
  fs.writeFileSync(path.join(debtBroken.root, '.antifan', 'qa-debt.json'), '{ broken');
  check('qa debt file unparseable: exit 1 RECEIPT_UNPARSEABLE', gateReceipts(debtBroken).codes.includes('RECEIPT_UNPARSEABLE'));

  // waivers
  const waiverFx = materialize('stale');
  const waiverFile = path.join(waiverFx.dir, 'waivers.json');
  fs.writeFileSync(waiverFile, JSON.stringify([{ rule: 'stale-receipt', reason: 'fixture waiver for the stale rule' }, { rule: 'zero-coverage', reason: 'fixture waiver for the coverage rule' }]));
  const waived = gateReceipts(waiverFx, ['--waivers', waiverFile]);
  check('waivers: waived failures leave exit 0 and are listed with reason', waived.status === 0 && waived.report.waived.length >= 2 && waived.report.waived.every((w) => w.rule && w.reason && w.finding));
  fs.writeFileSync(waiverFile, JSON.stringify([{ rule: 'stale-receipt', reason: 'short' }]));
  check('waivers: reason under 10 chars is a usage error (exit 3)', gateReceipts(waiverFx, ['--waivers', waiverFile]).status === 3);
  fs.writeFileSync(waiverFile, JSON.stringify([{ rule: 'not-a-slug', reason: 'a long enough reason text' }]));
  check('waivers: rule that is not a registry slug is a usage error (exit 3)', gateReceipts(waiverFx, ['--waivers', waiverFile]).status === 3);
  const unwaivable = materialize('pass');
  for (const f of fs.readdirSync(unwaivable.receiptsDir)) fs.unlinkSync(path.join(unwaivable.receiptsDir, f));
  fs.writeFileSync(waiverFile, JSON.stringify([{ rule: 'zero-coverage', reason: 'cannot waive a missing receipt set' }]));
  check('waivers: RECEIPTS_MISSING is never waivable (still exit 2)', gateReceipts(unwaivable, ['--waivers', waiverFile]).status === 2);

  // usage
  check('usage: no arguments exit 3', runCli([]).status === 3);
  check('usage: missing --contract exit 3', runCli(['--root', pass.report.root, '--receipts-only']).status === 3);
  check('usage: unknown flag exit 3', runCli(['--root', pass.report.root, '--bogus']).status === 3);
  check('usage: --receipts-only with --probe-only exit 3', runCli(['--root', pass.report.root, '--contract', pass.report.contract, '--receipts-only', '--probe-only']).status === 3);
  check('usage: probes without --base exit 3', runCli(['--root', pass.report.root, '--contract', pass.report.contract]).status === 3);
  check('usage: coverage floor above 1 exit 3', runCli(['--root', pass.report.root, '--contract', pass.report.contract, '--receipts-only', '--coverage-floor', '2']).status === 3);
  check('usage: missing contract file exit 3', runCli(['--root', pass.report.root, '--contract', path.join(TMP, 'missing.json'), '--receipts-only']).status === 3);

  // classification deletes nothing
  const classDir = tmpDir('classify');
  const classReceipts = path.join(classDir, 'receipts');
  fs.mkdirSync(classReceipts);
  const template = JSON.parse(fs.readFileSync(path.join(RECEIPT_FIXTURES, 'receipt.template.json'), 'utf8'));
  const legacyOne = JSON.parse(fs.readFileSync(path.join(RECEIPT_FIXTURES, 'receipt.v1.1.template.json'), 'utf8'));
  const seed = [['E:\\Work\\apps\\AntiFan', 'sky-fashion.myharavan.com', 3], ['E:\\Work\\apps\\AntiFan', 'timer-watch.myharavan.com', 2], ['E:\\Work\\themes\\sky', 'sky-fashion.myharavan.com', 1]];
  let seq = 0;
  for (const [workspaceRoot, host, count] of seed) {
    for (let i = 0; i < count; i += 1) {
      seq += 1;
      fs.writeFileSync(path.join(classReceipts, `${seq}-run.json`), JSON.stringify({ ...template, workspaceRoot, observedUrl: `https://${host}/?themeid=1` }));
    }
  }
  fs.writeFileSync(path.join(classReceipts, '98-legacy-v1.1.json'), JSON.stringify({ ...legacyOne, workspaceRoot: 'E:\\Work\\apps\\AntiFan', observedUrl: 'https://rog-bike.myharavan.com/?themeid=2' }));
  fs.writeFileSync(path.join(classReceipts, '99-broken.json'), '{');
  const before = fs.readdirSync(classReceipts).sort().join('|');
  const classOut = path.join(classDir, 'out');
  const classRun = runCli(['--classify-receipts', classReceipts, '--root', 'E:\\Work\\themes\\sky', '--out', classOut]);
  const classification = fs.existsSync(path.join(classOut, 'classification.json')) ? JSON.parse(fs.readFileSync(path.join(classOut, 'classification.json'), 'utf8')) : null;
  check('classify: exit 0 and classification.json written', classRun.status === 0 && !!classification);
  check('classify: groups by workspaceRoot and observed host with file lists', !!classification && classification.total === 8 && classification.groups.length === 4 && classification.groups.some((g) => g.host === 'rog-bike.myharavan.com' && g.count === 1) && classification.groups[0].count === 3 && classification.groups[0].files.length === 3 && classification.unparseable.length === 1);
  check('classify: marks the group matching --root', !!classification && classification.groups.filter((g) => g.matchesRoot).length === 1);
  check('classify: deletes nothing', fs.readdirSync(classReceipts).sort().join('|') === before);

  // probe bundle printing
  const bundleOut = tmpDir('bundle');
  const bundleContract = path.join(bundleOut, 'contract.json');
  fs.writeFileSync(bundleContract, JSON.stringify({ designDefaults: { typeScale: { minTextPx: 14 } } }));
  const printed = runCli(['--print-probe-bundle', '--contract', bundleContract, '--out', bundleOut]);
  const bundleFile = path.join(bundleOut, 'registry-probes.browser.js');
  check('print-probe-bundle: writes the browser bundle', printed.status === 0 && fs.existsSync(bundleFile) && fs.readFileSync(bundleFile, 'utf8') === probes.bundleSource());
  check('print-probe-bundle: call expression carries registry thresholds with the contract override', /"minTextPx":14/.test(printed.stdout) && /"minTapHitPx":24/.test(printed.stdout));
  const bareBundle = runCli(['--print-probe-bundle']);
  check('print-probe-bundle: without --out prints the bundle to stdout', bareBundle.status === 0 && bareBundle.stdout.includes('window.__registryProbes = api'));

  await probeTests();
}

const PROBE_CASES = [
  { slug: 'min-font-size', fixture: 'min-font-size', width: 375, height: 800 },
  { slug: 'control-height-band', fixture: 'control-height-band', width: 375, height: 800 },
  { slug: 'wrapped-label', fixture: 'wrapped-label', width: 375, height: 800 },
  { slug: 'tap-target-hit-area', fixture: 'tap-target-hit-area', width: 1024, height: 800 },
  { slug: 'invisible-click-blocker', fixture: 'invisible-click-blocker', width: 1024, height: 800 },
  { slug: 'timed-popup-occluder', fixture: 'timed-popup-occluder', width: 1024, height: 800, waitMs: 700 },
  { slug: 'sticky-released-occluder', fixture: 'sticky-released-occluder', width: 1440, height: 900, scroll: { bad: 300, good: 600 } },
  { slug: 'icon-stroke-mismatch', fixture: 'icon-stroke', width: 1024, height: 800 },
  { slug: 'text-overlap', fixture: 'text-overlap', width: 1024, height: 800 }
];

async function openFixture(browser, base, name, viewport, waitMs = 100) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
  await page.goto(`${base}/${name}.html`, { waitUntil: 'load' });
  await sleep(waitMs);
  await probes.installProbes(page);
  return page;
}

function runAll(page, thresholds, names) {
  return page.evaluate((t, probesToRun) => window.__registryProbes.run(t, probesToRun ? { probes: probesToRun } : {}), thresholds, names || null);
}

async function probeTests() {
  const thresholds = registry.loadThresholds();
  const port = await freePort();
  let server = null;
  let browser = null;
  let launchError = null;
  try {
    server = await startFixtureServer(QA_FIXTURES, port);
    browser = await probes.launchBrowser();
  } catch (error) {
    launchError = error;
  }
  const base = `http://127.0.0.1:${port}`;
  if (launchError) {
    check(`chromium: probe tests need a launchable Chromium (${launchError.message})`, false);
    for (const c of PROBE_CASES) {
      check(`probe ${c.slug}: bad page yields exactly its slug`, false);
      check(`probe ${c.slug}: good page yields 0 findings`, false);
    }
    for (const label of ['overlay-viewport-cap bad', 'overlay-viewport-cap good', 'overlay-close-failed bad', 'overlay-close-failed good', 'overlay close by Escape dispatched to the page', 'gate end-to-end']) check(`probe ${label}`, false);
    if (server) server.kill();
    return;
  }
  check('chromium: launched', true);
  try {
    for (const c of PROBE_CASES) {
      const viewport = { width: c.width, height: c.height };
      for (const side of ['bad', 'good']) {
        const page = await openFixture(browser, base, `${c.fixture}-${side}`, viewport, c.waitMs);
        if (c.scroll) {
          await page.evaluate((y) => window.scrollTo(0, y), c.scroll[side]);
          await sleep(100);
        }
        const result = await runAll(page, thresholds);
        const slugs = [...new Set(result.findings.map((f) => f.slug))];
        if (side === 'bad') check(`probe ${c.slug}: bad page yields exactly its slug (${slugs.join(',') || 'none'})`, slugs.length === 1 && slugs[0] === c.slug);
        else check(`probe ${c.slug}: good page yields 0 findings (${result.findings.map((f) => f.detail).join(' | ') || 'none'})`, result.findings.length === 0);
        check(`probe ${c.slug}: ${side} findings carry slug, selector and detail`, side === 'good' || result.findings.every((f) => f.slug && f.selector && f.detail));
        await page.close();
      }
    }

    // tap target: hit area, not the element box
    let page = await openFixture(browser, base, 'tap-target-hit-area-good', { width: 375, height: 800 });
    let result = await runAll(page, thresholds, ['tap-target-hit-area']);
    check('tap-target: 16px box with 24px ::before hit area is not flagged at 375', result.findings.length === 0);
    const metrics = await page.evaluate(() => {
      const el = document.querySelector('a.sw');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el, '::before');
      return { box: r.width, pseudoW: parseFloat(cs.width), pseudoH: parseFloat(cs.height), left: parseFloat(cs.left) };
    });
    check('tap-target: computed pseudo metrics are 24x24 at -4px around a 16px box', metrics.box === 16 && metrics.pseudoW === 24 && metrics.pseudoH === 24 && metrics.left === -4);
    await page.close();
    page = await openFixture(browser, base, 'tap-target-hit-area-bad', { width: 1024, height: 800 });
    result = await runAll(page, thresholds, ['tap-target-hit-area']);
    check('tap-target: bare 16px box is flagged for every swatch', result.findings.length === 3 && result.findings.every((f) => /16px x 16px < 24px/.test(f.detail)));
    await page.close();

    // control height: same-role mismatch only; a compact height is not a defect at touch widths
    page = await openFixture(browser, base, 'control-height-band-bad', { width: 1024, height: 800 });
    result = await runAll(page, thresholds, ['control-height-band']);
    check('control-height-band: same-role siblings with unequal heights are flagged on desktop', result.findings.length === 1 && /differs from same-role sibling/.test(result.findings[0].detail));
    await page.close();
    page = await openFixture(browser, base, 'control-height-band-good', { width: 375, height: 800 });
    result = await runAll(page, thresholds);
    check('control height: two equal 36px buttons raise no finding at 375', result.findings.length === 0, JSON.stringify(result.findings));
    await page.close();
    page = await openFixture(browser, base, 'tap-target-hit-area-bad', { width: 375, height: 800 });
    result = await runAll(page, thresholds);
    check('slug ownership: a sub-24px control is reported by tap-target-hit-area only, not also by control-height-band', result.findings.every((f) => f.slug === 'tap-target-hit-area'));
    await page.close();

    // thresholds come from the caller
    page = await openFixture(browser, base, 'min-font-size-good', { width: 375, height: 800 });
    result = await runAll(page, { ...thresholds, minTextPx: 14 }, ['min-font-size']);
    check('thresholds: a contract typeScale override (minTextPx 14) flags the 12px caption', result.findings.length === 1);
    const thrown = await page.evaluate(() => { try { window.__registryProbes.run({}); return null; } catch (e) { return e.message; } });
    check('thresholds: running without thresholds throws instead of using a default', typeof thrown === 'string' && /thresholds/.test(thrown));
    await page.close();

    // sticky: counted only while stuck
    page = await openFixture(browser, base, 'sticky-released-occluder-bad', { width: 1440, height: 900 });
    result = await runAll(page, thresholds, ['sticky-released-occluder']);
    check('sticky: not yet stuck at scrollY 0 is not an occluder', result.findings.length === 0);
    await page.evaluate(() => window.scrollTo(0, 300));
    await sleep(100);
    const stuck = await page.evaluate(() => { const el = document.querySelector('.gallery'); return { top: el.getBoundingClientRect().top, cssTop: parseFloat(getComputedStyle(el).top) }; });
    check('sticky: bad page gallery is stuck (rect.top equals computed top)', Math.abs(stuck.top - stuck.cssTop) <= 1);
    await page.close();
    page = await openFixture(browser, base, 'sticky-released-occluder-good', { width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 600));
    await sleep(100);
    const released = await page.evaluate(() => { const el = document.querySelector('.gallery'); const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, cssTop: parseFloat(getComputedStyle(el).top), header: document.querySelector('.hdr').getBoundingClientRect().bottom }; });
    check('sticky: good page reproduces the released gallery (rect.top far from computed top, still over the header band)', Math.abs(released.top - released.cssTop) > 100 && released.top < released.header && released.bottom > 0);
    result = await runAll(page, thresholds, ['sticky-released-occluder']);
    check('sticky: released gallery above the header is not an occluder', result.findings.length === 0);
    await page.close();

    // timed popup is its own slug
    page = await openFixture(browser, base, 'timed-popup-occluder-bad', { width: 1024, height: 800 }, 0);
    result = await runAll(page, thresholds);
    check('timed popup: before the timer fires there is nothing to report', result.findings.length === 0);
    await sleep(700);
    result = await runAll(page, thresholds);
    check('timed popup: opened by setTimeout reports timed-popup-occluder and no page-level occlusion slug', result.findings.length === 1 && result.findings[0].slug === 'timed-popup-occluder');
    result = await runAll(page, thresholds, ['sticky-released-occluder', 'invisible-click-blocker']);
    check('timed popup: sticky and blocker probes do not report the popup as occluding the page', result.findings.length === 0);
    const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('nl')).display);
    check('timed popup: the popup is restored after the probe run', hidden === 'flex');
    await page.close();
    page = await openFixture(browser, base, 'timed-popup-occluder-good', { width: 1024, height: 800 }, 700);
    result = await runAll(page, thresholds);
    check('timed popup: a dismissible toast (aria-label close, not covering content) is clean', result.popups === 1 && result.findings.length === 0);
    await page.evaluate(() => document.querySelector('.toast__close').removeAttribute('aria-label'));
    await page.evaluate(() => { document.querySelector('.toast__close').textContent = ''; });
    result = await runAll(page, thresholds, ['timed-popup-occluder']);
    check('timed popup: a toast without any close name is reported as not dismissible', result.findings.length === 1 && /no visible close control/.test(result.findings[0].detail));
    await page.close();

    // decorative aria-hidden text
    page = await openFixture(browser, base, 'text-overlap-good', { width: 1024, height: 800 });
    result = await runAll(page, thresholds, ['text-overlap']);
    check('text-overlap: aria-hidden watermark under a heading is never text-over-text', result.findings.length === 0);
    await page.evaluate(() => document.querySelector('.watermark').removeAttribute('aria-hidden'));
    result = await runAll(page, thresholds, ['text-overlap']);
    check('text-overlap: the same watermark without aria-hidden is flagged', result.findings.length === 1 && result.findings[0].slug === 'text-overlap');
    await page.close();

    page = await openFixture(browser, base, 'text-overlap-hidden-good', { width: 1024, height: 800 });
    result = await runAll(page, thresholds, ['text-overlap']);
    check('text-overlap: clip rect, clip-path inset(50%), a clipped ancestor and the Haravan preview bar never count as overlapping text', result.findings.length === 0, JSON.stringify(result.findings));
    const flaggedWithout = async (selector, removeClass) => {
      await page.evaluate((sel, cls) => document.querySelector(sel).classList.remove(cls), selector, removeClass);
      const res = await runAll(page, thresholds, ['text-overlap']);
      await page.evaluate((sel, cls) => document.querySelector(sel).classList.add(cls), selector, removeClass);
      return res.findings.length > 0 && res.findings.every((f) => f.slug === 'text-overlap');
    };
    check('text-overlap: the same span without the clip rect is flagged', await flaggedWithout('#vh', 'visually-hidden'));
    check('text-overlap: the same span without clip-path is flagged', await flaggedWithout('#vh-path', 'clip-path-hidden'));
    check('text-overlap: the same label without the clipped wrapper is flagged', await flaggedWithout('#wrap', 'hidden-wrapper'));
    check('text-overlap: the same bar without the preview-bar class is flagged', await flaggedWithout('#bar', 'haravan-preview-bar'));
    await page.close();

    // capture imageHealth record
    const { measureImageHealth, combineImageHealth } = require('../final_showcase_capture');
    const { checkImageHealth } = require('../pre_showcase_gate');
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
    await page.setContent(`<body>
      <img id="ok" src="${pixel}" width="40" height="40">
      <img id="broken" src="${base}/missing-health.png" width="40" height="40">
      <img id="none" src="${base}/missing-none.png" style="display:none">
      <div style="display:none"><img id="nested-none" src="${base}/missing-nested.png"></div>
      <img id="invisible" src="${base}/missing-invisible.png" width="40" height="40" style="visibility:hidden">
      <img id="svg" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>" width="10" height="10">
      <img id="nosrc" width="10" height="10">
    </body>`);
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
    const health = await measureImageHealth(page);
    check('imageHealth: counts only displayed images with a source (data:image/svg, no src, display:none and visibility:hidden are not measured)', health.total === 2, JSON.stringify(health));
    check('imageHealth: broken lists the src of an image whose naturalWidth is 0', health.broken.length === 1 && health.broken[0] === `${base}/missing-health.png` && Number.isFinite(Date.parse(health.measuredAt)), JSON.stringify(health));
    await page.close();

    const sample = (total, broken, at) => ({ total, broken, measuredAt: at });
    const merged = combineImageHealth({ desktop: sample(10, ['a.jpg'], '2026-10-19T01:00:00.000Z'), mobile: sample(8, ['a.jpg', 'b.jpg'], '2026-10-19T02:00:00.000Z') }, ['desktop', 'mobile']);
    check('imageHealth: desktop and mobile merge into one record (summed total, de-duplicated broken, latest measuredAt)', merged.total === 18 && JSON.stringify(merged.broken) === '["a.jpg","b.jpg"]' && merged.measuredAt === '2026-10-19T02:00:00.000Z' && merged.viewports.desktop.total === 10);
    check('imageHealth: a viewport that was not measured leaves no record, so the gate reports UNMEASURED', combineImageHealth({ desktop: sample(10, [], 'x') }, ['desktop', 'mobile']) === null && combineImageHealth({}, ['desktop']) === null);

    const manifestDir = tmpDir('image-health');
    const writeManifest = (templates) => fs.writeFileSync(path.join(manifestDir, 'CAPTURE_MANIFEST.json'), JSON.stringify({ templates }));
    writeManifest({ home: { files: {}, imageHealth: merged }, cart: { files: {}, imageHealth: combineImageHealth({ desktop: sample(4, [], '2026-10-19T02:00:00.000Z') }, ['desktop']) } });
    const gateArgs = { out: manifestDir, captureManifest: null };
    const found = checkImageHealth(gateArgs);
    check('imageHealth: the record shape the capture writes is found by pre-showcase image-health and fails on its broken src', found.status === 'FAIL' && /b\.jpg/.test(found.detail), JSON.stringify(found));
    writeManifest({ home: { files: {}, imageHealth: combineImageHealth({ desktop: sample(6, [], '2026-10-19T02:00:00.000Z'), mobile: sample(6, [], '2026-10-19T02:00:00.000Z') }, ['desktop', 'mobile']) } });
    const clean = checkImageHealth(gateArgs);
    check('imageHealth: a clean capture record passes image-health with the measured image count', clean.status === 'PASS' && /12 images/.test(clean.detail), JSON.stringify(clean));

    // overlays
    for (const side of ['bad', 'good']) {
      page = await openFixture(browser, base, `overlay-fit-${side}`, { width: 375, height: 600 });
      const state = await probes.runOverlayState(page, thresholds, 'open-panel');
      const slugs = [...new Set(state.findings.map((f) => f.slug))];
      if (side === 'bad') check('overlay-viewport-cap bad: panel taller than the viewport yields exactly its slug', state.opened && slugs.length === 1 && slugs[0] === 'overlay-viewport-cap');
      else check('overlay-viewport-cap good: bounded panel yields 0 findings', state.opened && state.findings.length === 0);
      await page.close();
    }
    page = await openFixture(browser, base, 'overlay-fit-good', { width: 375, height: 600 });
    const absent = await probes.runOverlayState(page, thresholds, 'open-nothing');
    check('overlay: a trigger that is not on the page is reported absent, not as a defect', absent.present === false && absent.findings.length === 0);
    await page.close();

    page = await openFixture(browser, base, 'overlay-close-failed-bad', { width: 375, height: 600 });
    let state = await probes.runOverlayState(page, thresholds, 'open-panel');
    check('overlay-close-failed bad: backdrop-only closing yields exactly its slug and is graded as the backdrop method', state.close.method === 'backdrop' && state.findings.length === 1 && state.findings[0].slug === 'overlay-close-failed');
    await page.close();
    page = await openFixture(browser, base, 'overlay-close-failed-good', { width: 375, height: 600 });
    state = await probes.runOverlayState(page, thresholds, 'open-panel');
    check('overlay-close-failed good: in-panel close control is chosen over the full-viewport backdrop button that precedes it', state.close.method === 'close-button' && state.close.attempts.backdrop === null && state.findings.length === 0);
    await page.close();
    page = await openFixture(browser, base, 'overlay-close-escape-good', { width: 375, height: 600 });
    state = await probes.runOverlayState(page, thresholds, 'open-panel');
    check('overlay close by Escape dispatched to the page closes the panel and needs no page focus', state.close.method === 'escape' && state.findings.length === 0 && state.stillOpen === false);
    await page.close();

    page = await openFixture(browser, base, 'overlay-fit-scrolled-content', { width: 375, height: 600 });
    state = await probes.runOverlayState(page, thresholds, 'open-panel');
    check('overlay-viewport-cap: page content that scrolls or slides into view during the click is not the overlay panel', state.opened && state.findings.length === 0, JSON.stringify(state.findings));
    await page.close();
    page = await openFixture(browser, base, 'overlay-fit-drawer-bad', { width: 375, height: 600 });
    state = await probes.runOverlayState(page, thresholds, 'open-panel');
    check('overlay-viewport-cap: a visible fixed drawer that slides in from off-screen is still measured', state.opened && state.findings.some((f) => f.slug === 'overlay-viewport-cap'), JSON.stringify(state));
    await page.close();
    page = await openFixture(browser, base, 'overlay-preview-chrome', { width: 375, height: 600 });
    state = await probes.runOverlayState(page, thresholds, 'open-panel');
    check('overlay: the Haravan preview bar covering a trigger is hidden, so the click opens the overlay instead of leaving preview', state.opened && state.findings.length === 0 && /overlay-preview-chrome/.test(page.url()), JSON.stringify({ url: page.url(), state }));
    await page.close();
    page = await openFixture(browser, base, 'overlay-trigger-navigates', { width: 375, height: 600 });
    let navError = null;
    try { await probes.runOverlayState(page, thresholds, 'open-panel'); } catch (error) { navError = error.message; }
    check('overlay: a trigger that navigates away fails with the hook and destination, not a missing-probe crash', /overlay trigger open-panel navigated the page to .*overlay-fit-good\.html/.test(String(navError)), String(navError));
    await page.close();
    page = await openFixture(browser, base, 'overlay-trigger-under-dock', { width: 375, height: 600 });
    state = await probes.runOverlayState(page, thresholds, 'open-panel');
    check('overlay: a trigger below the fold is clicked clear of a fixed bottom dock, so the click opens the overlay instead of following a dock link', state.opened && /overlay-trigger-under-dock/.test(page.url()), JSON.stringify({ url: page.url(), state }));
    await page.close();

    await gateEndToEnd(base, port);
  } finally {
    await browser.close();
    server.kill();
  }
}

function stubServer(handler) {
  return new Promise((resolve) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      handler(req, res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

function gateContract(paths, features = []) {
  return {
    qaGate: { widths: [375, 1024], coverageFloor: 1 },
    designDefaults: { mobileRootFontPx: 14 },
    screens: paths.map((p, i) => ({ name: `screen-${i}`, path: p, landmarks: [{ name: 'main', status: 'matched' }] })),
    features
  };
}

async function runGateInProcess(contract, base, extra = {}) {
  const dir = tmpDir('e2e');
  const root = path.join(dir, 'theme');
  copyDir(path.join(RECEIPT_FIXTURES, 'theme'), root);
  const contractFile = path.join(dir, 'contract.json');
  fs.writeFileSync(contractFile, JSON.stringify(contract));
  const out = path.join(dir, 'out');
  const args = ['--root', root, '--probe-only', '--contract', contractFile, '--base', base, '--themeid', '1001', '--out', out, ...(extra.args || [])];
  const result = await gate.main(args, extra.deps || {});
  return { ...result, report: result.report || null, out };
}

async function gateEndToEnd(base, port) {
  const good = await runGateInProcess(gateContract(['/page-good.html']), base);
  check('gate e2e: clean page at 375 and 1024 exits 0 with measured equal to expected', good.exitCode === 0 && good.report.coverage.expected === 2 && good.report.coverage.measured === 2 && good.report.failures.length === 0);
  check('gate e2e: every probe cell records durationMs and a measured status', good.report.coverage.cells.every((c) => c.source === 'probe' && c.status === 'measured' && c.durationMs > 0));

  const warnOnly = await runGateInProcess(gateContract(['/min-font-size-bad.html']), base);
  check('gate e2e: a warn-tier probe hit is reported as a warning and does not fail (exit 0)', warnOnly.exitCode === 0 && warnOnly.report.warnings.some((w) => w.code === 'min-font-size'));
  const blocker = await runGateInProcess(gateContract(['/min-font-size-bad.html']), base, { deps: { registry: blockerRegistry() } });
  check('gate e2e: a blocker-tier probe hit fails with its slug (exit 1)', blocker.exitCode === 1 && blocker.report.failures.some((f) => f.code === 'min-font-size' && f.rule === 'min-font-size'));
  const waiverFile = path.join(path.dirname(blocker.out), 'waivers.json');
  fs.writeFileSync(waiverFile, JSON.stringify([{ rule: 'min-font-size', reason: 'fixture waiver for tiny caption' }]));
  const waivedRun = await runGateInProcess(gateContract(['/min-font-size-bad.html']), base, { deps: { registry: blockerRegistry() }, args: ['--waivers', waiverFile] });
  check('gate e2e: a waiver moves the blocker finding to waived (exit 0)', waivedRun.exitCode === 0 && waivedRun.report.waived.length >= 1);

  const overlayFeature = [{ name: 'panel', sourceHooks: ['data-action=open-panel', '<panel>'], targetHooks: ['x::y'] }, { name: 'ignored', sourceHooks: ['data-action=add-wishlist', 'data-action=close-panel'] }];
  check('gate e2e: only data-action=open-* hooks become overlay states', JSON.stringify(gate.openHooks({ features: overlayFeature })) === '["open-panel"]');
  const overlayBad = await runGateInProcess({ ...gateContract(['/overlay-fit-bad.html'], overlayFeature), qaGate: { widths: [375], coverageFloor: 1 } }, base, { deps: { registry: blockerRegistry() } });
  check('gate e2e: overlay state run fails a panel taller than the viewport (overlay-viewport-cap)', overlayBad.exitCode === 1 && overlayBad.report.failures.some((f) => f.code === 'overlay-viewport-cap' && /overlay:open-panel/.test(f.detail)));
  const overlayGood = await runGateInProcess({ ...gateContract(['/overlay-fit-good.html'], overlayFeature), qaGate: { widths: [375], coverageFloor: 1 } }, base, { deps: { registry: blockerRegistry() } });
  const overlayCell = overlayGood.report && overlayGood.report.coverage.cells[0];
  check('gate e2e: bounded overlay passes and the cell records how it closed', overlayGood.exitCode === 0 && overlayCell.overlays.length === 1 && overlayCell.overlays[0].opened === true && overlayCell.overlays[0].closeMethod === 'close-button');

  const notFound = await runGateInProcess(gateContract(['/does-not-exist.html']), base);
  check('gate e2e: HTTP 404 is PREVIEW_UNREACHABLE (exit 2)', notFound.exitCode === 2 && notFound.report.failures.some((f) => f.code === 'PREVIEW_UNREACHABLE' && /HTTP 404/.test(f.detail)));

  const themeNotFound = '<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body class="template-404"><main><p style="font-size:16px">Không tìm thấy trang</p></main></body></html>';
  const plainNotFound = '<!doctype html><html><head><meta charset="utf-8"><title>Not found</title></head><body><p style="font-size:16px">Not found</p></body></html>';
  const notFoundStub = await stubServer((req, res) => {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(req.url.startsWith('/plain') ? plainNotFound : themeNotFound);
  });
  const named404 = (screenPath, extra = {}) => ({ ...gateContract([screenPath]), qaGate: { widths: [375], coverageFloor: 1 }, screens: [{ name: '404', path: screenPath, landmarks: [{ name: 'main', status: 'matched' }], ...extra }] });
  const expected404 = await runGateInProcess(named404('/pages/khong-ton-tai'), notFoundStub.base);
  check('gate e2e: a screen named 404 answering HTTP 404 with the theme 404 template is measured, not PREVIEW_UNREACHABLE', expected404.exitCode === 0 && expected404.report.coverage.measured === 1 && expected404.report.failures.length === 0, JSON.stringify(expected404.report.failures));
  const declared404 = await runGateInProcess({ ...named404('/pages/khong-ton-tai', { expectStatus: 404 }), screens: [{ name: 'missing-page', path: '/pages/khong-ton-tai', expectStatus: 404, landmarks: [{ name: 'main', status: 'matched' }] }] }, notFoundStub.base);
  check('gate e2e: expectStatus 404 on any screen name is accepted the same way', declared404.exitCode === 0 && declared404.report.coverage.measured === 1);
  const plain404 = await runGateInProcess(named404('/plain'), notFoundStub.base);
  check('gate e2e: an expected 404 that is not the theme template stays PREVIEW_UNREACHABLE (exit 2)', plain404.exitCode === 2 && plain404.report.failures.some((f) => f.code === 'PREVIEW_UNREACHABLE' && /not the theme 404 template/.test(f.detail)));
  const unexpected404 = await runGateInProcess(gateContract(['/pages/khong-ton-tai']), notFoundStub.base);
  check('gate e2e: a 404 on a screen that does not expect one is still PREVIEW_UNREACHABLE (exit 2)', unexpected404.exitCode === 2 && unexpected404.report.failures.some((f) => /HTTP 404/.test(f.detail)));
  const okStub = await stubServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(themeNotFound);
  });
  const wrongStatus = await runGateInProcess(named404('/pages/khong-ton-tai'), okStub.base);
  check('gate e2e: a screen expecting 404 that answers 200 is PREVIEW_UNREACHABLE (exit 2)', wrongStatus.exitCode === 2 && wrongStatus.report.failures.some((f) => /HTTP 200.*expected 404/.test(f.detail)));
  notFoundStub.server.close();
  okStub.server.close();

  const closedPort = await freePort();
  const down = await runGateInProcess(gateContract(['/page-good.html']), `http://127.0.0.1:${closedPort}`);
  check('gate e2e: connection refused is PREVIEW_UNREACHABLE (exit 2) with every cell unmeasured', down.exitCode === 2 && down.report.failures.some((f) => f.code === 'PREVIEW_UNREACHABLE') && down.report.coverage.measured === 0 && down.report.coverage.cells.every((c) => c.status !== 'measured'));

  const locked = await stubServer((req, res) => {
    if (req.url.startsWith('/password')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>password</title><p>locked</p>');
    } else {
      res.writeHead(302, { location: '/password' });
      res.end();
    }
  });
  const password = await runGateInProcess(gateContract(['/anything']), locked.base);
  check('gate e2e: redirect to /password is PREVIEW_UNREACHABLE (exit 2)', password.exitCode === 2 && password.report.failures.some((f) => /password/.test(f.detail)));
  locked.server.close();

  const recorder = await stubServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><head><meta charset="utf-8"><title>ok</title></head><body><main><p style="font-size:16px">ok</p></main></body></html>');
  });
  const themed = await runGateInProcess({ ...gateContract(['/search?q=ao']), qaGate: { widths: [375], coverageFloor: 1 } }, recorder.base);
  check('gate e2e: ?themeid is appended to the contract path (existing query kept)', themed.exitCode === 0 && recorder.requests.some((u) => u.includes('q=ao') && u.includes('themeid=1001')));
  recorder.server.close();
}

main().then(() => {
  removeTree(TMP);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch((error) => {
  console.log(`FAIL qa_gate_tests crashed: ${error.stack || error.message}`);
  removeTree(TMP);
  process.exit(1);
});
