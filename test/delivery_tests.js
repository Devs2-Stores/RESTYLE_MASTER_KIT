'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { spawnSync, spawn } = require('child_process');
const { createZip, listZipEntries } = require('../lib/zip');
const { THEME_DIRS, ALLOWED_EXTENSIONS, buildPackage, findAllowListViolations, assertZipAllowList } = require('../theme_package');
const remake = require('../lib/remake-contract');
const settingsMerge = require('../settings_merge');
const preflight = require('../run_preflight');
const featureCapture = require('../final_feature_capture');
const promote = require('../contract_promote');

const KIT_ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`PASS ${label}`);
    passed += 1;
  } else {
    console.error(`FAIL ${label}${detail ? ` (${detail})` : ''}`);
    failed += 1;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

function writePng(file, width, height, rgba = [240, 235, 225, 255]) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    for (let x = 0; x < width; x += 1) {
      const idx = rowStart + 1 + x * 4;
      raw[idx] = rgba[0]; raw[idx + 1] = rgba[1]; raw[idx + 2] = rgba[2]; raw[idx + 3] = rgba[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]));
}

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-tests-'));
const STUB_BIN = path.join(TMP_ROOT, 'stub-bin');
const SPAWN_MARKER = path.join(TMP_ROOT, 'spawn-marker.txt');
const CONTROL_MARKER = path.join(TMP_ROOT, 'control-marker.txt');
const STUB_NAMES = ['haravan', 'hrv', 'shopify', 'sapo'];

function installStubs() {
  ensureDir(STUB_BIN);
  for (const name of STUB_NAMES) {
    fs.writeFileSync(path.join(STUB_BIN, `${name}.cmd`), `@echo off\r\necho ${name} %* >> "%DELIVERY_SPAWN_MARKER%"\r\nexit /b 0\r\n`);
    const posix = path.join(STUB_BIN, name);
    fs.writeFileSync(posix, `#!/bin/sh\necho "${name} $@" >> "$DELIVERY_SPAWN_MARKER"\nexit 0\n`);
    try { fs.chmodSync(posix, 0o755); } catch (_) {}
  }
}

function stubEnv(marker) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() !== 'PATH') env[key] = value;
  }
  const original = process.env.PATH || process.env.Path || '';
  env.PATH = `${STUB_BIN}${path.delimiter}${original}`;
  env.DELIVERY_SPAWN_MARKER = marker;
  delete env.HARAVAN_CLI_CMD;
  return env;
}

function runNode(script, args = [], options = {}) {
  const result = spawnSync(process.execPath, [path.join(KIT_ROOT, script), ...args], {
    cwd: options.cwd || KIT_ROOT,
    encoding: 'utf8',
    env: stubEnv(options.marker || SPAWN_MARKER),
    timeout: options.timeout || 120000
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function markerLines(marker) {
  return fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').split(/\r?\n/).filter(Boolean) : [];
}

function silently(fn) {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  const restore = () => { console.log = log; console.warn = warn; };
  let result;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === 'function') return result.then((value) => { restore(); return value; }, (error) => { restore(); throw error; });
  restore();
  return result;
}

function makeThemeFixture(root) {
  writeText(path.join(root, 'assets', 'a.js'), 'window.fixture = true;\n');
  writeText(path.join(root, 'assets', 'theme.css'), ':root{--brand-color-price:#C8102E;--brand-gutter:24px;font-size:14px} .brand-button{} .hidden{display:none!important}\n');
  writeText(path.join(root, 'config', 'settings_schema.json'), `${JSON.stringify([{ name: 'Hero', settings: [{ type: 'text', id: 'hero_title', label: 'Title', default: 'Hello' }] }])}\n`);
  writeText(path.join(root, 'layout', 'theme.liquid'), '<html><body>{{ content_for_layout }}</body></html>\n');
  writeText(path.join(root, 'snippets', 'card.liquid'), '<div class="card"></div>\n');
  writeText(path.join(root, 'templates', 'index.liquid'), '{{ settings.hero_title }}\n');
  writeText(path.join(root, 'scratch', 'x.psd'), 'stray');
  writeText(path.join(root, '.antifan', 'r.json'), '{}');
  writeText(path.join(root, 'deliverables', 'y.md'), '# notes');
}

function zipNames(file) {
  return listZipEntries(file).filter((name) => !name.endsWith('/'));
}

const DESCRIPTION = '<h1>Ivory Gem Theme</h1><p>Mô tả storefront bán hàng theo đúng định hướng thương hiệu, nhấn vào lợi ích, niềm tin và bố cục đã được restyle từ Stitch.</p><ul><li>Layout trung thành với design</li><li>Theme-native cho Haravan</li><li>Ready for editor fragment paste</li></ul><p>Phần mô tả này đủ dài để vượt ngưỡng tối thiểu và chứng minh đây là fragment đã được điền thật, không phải placeholder.</p>';

function makeGuardFixture(root) {
  makeThemeFixture(root);
  const showcase = path.join(root, 'final-showcase');
  writeText(path.join(showcase, 'THEME_DESCRIPTION.html'), DESCRIPTION);
  writePng(path.join(showcase, 'Trang chủ.png'), 876, 2000);
  writePng(path.join(showcase, 'Trang chủ-mobile.png'), 276, 480);
  writePng(path.join(showcase, 'Trang chủ-fullpage.png'), 1200, 2400);
  writePng(path.join(showcase, 'Trang chủ-mobile-fullpage.png'), 375, 1400);
  writePng(path.join(root, 'deliverables', 'evidence', 'home-desktop.png'), 40, 40);
  writePng(path.join(root, 'deliverables', 'evidence', 'home-mobile.png'), 20, 40);
  writeText(path.join(root, 'deliverables', 'evidence', 'home.json'), JSON.stringify({
    desktop: 'deliverables/evidence/home-desktop.png',
    mobile: 'deliverables/evidence/home-mobile.png',
    landmarks: { hero: 'matched' }
  }));
  writeText(path.join(root, 'deliverables', 'evidence', 'smart-search-flow.json'), '{"flow":"smart-search","ok":true}');
  writeText(path.join(root, 'deliverables', 'FULL_REMAKE_CONTRACT.json'), JSON.stringify({
    version: 1,
    policy: { merchantData: 'settings-only' },
    preview: { status: 'pending', baseUrl: 'https://preview.example.com' },
    designDefaults: {
      canvasColor: '#FFFFFF',
      mobileRootFontPx: 14,
      priceColor: '#C8102E',
      sectionSpace: 'clamp(2.5rem, 6vw, 4.5rem)',
      gutterToken: '--brand-gutter',
      homeSectionOrder: ['hero'],
      typeScale: { minTextPx: 12 }
    },
    qaGate: { widths: [320, 375, 768, 1024, 1440], coverageFloor: 1 },
    screens: [{
      name: 'home',
      path: '/',
      status: 'implemented-static',
      landmarks: [{ name: 'hero', source: 'design:hero', target: 'templates/index.liquid', status: 'pending' }],
      evidence: { desktop: '', mobile: '' }
    }],
    features: [{
      name: 'smart-search',
      status: 'pending',
      sourceHooks: ['view=smart'],
      targetHooks: [{ file: 'templates/index.liquid', contains: 'settings.hero_title' }],
      evidence: []
    }],
    sharedPrimitives: [],
    cssOwnership: [],
    allowlists: { merchantDefaults: [], themeImportant: [{ file: 'assets/theme.css', contains: '.hidden' }], vendorCss: [] },
    residueMarkers: []
  }, null, 2));
  writeText(path.join(root, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'), [
    '# Restyle Progress Ledger',
    '',
    '| Gate | Status | Evidence |',
    '|---|---|---|',
    '| Final readiness | pending |  |',
    '| QA pass | passed | qa.json |',
    ''
  ].join('\n'));
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function runAsync(script, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(KIT_ROOT, script), ...args], { cwd: KIT_ROOT, env: stubEnv(options.marker || SPAWN_MARKER) });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), options.timeout || 120000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}

async function main() {
  console.log('# Delivery Kit Test Suite\n');
  installStubs();

  const stubProbe = spawnSync('haravan', ['stub-probe'], { env: stubEnv(CONTROL_MARKER), shell: process.platform === 'win32', encoding: 'utf8' });
  check('stub: PATH stub intercepts haravan (marker proves the harness can see a spawn)', stubProbe.status === 0 && markerLines(CONTROL_MARKER).some((line) => line.includes('stub-probe')));

  // ---- export: local allow-listed default -------------------------------------------------
  console.log('\n## 1. Local allow-listed export');
  const exportRoot = path.join(TMP_ROOT, 'export-theme');
  makeThemeFixture(exportRoot);
  const exportOut = path.join(TMP_ROOT, 'export-out');
  const defaultRun = runNode('final_theme_export.js', ['--root', exportRoot, '--out', exportOut, '--file', 'default.zip']);
  check('export: default mode exits 0', defaultRun.status === 0, defaultRun.stderr);
  check('export: default mode is local', /Mode:\s+local/.test(defaultRun.stdout));
  const defaultZip = path.join(exportOut, 'default.zip');
  const defaultNames = fs.existsSync(defaultZip) ? zipNames(defaultZip) : [];
  check('export: zip has 0 members outside the allow-list', defaultNames.length > 0 && findAllowListViolations(defaultNames).length === 0);
  check('export: zip contains both required files', defaultNames.includes('layout/theme.liquid') && defaultNames.includes('config/settings_schema.json'));
  check('export: zip contains the theme asset', defaultNames.includes('assets/a.js'));
  check('export: stray scratch/.antifan/deliverables files are not packaged', !defaultNames.some((name) => /^(scratch|\.antifan|deliverables)\//.test(name)));
  check('export: every member sits under a theme directory with an allowed extension',
    defaultNames.every((name) => THEME_DIRS.includes(name.split('/')[0]) && ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())));

  const localRun = runNode('final_theme_export.js', ['--root', exportRoot, '--out', exportOut, '--file', 'explicit-local.zip', '--local']);
  check('export: explicit --local exits 0 with the same member list',
    localRun.status === 0 && JSON.stringify(zipNames(path.join(exportOut, 'explicit-local.zip')).sort()) === JSON.stringify(defaultNames.slice().sort()));

  const bothRun = runNode('final_theme_export.js', ['--root', exportRoot, '--out', exportOut, '--local', '--cli']);
  check('export: --local with --cli is refused', bothRun.status !== 0 && /mutually exclusive/.test(bothRun.stderr));

  const pkgOut = path.join(TMP_ROOT, 'pkg-out');
  const pkgRun = runNode('theme_package.js', ['--root', exportRoot, '--out', pkgOut]);
  check('theme_package: exits 0 and the zip passes the allow-list', pkgRun.status === 0 && findAllowListViolations(zipNames(path.join(pkgOut, 'theme-preview.zip'))).length === 0);
  const built = buildPackage(exportRoot, path.join(TMP_ROOT, 'pkg-api'));
  check('theme_package: buildPackage returns the zip path and member count', fs.existsSync(built.outputPath) && built.count === 6, `count=${built.count}`);

  // ---- export: post-build allow-list assertion --------------------------------------------
  console.log('\n## 2. Zip allow-list assertion');
  const badZip = path.join(TMP_ROOT, 'bad.zip');
  createZip([
    { name: 'layout/theme.liquid', data: '<html></html>' },
    { name: 'config/settings_schema.json', data: '[]' },
    { name: 'scratch/x.psd', data: 'stray' }
  ], badZip);
  let assertError = null;
  try { assertZipAllowList(badZip); } catch (error) { assertError = error; }
  check('allow-list: assertZipAllowList throws on a stray member', assertError !== null && /scratch\/x\.psd/.test(assertError.message));
  const nestedAssetZip = path.join(TMP_ROOT, 'nested-asset.zip');
  createZip([{ name: 'layout/theme.liquid', data: 'x' }, { name: 'assets/sub/a.js', data: 'x' }], nestedAssetZip);
  check('allow-list: nested assets member is a violation', findAllowListViolations(zipNames(nestedAssetZip)).length === 1);
  const badExtZip = path.join(TMP_ROOT, 'bad-ext.zip');
  createZip([{ name: 'layout/theme.liquid', data: 'x' }, { name: 'assets/a.psd', data: 'x' }], badExtZip);
  check('allow-list: disallowed extension inside assets is a violation', findAllowListViolations(zipNames(badExtZip)).length === 1);

  const fromBadOut = path.join(TMP_ROOT, 'from-bad-out');
  const fromBad = runNode('final_theme_export.js', ['--root', exportRoot, '--out', fromBadOut, '--file', 'from-bad.zip', '--from-zip', badZip]);
  check('allow-list: --from-zip with a stray member exits 1', fromBad.status === 1 && /allow-list/.test(fromBad.stderr), fromBad.stderr);
  check('allow-list: the rejected zip is not left in the handoff folder', !fs.existsSync(path.join(fromBadOut, 'from-bad.zip')));
  const goodZip = path.join(TMP_ROOT, 'good.zip');
  createZip([{ name: 'layout/theme.liquid', data: '<html></html>' }, { name: 'config/settings_schema.json', data: '[]' }, { name: 'templates/index.liquid', data: 'x' }], goodZip);
  const fromGood = runNode('final_theme_export.js', ['--root', exportRoot, '--out', path.join(TMP_ROOT, 'from-good-out'), '--file', 'from-good.zip', '--from-zip', goodZip]);
  check('allow-list: --from-zip with a clean zip exits 0', fromGood.status === 0, fromGood.stderr);

  const guardZipRoot = path.join(TMP_ROOT, 'guard-zip');
  makeGuardFixture(guardZipRoot);
  fs.copyFileSync(badZip, path.join(guardZipRoot, 'final-showcase', 'Haravan-Fixture-v20260101-0000.zip'));
  const guardZip = runNode('workflow_final_guard.js', ['--root', guardZipRoot, '--require-zip']);
  check('guard: --require-zip rejects a zip with a member outside the allow-list', guardZip.status === 1 && /outside the delivery allow-list/.test(guardZip.stderr), guardZip.stderr);

  // ---- export: null inputs -----------------------------------------------------------------
  console.log('\n## 3. Null inputs');
  const missingRoot = runNode('final_theme_export.js', ['--root', path.join(TMP_ROOT, 'does-not-exist'), '--out', path.join(TMP_ROOT, 'null-out')]);
  check('null: export with a missing root exits non-zero', missingRoot.status !== 0 && /invalid/.test(missingRoot.stderr));
  const emptyRoot = path.join(TMP_ROOT, 'empty-root');
  ensureDir(emptyRoot);
  const emptyRun = runNode('final_theme_export.js', ['--root', emptyRoot, '--out', path.join(TMP_ROOT, 'null-out')]);
  check('null: export with an empty root exits non-zero', emptyRun.status !== 0);
  const emptyLayoutRoot = path.join(TMP_ROOT, 'empty-layout-root');
  ensureDir(path.join(emptyLayoutRoot, 'layout'));
  const emptyLayoutRun = runNode('final_theme_export.js', ['--root', emptyLayoutRoot, '--out', path.join(TMP_ROOT, 'null-out')]);
  check('null: export with an empty layout directory exits non-zero and writes no zip', emptyLayoutRun.status !== 0 && !fs.existsSync(path.join(TMP_ROOT, 'null-out')) || (emptyLayoutRun.status !== 0 && !fs.existsSync(path.join(TMP_ROOT, 'null-out', 'final-theme.zip'))));
  const noValueRun = runNode('final_theme_export.js', ['--root']);
  check('null: export with --root and no value exits non-zero', noValueRun.status !== 0);
  const noFromZip = runNode('final_theme_export.js', ['--root', exportRoot, '--out', path.join(TMP_ROOT, 'null-out2'), '--from-zip', path.join(TMP_ROOT, 'nope.zip')]);
  check('null: --from-zip pointing at a missing file exits non-zero', noFromZip.status !== 0);
  const pkgEmpty = runNode('theme_package.js', ['--root', emptyRoot, '--out', path.join(TMP_ROOT, 'null-pkg')]);
  check('null: theme_package with an empty root exits non-zero', pkgEmpty.status !== 0);
  const pkgNoRoot = runNode('theme_package.js', ['--out', path.join(TMP_ROOT, 'null-pkg')]);
  check('null: theme_package without --root exits non-zero', pkgNoRoot.status !== 0);
  const strayAssetRoot = path.join(TMP_ROOT, 'stray-asset');
  makeThemeFixture(strayAssetRoot);
  writeText(path.join(strayAssetRoot, 'assets', 'photoshop.psd'), 'stray');
  const strayRun = runNode('final_theme_export.js', ['--root', strayAssetRoot, '--out', path.join(TMP_ROOT, 'stray-out')]);
  check('null: a disallowed file inside a theme directory fails the export', strayRun.status !== 0 && /unsupported theme package file/.test(strayRun.stderr));

  // ---- remote export only behind --cli ------------------------------------------------------
  console.log('\n## 4. Remote export is explicit');
  const defaultSpawns = markerLines(SPAWN_MARKER);
  check('spawn: default and --local exports, --from-zip and theme_package spawned 0 haravan/hrv/shopify/sapo processes', defaultSpawns.length === 0, defaultSpawns.join(' | '));
  const cliRun = runNode('final_theme_export.js', ['--root', exportRoot, '--out', path.join(TMP_ROOT, 'cli-out'), '--file', 'cli.zip', '--cli'], { marker: CONTROL_MARKER });
  check('spawn: --cli is the only path that spawns the haravan binary', markerLines(CONTROL_MARKER).some((line) => /^haravan theme export/.test(line)), `${markerLines(CONTROL_MARKER).join(' | ')} :: status ${cliRun.status}`);

  // ---- contract promote + ledger resolve ----------------------------------------------------
  console.log('\n## 5. Contract promote and ledger resolve');
  const promoteRoot = path.join(TMP_ROOT, 'promote-theme');
  makeGuardFixture(promoteRoot);
  const guardBefore = runNode('workflow_final_guard.js', ['--root', promoteRoot]);
  check('promote: guard:final exits 1 on the seeded pending contract and ledger', guardBefore.status === 1);
  check('promote: guard names the pending ledger gate and the resolve command', /final gate not clear/.test(guardBefore.stderr) && /contract_promote\.js/.test(guardBefore.stderr), guardBefore.stderr);
  check('promote: guard lists the unresolved screen and preview', /SCREEN_NOT_APPROVED_FINAL/.test(guardBefore.stderr) && /PREVIEW_NOT_PASSED/.test(guardBefore.stderr));

  const evidence = 'deliverables/evidence/home.json';
  const ledgerFile = path.join(promoteRoot, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md');
  const contractFile = path.join(promoteRoot, 'deliverables', 'FULL_REMAKE_CONTRACT.json');
  const contractSeed = fs.readFileSync(contractFile, 'utf8');
  const ledgerSeed = fs.readFileSync(ledgerFile, 'utf8');

  const noEvidence = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--status', 'approved-final']);
  check('promote: a screen without --evidence is refused', noEvidence.status === 1 && /--evidence/.test(noEvidence.stderr));
  const noStatus = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--evidence', evidence]);
  check('promote: --screen without --status is a usage error (exit 2)', noStatus.status === 2);
  const badStatus = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--status', 'shipped', '--evidence', evidence]);
  check('promote: a status outside the verified sets is refused', badStatus.status === 1 && /not promotable/.test(badStatus.stderr));
  const unknownScreen = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'ghost', '--status', 'approved-final', '--evidence', evidence]);
  check('promote: an unknown screen is refused', unknownScreen.status === 1 && /screen not found/.test(unknownScreen.stderr));
  writeText(path.join(promoteRoot, 'deliverables', 'evidence', 'empty.json'), '');
  const emptyEvidence = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--status', 'approved-final', '--evidence', 'deliverables/evidence/empty.json']);
  check('promote: a 0-byte evidence file is refused', emptyEvidence.status === 1 && /0 bytes/.test(emptyEvidence.stderr));
  writeText(path.join(promoteRoot, 'deliverables', 'evidence', 'missing-image.json'), JSON.stringify({ desktop: 'nope.png', mobile: 'nope.png', landmarks: { hero: 'matched' } }));
  const missingImage = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--status', 'approved-final', '--evidence', 'deliverables/evidence/missing-image.json']);
  check('promote: screen evidence naming a missing screenshot is refused', missingImage.status === 1 && /file not found/.test(missingImage.stderr));
  writeText(path.join(promoteRoot, 'deliverables', 'evidence', 'pending-landmark.json'), JSON.stringify({ desktop: 'deliverables/evidence/home-desktop.png', mobile: 'deliverables/evidence/home-mobile.png', landmarks: { hero: 'pending' } }));
  const pendingLandmark = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--status', 'approved-final', '--evidence', 'deliverables/evidence/pending-landmark.json']);
  check('promote: a landmark left pending blocks the promotion', pendingLandmark.status === 1 && /landmark hero/.test(pendingLandmark.stderr));
  const ghostRow = runNode('contract_promote.js', ['--root', promoteRoot, '--ledger-gate', 'No such gate', '--evidence', evidence]);
  check('promote: a ledger row that does not exist is refused', ghostRow.status === 1 && /ledger row not found/.test(ghostRow.stderr));
  const resolvedRow = runNode('contract_promote.js', ['--root', promoteRoot, '--ledger-gate', 'QA pass', '--evidence', evidence]);
  check('promote: a ledger row that is not pending is refused', resolvedRow.status === 1);
  const noop = runNode('contract_promote.js', ['--root', promoteRoot]);
  check('promote: nothing to do is a usage error (exit 2)', noop.status === 2);
  const noRoot = runNode('contract_promote.js', ['--screen', 'home']);
  check('promote: missing --root is a usage error (exit 2)', noRoot.status === 2);
  const badRoot = runNode('contract_promote.js', ['--root', path.join(TMP_ROOT, 'nowhere'), '--preview', 'passed', '--evidence', evidence]);
  check('promote: a missing theme root is refused', badRoot.status === 1);
  check('promote: refusals wrote nothing', fs.readFileSync(contractFile, 'utf8') === contractSeed && fs.readFileSync(ledgerFile, 'utf8') === ledgerSeed);

  const dry = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--status', 'approved-final', '--evidence', evidence, '--ledger-gate', 'Final readiness', '--dry-run']);
  check('promote: --dry-run is accepted and writes nothing', dry.status === 0 && fs.readFileSync(contractFile, 'utf8') === contractSeed && fs.readFileSync(ledgerFile, 'utf8') === ledgerSeed, dry.stderr);

  const screenRun = runNode('contract_promote.js', ['--root', promoteRoot, '--screen', 'home', '--status', 'approved-final', '--evidence', evidence]);
  check('promote: screen promotion with real evidence exits 0', screenRun.status === 0, screenRun.stderr);
  const afterScreen = JSON.parse(fs.readFileSync(contractFile, 'utf8'));
  check('promote: the screen records status, evidence paths and the evidence file',
    afterScreen.screens[0].status === 'approved-final'
      && afterScreen.screens[0].evidence.desktop === 'deliverables/evidence/home-desktop.png'
      && afterScreen.screens[0].promotion.evidence === evidence
      && afterScreen.screens[0].landmarks[0].status === 'matched');
  const featureRun = runNode('contract_promote.js', ['--root', promoteRoot, '--feature', 'smart-search', '--status', 'preserved', '--evidence', 'deliverables/evidence/smart-search-flow.json']);
  check('promote: feature promotion with evidence exits 0', featureRun.status === 0, featureRun.stderr);
  const guardMid = runNode('workflow_final_guard.js', ['--root', promoteRoot]);
  check('promote: guard:final still exits 1 while the preview and the ledger row are pending', guardMid.status === 1 && /PREVIEW_NOT_PASSED/.test(guardMid.stderr) && /final gate not clear/.test(guardMid.stderr));
  const previewRun = runNode('contract_promote.js', ['--root', promoteRoot, '--preview', 'passed', '--evidence', evidence, '--ledger-gate', 'Final readiness']);
  check('promote: preview promotion plus ledger resolve in one run exits 0', previewRun.status === 0, previewRun.stderr);
  check('promote: the ledger row is resolved and records its evidence', /\| Final readiness \| passed \| deliverables\/evidence\/home\.json \|/.test(fs.readFileSync(ledgerFile, 'utf8')));
  const guardAfter = runNode('workflow_final_guard.js', ['--root', promoteRoot]);
  check('promote: guard:final exits 0 after the seeded entries are promoted', guardAfter.status === 0, guardAfter.stderr);

  const legacyRoot = path.join(TMP_ROOT, 'legacy-ledger');
  ensureDir(path.join(legacyRoot, 'deliverables'));
  writeText(path.join(legacyRoot, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'), '# Ledger\n\nCheckpoint - chưa final\n');
  writeText(path.join(legacyRoot, 'deliverables', 'e.json'), '{"ok":true}');
  const legacyRun = runNode('contract_promote.js', ['--root', legacyRoot, '--ledger-gate', 'Checkpoint', '--evidence', 'deliverables/e.json']);
  check('promote: the legacy checkpoint line is resolved by --ledger-gate Checkpoint', legacyRun.status === 0 && !/chưa final/.test(fs.readFileSync(path.join(legacyRoot, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'), 'utf8')), legacyRun.stderr);
  check('promote: Refusal is exported for callers', typeof promote.Refusal === 'function');

  // ---- contract validation -----------------------------------------------------------------
  console.log('\n## 6. Contract validation (screen path, type scale, qaGate)');
  const screenWith = (patch) => ({ screens: [{ name: 'home', status: 'implemented-static', landmarks: [{ name: 'hero', status: 'pending' }], ...patch }] });
  check('contract: screen path "/" is valid', remake.validateScreens(screenWith({ path: '/' }), false, null).length === 0);
  check('contract: screen path "/collections/all" is valid', remake.validateScreens(screenWith({ path: '/collections/all' }), false, null).length === 0);
  check('contract: a screen without path stays valid (optional)', remake.validateScreens(screenWith({}), false, null).length === 0);
  for (const bad of ['home', '//evil.example', '', 5, null, '/a b', '/a#frag']) {
    check(`contract: screen path ${JSON.stringify(bad)} is rejected`, remake.validateScreens(screenWith({ path: bad }), false, null).some((finding) => finding.startsWith('SCREEN_PATH_INVALID')));
  }
  const thresholds = remake.loadThresholds();
  check('contract: thresholds come from the registry file (text 12, no control-height floor)', thresholds.minTextPx === 12 && !('minControlPx' in thresholds));
  check('contract: typeScale at the minimum is valid', remake.validateTypeScale({ typeScale: { minTextPx: 12 } }).length === 0);
  check('contract: typeScale may tighten the minimum', remake.validateTypeScale({ typeScale: { minTextPx: 14 } }).length === 0);
  check('contract: absent typeScale is valid', remake.validateTypeScale({}).length === 0);
  check('contract: text below 12px is rejected', remake.validateTypeScale({ typeScale: { minTextPx: 11 } }).some((finding) => /TYPE_SCALE_BELOW_MINIMUM.*minTextPx=11/.test(finding)));
  for (const bad of [{}, { minTextPx: 'x' }, [], 'big', null, { minTextPx: -1 }]) {
    check(`contract: typeScale ${JSON.stringify(bad)} is invalid`, remake.validateTypeScale({ typeScale: bad }).some((finding) => finding.startsWith('TYPE_SCALE_INVALID')));
  }
  check('contract: the thresholds file is the only source (no fallback when it is missing)',
    remake.validateTypeScale({ typeScale: { minTextPx: 12 } }, { thresholdsPath: path.join(TMP_ROOT, 'no-thresholds.json') }).some((finding) => finding.startsWith('TYPE_SCALE_THRESHOLDS_UNAVAILABLE')));
  check('contract: qaGate defaults are valid', remake.validateQaGate({ qaGate: { widths: [320, 375, 768, 1024, 1440], coverageFloor: 1 } }).length === 0);
  check('contract: qaGate with no widths is invalid', remake.validateQaGate({ qaGate: { widths: [], coverageFloor: 1 } }).length === 1);
  check('contract: qaGate coverageFloor above 1 is invalid', remake.validateQaGate({ qaGate: { widths: [375], coverageFloor: 2 } }).length === 1);
  const ddRoot = path.join(TMP_ROOT, 'dd-theme');
  makeThemeFixture(ddRoot);
  const ddBase = { canvasColor: '#FFFFFF', mobileRootFontPx: 14, priceColor: '#C8102E', sectionSpace: '2rem', gutterToken: '--brand-gutter', homeSectionOrder: [] };
  check('contract: mobileRootFontPx 14 stays valid with the px scale present', remake.validateDesignDefaults(ddRoot, { designDefaults: { ...ddBase, typeScale: { minTextPx: 12 } } }).length === 0);
  check('contract: validateRemakeContract surfaces a bad typeScale', remake.validateRemakeContract(ddRoot, { version: 1, designDefaults: { ...ddBase, typeScale: { minTextPx: 9 } }, screens: [], features: [] }).some((finding) => finding.startsWith('TYPE_SCALE_BELOW_MINIMUM')));

  const template = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'FULL_REMAKE_CONTRACT.template.json'), 'utf8'));
  check('template: mobileRootFontPx stays 14', template.designDefaults.mobileRootFontPx === 14);
  check('template: typeScale carries only the 12px text minimum', template.designDefaults.typeScale && template.designDefaults.typeScale.minTextPx === 12 && Object.keys(template.designDefaults.typeScale).length === 1);
  check('template: typeScale passes validation against the registry thresholds', remake.validateTypeScale(template.designDefaults).length === 0);
  check('template: every screen declares a storefront path', template.screens.every((screen) => typeof screen.path === 'string') && remake.validateScreens(template, false, null).every((finding) => !finding.startsWith('SCREEN_PATH_INVALID')));
  check('template: qaGate is valid', remake.validateQaGate(template).length === 0);
  check('template: keeps the gutter token field', template.designDefaults.gutterToken !== undefined);
  const ledgerTemplate = fs.readFileSync(path.join(KIT_ROOT, 'RESTYLE_PROGRESS_LEDGER.template.md'), 'utf8');
  check('ledger template: documents the contract_promote resolve step', /contract_promote\.js/.test(ledgerTemplate) && /--ledger-gate/.test(ledgerTemplate));

  // ---- settings_merge ---------------------------------------------------------------------
  console.log('\n## 7. settings_merge dedupe, reset-skeleton, prune-orphan-data');
  const mergeRoot = path.join(TMP_ROOT, 'merge-theme');
  const writeMergeFixture = () => {
    writeText(path.join(mergeRoot, 'config', 'settings_schema.json'), JSON.stringify([
      { name: 'Skeleton', settings: [{ type: 'header', content: 'Only a header' }, { type: 'paragraph', content: 'Only a note' }] },
      { name: 'Hero', settings: [{ type: 'header', content: 'Hero banner' }, { type: 'text', id: 'hero_title', label: 'Title', default: 'Hi' }] }
    ], null, 2));
    writeText(path.join(mergeRoot, 'config', 'settings_data.json'), JSON.stringify({ current: { hero_title: 'Hi', ghost_key: 'old' }, presets: { Default: {} } }, null, 2));
    writeText(path.join(mergeRoot, 'layout', 'theme.liquid'), '<html>{{ settings.hero_title }}</html>');
  };
  writeMergeFixture();
  const manifestFile = path.join(TMP_ROOT, 'merge-manifest.json');
  writeText(manifestFile, JSON.stringify({
    patches: [{
      layer: 'slice:S1',
      schema_add: [{
        group: 'Hero',
        settings: [
          { type: 'header', content: 'Hero banner' },
          { type: 'text', id: 'hero_title', label: 'Title', default: 'Hi' },
          { type: 'header', content: 'Call to action' },
          { type: 'paragraph', content: 'Shown under the banner' }
        ]
      }],
      data_set: { hero_title: 'Hi' }
    }]
  }));
  const schemaPath = path.join(mergeRoot, 'config', 'settings_schema.json');
  const dataPath = path.join(mergeRoot, 'config', 'settings_data.json');
  const first = await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, writeSchema: true, skipAudit: true }));
  const afterFirst = fs.readFileSync(schemaPath, 'utf8');
  const heroAfterFirst = JSON.parse(afterFirst).find((group) => group.name === 'Hero').settings;
  check('merge: the first merge adds only the new id-less entries (banner header deduped)', first.diffReport.some((line) => /\+2 added, 0 updated, 2 unchanged/.test(line)), first.diffReport.join(' | '));
  check('merge: group has one "Hero banner" header', heroAfterFirst.filter((s) => s.type === 'header' && s.content === 'Hero banner').length === 1);
  const second = await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, writeSchema: true, skipAudit: true }));
  check('merge: re-merging the same spec changes 0 entries', second.diffReport.some((line) => /\+0 added, 0 updated, 4 unchanged/.test(line)), second.diffReport.join(' | '));
  check('merge: re-merge leaves the schema byte-identical', fs.readFileSync(schemaPath, 'utf8') === afterFirst);
  check('merge: a type-different id-less entry with the same text is not treated as a duplicate',
    settingsMerge.settingSignature({ type: 'header', content: 'x' }) !== settingsMerge.settingSignature({ type: 'paragraph', content: 'x' }));

  writeMergeFixture();
  const resetDry = await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, resetSkeleton: true, skipAudit: true }));
  check('merge: --reset-skeleton alone is a dry run and writes nothing', resetDry.dryRun === true && JSON.parse(fs.readFileSync(schemaPath, 'utf8')).some((group) => group.name === 'Skeleton'));
  await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, resetSkeleton: true, writeSchema: true, skipAudit: true }));
  const resetSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  check('merge: --reset-skeleton removes groups made only of id-less settings', !resetSchema.some((group) => group.name === 'Skeleton'));
  check('merge: --reset-skeleton keeps groups that own a setting id', resetSchema.some((group) => group.name === 'Hero' && group.settings.some((s) => s.id === 'hero_title')));

  writeMergeFixture();
  const dataSeed = fs.readFileSync(dataPath, 'utf8');
  const pruneDry = await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, pruneOrphanData: true, skipAudit: true }));
  check('merge: --prune-orphan-data without write flags reports the orphan and writes nothing', /would be pruned.*1 \[ghost_key\]/.test(pruneDry.diffReport.join('\n')) && fs.readFileSync(dataPath, 'utf8') === dataSeed, pruneDry.diffReport.join(' | '));
  let noPermission = null;
  try { await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, pruneOrphanData: true, writeData: true, skipAudit: true })); } catch (error) { noPermission = error; }
  check('merge: persisting a prune needs --allow-settings-data', noPermission !== null && /--allow-settings-data/.test(noPermission.message));
  let noBackup = null;
  try { await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, pruneOrphanData: true, allowSettingsData: true, skipAudit: true })); } catch (error) { noBackup = error; }
  check('merge: persisting a prune needs --backup-dir', noBackup !== null && /--backup-dir/.test(noBackup.message));
  check('merge: refused prune attempts left settings_data.json untouched', fs.readFileSync(dataPath, 'utf8') === dataSeed);
  const backupDir = path.join(TMP_ROOT, 'merge-backup');
  await silently(() => settingsMerge.runSettingsMerge({ root: mergeRoot, manifest: manifestFile, pruneOrphanData: true, allowSettingsData: true, backupDir, maxKeyLoss: 1, skipAudit: true }));
  const prunedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  check('merge: --prune-orphan-data removes keys the schema does not declare', prunedData.current.ghost_key === undefined && prunedData.current.hero_title === 'Hi');
  check('merge: structural keys (presets) survive the prune', prunedData.presets !== undefined);
  const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [];
  check('merge: the pre-write copy of settings_data.json exists and still holds the orphan',
    backups.length === 1 && fs.readFileSync(path.join(backupDir, backups[0], 'settings_data.json'), 'utf8') === dataSeed);
  const cliArgs = settingsMerge.parseArgs(['node', 'settings_merge.js', '--manifest', 'm.json', '--reset-skeleton', '--prune-orphan-data', '--allow-settings-data']);
  check('merge: CLI parses --reset-skeleton, --prune-orphan-data and --allow-settings-data', cliArgs.resetSkeleton && cliArgs.pruneOrphanData && cliArgs.allowSettingsData && cliArgs.writeData);
  const noManifest = runNode('settings_merge.js', ['--root', mergeRoot]);
  check('merge: a missing manifest exits 2', noManifest.status === 2);

  // ---- final_feature_capture ----------------------------------------------------------------
  console.log('\n## 8. final_feature_capture without donor selectors');
  const captureSource = fs.readFileSync(path.join(KIT_ROOT, 'final_feature_capture.js'), 'utf8');
  for (const donor of ['.az-', 'az-support', 'f1zs-', 'f1genz-genz', 'shop-modal-contact', 'newsletter_popup_closed', 'shop_notify', 'back-to-top']) {
    check(`capture: no donor selector ${donor} in the script`, !captureSource.includes(donor));
  }
  const parsedCapture = featureCapture.parseArgs(['node', 'x', '--base', 'http://h', '--out', 'o', '--only', 'a,b', '--nav-timeout', '5000', '--stage', 'neutral']);
  check('capture: --only, --nav-timeout and --stage are parsed', JSON.stringify(parsedCapture.only) === '["a","b"]' && parsedCapture.navTimeoutMs === 5000 && parsedCapture.stage === 'neutral');
  check('capture: stage defaults to none', featureCapture.parseArgs(['node', 'x']).stage === 'none');
  let badStage = null;
  try { featureCapture.parseArgs(['node', 'x', '--stage', 'wild']); } catch (error) { badStage = error; }
  check('capture: an unknown --stage is rejected', badStage !== null);
  const shots = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  check('capture: selectShots keeps only the listed ids', featureCapture.selectShots(shots, ['b']).map((s) => s.id).join() === 'b');
  check('capture: no --only keeps every shot', featureCapture.selectShots(shots, []).length === 3);
  let unknownId = null;
  try { featureCapture.selectShots(shots, ['zzz']); } catch (error) { unknownId = error; }
  check('capture: an unknown --only id is an error that lists the known ids', unknownId !== null && /zzz/.test(unknownId.message) && /a, b, c/.test(unknownId.message));
  check('capture: kill defaults to an empty list', featureCapture.toSelectorArray(undefined, 'kill').length === 0);
  let badKill = null;
  try { featureCapture.toSelectorArray('.x', 'kill'); } catch (error) { badKill = error; }
  check('capture: kill must be an array of selector strings', badKill !== null);

  const page = '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main><h1 id="target" style="margin:0;padding:24px">Feature</h1><p>Plain page with no donor widgets.</p></main></body></html>';
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
  const port = await listen(server);
  const captureOut = path.join(TMP_ROOT, 'capture-out');
  ensureDir(captureOut);
  writeText(path.join(captureOut, 'FEATURE_SHOTS.json'), JSON.stringify({
    kill: ['.not-present'],
    shots: [
      { id: 'target', path: '/', selector: '#target', file: 'features/target.png', waitMs: 100 },
      { id: 'other', path: '/', selector: '#target', file: 'features/other.png', waitMs: 100 }
    ]
  }));
  const captureRun = await runAsync('final_feature_capture.js', ['--base', `http://127.0.0.1:${port}`, '--out', captureOut, '--only', 'target', '--wait', '100', '--nav-timeout', '30000', '--stage', 'neutral']);
  server.close();
  check('capture: succeeds against a page with no donor widgets', captureRun.status === 0 && fs.existsSync(path.join(captureOut, 'features', 'target.png')), captureRun.stdout.slice(-400) + captureRun.stderr.slice(-400));
  check('capture: --only skipped the other shot', !fs.existsSync(path.join(captureOut, 'features', 'other.png')));

  // ---- run_preflight ----------------------------------------------------------------------
  console.log('\n## 9. run_preflight token, watcher, snapshot, viewport, key list');
  const tokenDir = path.join(TMP_ROOT, 'token');
  ensureDir(tokenDir);
  const secret = 'SECRET-TOKEN-VALUE-123';
  const freshToken = path.join(tokenDir, 'fresh.json');
  writeText(freshToken, JSON.stringify({ access_token: secret }));
  const staleToken = path.join(tokenDir, 'stale.json');
  writeText(staleToken, JSON.stringify({ access_token: secret }));
  const old = new Date(Date.now() - 72 * 3600 * 1000);
  fs.utimesSync(staleToken, old, old);
  const expiredToken = path.join(tokenDir, 'expired.json');
  writeText(expiredToken, JSON.stringify({ access_token: secret, expires_at: '2020-01-01T00:00:00Z' }));
  const validExpiry = path.join(tokenDir, 'valid-expiry.json');
  writeText(validExpiry, JSON.stringify({ access_token: secret, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() }));
  fs.utimesSync(validExpiry, old, old);
  const tokenResults = {
    fresh: preflight.checkTokenFreshness(freshToken),
    stale: preflight.checkTokenFreshness(staleToken),
    expired: preflight.checkTokenFreshness(expiredToken),
    validExpiry: preflight.checkTokenFreshness(validExpiry),
    missing: preflight.checkTokenFreshness(path.join(tokenDir, 'none.json')),
    relaxed: preflight.checkTokenFreshness(staleToken, { maxAgeHours: 100 })
  };
  check('preflight: a freshly written token file is fresh', tokenResults.fresh.status === 'fresh');
  check('preflight: a token file older than the age limit is stale', tokenResults.stale.status === 'stale');
  check('preflight: --max-token-age-hours widens the limit', tokenResults.relaxed.status === 'fresh');
  check('preflight: an expiry in the past is expired', tokenResults.expired.status === 'expired');
  check('preflight: a future expiry beats file age', tokenResults.validExpiry.status === 'fresh');
  check('preflight: a missing token file is reported missing', tokenResults.missing.status === 'missing');
  check('preflight: the token value never appears in a report', !JSON.stringify(tokenResults).includes(secret));

  const snapDir = path.join(TMP_ROOT, 'snap');
  check('preflight: a missing snapshot directory is missing', preflight.checkSnapshot(snapDir).status === 'missing');
  ensureDir(snapDir);
  fs.writeFileSync(path.join(snapDir, 'theme.tgz'), '');
  check('preflight: a 0-byte archive is not a snapshot', preflight.checkSnapshot(snapDir).status === 'missing');
  fs.writeFileSync(path.join(snapDir, 'theme.tgz'), 'archive');
  check('preflight: an archive without a checksum is unverified', preflight.checkSnapshot(snapDir).status === 'unverified');
  fs.writeFileSync(path.join(snapDir, 'theme.sha256'), 'abc  theme.tgz\n');
  check('preflight: an archive with a checksum is present', preflight.checkSnapshot(snapDir).status === 'present');

  check('preflight: 375x812 is an accepted touch viewport', preflight.checkViewport('375x812').status === 'ok');
  check('preflight: a desktop viewport is rejected as not-touch', preflight.checkViewport('1440x900').status === 'not-touch');
  check('preflight: a malformed viewport is invalid', preflight.checkViewport('wide').status === 'invalid' && preflight.checkViewport('').status === 'invalid');
  check('preflight: parseViewport reads WxH', JSON.stringify(preflight.parseViewport('375x812')) === '{"width":375,"height":812}');

  const pfRoot = path.join(TMP_ROOT, 'pf-theme');
  makeThemeFixture(pfRoot);
  const pf = (options) => preflight.runPreflight(pfRoot, { platform: 'linux', devWatchers: [], env: {}, ...options });
  const otherRoot = path.join(TMP_ROOT, 'other-theme');
  const siblingRoot = `${pfRoot}-sibling`;
  const here = (pid) => ({ pid, commandLine: 'node hrv theme dev', cwd: pfRoot });
  const elsewhere = (pid, cwd) => ({ pid, commandLine: 'node hrv theme dev', cwd });
  const duplicate = (options) => pf(options).issues.filter((line) => /Duplicate Haravan theme dev watcher/.test(line));
  const unmeasured = (options) => pf(options).issues.filter((line) => /Single-watcher check UNMEASURED/.test(line));
  check('watcher: 0 watchers for the root passes', duplicate({ devWatchers: [], singleWatcher: true }).length === 0 && unmeasured({ devWatchers: [], singleWatcher: true }).length === 0);
  check('watcher: 1 watcher for the root passes', duplicate({ devWatchers: [here(11)], singleWatcher: true }).length === 0);
  const twoSame = pf({ devWatchers: [here(11), here(12)], singleWatcher: true });
  check('watcher: 2 watchers for the same root fail when a single watcher is required', twoSame.pass === false && twoSame.blockers.some((line) => /Duplicate Haravan theme dev watcher/.test(line) && line.includes('11, 12')));
  check('watcher: 2 watchers for the same root are only a warning otherwise', duplicate({ devWatchers: [here(11), here(12)] }).length === 1 && !pf({ devWatchers: [here(11), here(12)] }).blockers.some((line) => /Duplicate/.test(line)));
  check('watcher: 2 watchers for different roots pass (not duplicates, nothing unmeasured)',
    duplicate({ devWatchers: [elsewhere(21, otherRoot), elsewhere(22, siblingRoot)], singleWatcher: true }).length === 0
      && unmeasured({ devWatchers: [elsewhere(21, otherRoot), elsewhere(22, siblingRoot)], singleWatcher: true }).length === 0);
  check('watcher: one watcher for the root plus one for another root passes', duplicate({ devWatchers: [here(11), elsewhere(22, otherRoot)], singleWatcher: true }).length === 0);
  check('watcher: a --root argument ties a watcher to the root', duplicate({ devWatchers: [{ pid: 31, commandLine: `hrv theme dev --root "${pfRoot}"` }, { pid: 32, commandLine: `hrv theme dev --root ${path.join(pfRoot, 'sub')}` }], singleWatcher: true }).length === 1);
  check('watcher: a sibling directory sharing the root name prefix is not the root', duplicate({ devWatchers: [here(11), elsewhere(12, siblingRoot)], singleWatcher: true }).length === 0);
  const noLocation = [{ pid: 41, commandLine: 'hrv theme dev' }, { pid: 42, commandLine: 'hrv theme dev' }];
  check('watcher: 2 watchers with no cwd or --root are reported UNMEASURED, not a pass and not a blocker',
    unmeasured({ devWatchers: noLocation, singleWatcher: true }).length === 1 && duplicate({ devWatchers: noLocation, singleWatcher: true }).length === 0 && pf({ devWatchers: noLocation, singleWatcher: true }).blockers.length === pf({ devWatchers: [], singleWatcher: true }).blockers.length);
  const unreadable = pf({ devWatchersScan: { measured: false, watchers: [] }, singleWatcher: true });
  check('watcher: an unreadable process list is reported UNMEASURED and does not block', unreadable.issues.some((line) => /UNMEASURED: the process list could not be read/.test(line)) && !unreadable.blockers.some((line) => /watcher|UNMEASURED/i.test(line)));
  const classified = preflight.classifyDevWatchers([here(1), elsewhere(2, otherRoot), { pid: 3, commandLine: 'x' }], pfRoot);
  check('watcher: classifyDevWatchers splits matching, elsewhere and unattributed', classified.matching.length === 1 && classified.elsewhere.length === 1 && classified.unattributed.length === 1);
  const listFile = path.join(TMP_ROOT, 'process-list.json');
  writeText(listFile, JSON.stringify([here(51), here(52), elsewhere(53, otherRoot)]));
  const cliList = runNode('run_preflight.js', ['--theme', pfRoot, '--process-list', listFile, '--single-watcher', '--json']);
  let cliListJson = null;
  try { cliListJson = JSON.parse(cliList.stdout); } catch (_) {}
  check('watcher: the CLI reads --process-list and fails on 2 watchers for its root', cliList.status === 1 && cliListJson !== null && cliListJson.blockers.some((line) => /Duplicate Haravan theme dev watcher/.test(line) && line.includes('51, 52') && !line.includes('53')));
  writeText(listFile, JSON.stringify([here(51), elsewhere(53, otherRoot), elsewhere(54, siblingRoot)]));
  const cliListOk = runNode('run_preflight.js', ['--theme', pfRoot, '--process-list', listFile, '--single-watcher', '--json']);
  let cliListOkJson = null;
  try { cliListOkJson = JSON.parse(cliListOk.stdout); } catch (_) {}
  check('watcher: the CLI passes the watcher check with one watcher per root', cliListOkJson !== null && !cliListOkJson.issues.some((line) => /Duplicate|UNMEASURED/.test(line)));
  writeText(listFile, 'not json');
  check('watcher: an unreadable --process-list is an error exit', runNode('run_preflight.js', ['--theme', pfRoot, '--process-list', listFile]).status === 1);
  check('preflight: a stale token is a blocker', pf({ tokenFile: staleToken, maxTokenAgeHours: 24 }).blockers.some((line) => /token stale/.test(line)));
  check('preflight: a fresh token raises nothing', !pf({ tokenFile: freshToken }).issues.some((line) => /token/.test(line)));
  check('preflight: no token option skips the token check', !pf({}).issues.some((line) => /token/.test(line)));
  check('preflight: a missing snapshot is a blocker', pf({ snapshotDir: path.join(TMP_ROOT, 'no-snap') }).blockers.some((line) => /Snapshot missing/.test(line)));
  check('preflight: a present snapshot raises nothing', !pf({ snapshotDir: snapDir }).issues.some((line) => /Snapshot/.test(line)));
  check('preflight: a desktop QA viewport is a blocker', pf({ viewport: '1440x900' }).blockers.some((line) => /Viewport not-touch/.test(line)));
  check('preflight: a missing required key is a blocker', pf({ requiredKeys: ['DELIVERY_TEST_MISSING_KEY'] }).blockers.some((line) => /DELIVERY_TEST_MISSING_KEY/.test(line)));
  check('preflight: a present required key raises nothing', !pf({ requiredKeys: ['DELIVERY_TEST_PRESENT_KEY'], env: { DELIVERY_TEST_PRESENT_KEY: 'v' } }).issues.some((line) => /DELIVERY_TEST_PRESENT_KEY/.test(line)));
  check('preflight: tracked key list is exported', Array.isArray(preflight.TRACKED_KEYS) && preflight.TRACKED_KEYS.includes('AIBOX_API_KEY'));

  const cliMissingToken = runNode('run_preflight.js', ['--theme', pfRoot, '--token-file', path.join(tokenDir, 'none.json')]);
  check('preflight: the CLI exits 1 and names the missing token', cliMissingToken.status === 1 && /Haravan CLI token missing/.test(cliMissingToken.stdout));
  const cliFresh = runNode('run_preflight.js', ['--theme', pfRoot, '--token-file', freshToken, '--snapshot-dir', snapDir, '--viewport', '375x812', '--json']);
  let cliJson = null;
  try { cliJson = JSON.parse(cliFresh.stdout); } catch (_) {}
  check('preflight: the CLI accepts fresh token, snapshot and touch viewport', cliJson !== null && !cliJson.issues.some((line) => /token|Snapshot|Viewport/.test(line)), cliFresh.stdout.slice(0, 300) + cliFresh.stderr.slice(0, 300));
  check('preflight: the CLI never prints the token value', !cliFresh.stdout.includes(secret) && !cliMissingToken.stdout.includes(secret));
  const cliBadViewport = runNode('run_preflight.js', ['--theme', pfRoot, '--viewport', '1440x900']);
  check('preflight: the CLI blocks a desktop QA viewport', cliBadViewport.status === 1 && /Viewport not-touch/.test(cliBadViewport.stdout));
  const defaultArgs = preflight.parseArgs(['node', 'run_preflight.js']);
  check('preflight: the new checks are off by default (existing callers keep their exit codes)', defaultArgs.tokenFile === '' && defaultArgs.singleWatcher === false && defaultArgs.snapshotDir === '' && defaultArgs.viewport === '');
  const strictArgs = preflight.parseArgs(['node', 'run_preflight.js', '--strict']);
  check('preflight: --strict enables the single-watcher blocker and the default token file', strictArgs.singleWatcher === true && /\.haravan-cli\.json$/.test(strictArgs.tokenFile));
  const explicitToken = preflight.parseArgs(['node', 'run_preflight.js', '--strict', '--token-file', freshToken]);
  check('preflight: an explicit --token-file wins over the --strict default', explicitToken.tokenFile === freshToken);

  // ---- spawn marker ------------------------------------------------------------------------
  console.log('\n## 10. Spawn accounting');
  const allSpawns = markerLines(SPAWN_MARKER);
  check('spawn: 0 haravan/hrv/shopify/sapo processes were spawned by export, package, guard, promote, merge, capture and preflight', allSpawns.length === 0, allSpawns.join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
}

main().then(() => {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = failed > 0 ? 1 : 0;
}).catch((error) => {
  console.error(`FAIL suite crashed: ${error.stack || error.message}`);
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = 1;
});
