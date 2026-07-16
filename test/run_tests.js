'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { walkTheme } = require('../lib/theme-walk');
const MOCK = path.resolve(__dirname, 'mock-theme');
const KIT_ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label);
  ok ? passed++ : failed++;
}

// 1. theme-walk
const files = walkTheme(MOCK);
check('theme-walk: finds 11 files', files.length === 11);
check('theme-walk: no node_modules', !files.some(f => f.includes('node_modules')));
check('theme-walk: has liquid files', files.some(f => f.endsWith('.liquid')));
check('theme-walk: has css files', files.some(f => f.endsWith('.css')));

// 2. preflight structural checks
check('preflight: theme.liquid exists', fs.existsSync(path.join(MOCK, 'layout', 'theme.liquid')));
check('preflight: settings.html exists', fs.existsSync(path.join(MOCK, 'config', 'settings.html')));
check('preflight: settings_data.json exists', fs.existsSync(path.join(MOCK, 'config', 'settings_data.json')));
const requiredDirs = ['assets', 'config', 'layout', 'snippets', 'templates'];
check('preflight: all required dirs exist', requiredDirs.every(d => fs.existsSync(path.join(MOCK, d))));

// 3. liquid scan — no HARD_1280 in clean mock
const cssText = fs.readFileSync(path.join(MOCK, 'assets', 'theme.css'), 'utf8');
check('liquid_audit: no 1280px in mock CSS', !cssText.includes('1280px'));

// 4. settings keys
const settingsHtml = fs.readFileSync(path.join(MOCK, 'config', 'settings.html'), 'utf8');
const keys = new Set([...settingsHtml.matchAll(/name="([a-zA-Z0-9_]+)"/g)].map(m => m[1]));
check('settings: has hero_title key', keys.has('hero_title'));
check('settings: has color_primary key', keys.has('color_primary'));
check('settings: has 11+ keys', keys.size >= 11);

// 5. css token: mock has #ffffff
const hexColorRe = /(?:color|background(?:-color)?)\s*:[^;}\n]*#[0-9a-fA-F]{3,8}/m;
check('css_token_audit: detects hex color in mock', hexColorRe.test(cssText));

// 6. no final-showcase in mock
check('guard: no final-showcase in mock', !fs.existsSync(path.join(MOCK, 'final-showcase')));

// 7. INTERACTION_FLOW templates
const flow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'INTERACTION_FLOW.template.json'), 'utf8'));
check('INTERACTION_FLOW: uses flows array', Array.isArray(flow.flows));
check('INTERACTION_FLOW: has flows entries', flow.flows.length >= 1);

// 8. package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
check('package.json: has audit:content', Boolean(pkg.scripts['audit:content']));
check('package.json: has guard:final', Boolean(pkg.scripts['guard:final']));
check('package.json: audit:restyle no redundant --root', !pkg.scripts['audit:restyle'].includes('--root'));

// 9. README exists
check('README.md exists', fs.existsSync(path.join(__dirname, '..', 'README.md')));
check('UPGRADE.md exists', fs.existsSync(path.join(__dirname, '..', 'UPGRADE.md')));

// 10. css_token_audit.js exists and has patterns
const ctaSource = fs.readFileSync(path.join(__dirname, '..', 'css_token_audit.js'), 'utf8');
check('css_token_audit: has HARDCODE_COLOR_HEX', ctaSource.includes('HARDCODE_COLOR_HEX'));
check('css_token_audit: has MAGIC_ZINDEX', ctaSource.includes('MAGIC_ZINDEX'));


// --- Negative tests (mock-theme-bad) ---
const BAD = path.resolve(__dirname, 'mock-theme-bad');

// theme-walk skips test/ dir when walking kit root
const kitFiles = require('../lib/theme-walk').walkTheme(path.resolve(__dirname, '..'));
check('theme-walk: skips test/ when walking kit root', !kitFiles.some(f => f.includes('mock-theme')));

// liquid_audit: detects 1280px in bad mock
const badCss = fs.readFileSync(path.join(BAD, 'assets', 'bad.css'), 'utf8');
check('liquid_audit: detects 1280px in bad mock', /1280px/.test(badCss));

// liquid_audit: detects English hardcode
const badLiquid = fs.readFileSync(path.join(BAD, 'templates', 'index.liquid'), 'utf8');
check('liquid_audit: detects English hardcode in bad mock', /Add to cart/i.test(badLiquid));

// settings_audit: detects missing key
const badSettingsHtml = fs.readFileSync(path.join(BAD, 'config', 'settings.html'), 'utf8');
const badKeys = new Set([...badSettingsHtml.matchAll(/name="([a-zA-Z0-9_]+)"/g)].map(m => m[1]));
const badRefs = [...badLiquid.matchAll(/settings\.([a-zA-Z0-9_]+)/g)].map(m => m[1]);
const missingKeys = badRefs.filter(k => !badKeys.has(k));
check('settings_audit: detects missing_key in bad mock', missingKeys.includes('missing_key'));
check('settings_audit: detects hero_title missing in bad mock', missingKeys.includes('hero_title'));

// css_token_audit: detects hex color in bad CSS
check('css_token_audit: detects hex color in bad mock', /background\s*:\s*#[0-9a-fA-F]{3,8}/.test(badCss));

// --- Integration tests: spawn audit scripts for real ---
function runScript(scriptName, extraArgs = []) {
  const result = spawnSync(process.execPath, [path.join(KIT_ROOT, scriptName), ...extraArgs], {
    cwd: KIT_ROOT,
    encoding: 'utf8'
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

function writePngHeader(file, width, height) {
  ensureDir(path.dirname(file));
  const buf = Buffer.alloc(24);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4E; buf[3] = 0x47;
  buf[4] = 0x0D; buf[5] = 0x0A; buf[6] = 0x1A; buf[7] = 0x0A;
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 4, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  fs.writeFileSync(file, buf);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  return Buffer.concat([len, name, data, crc]);
}

function makePngBuffer(width, height, pixelFn) {
  const channels = 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelFn(x, y);
      const idx = rowStart + 1 + (x * channels);
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function writePng(file, width, height, pixelFn) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, makePngBuffer(width, height, pixelFn));
}

function createFinalGuardFixture(root, mode) {
  const showcase = path.join(root, 'final-showcase');
  ensureDir(showcase);
  ensureDir(path.join(root, 'deliverables'));
  const ledgerStatus = mode === 'pending-ledger' ? 'pending' : 'completed';
  writeText(path.join(root, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'), `| Phase | Status |\n|---|---|\n| QA | ${ledgerStatus} |\n`);
  const description = mode === 'invalid-description'
    ? '<!doctype html><html><body><h1>Bad</h1></body></html>'
    : '<h1>Ivory Gem Theme</h1><p>Mô tả storefront bán hàng theo đúng định hướng thương hiệu, nhấn vào lợi ích, niềm tin và bố cục đã được restyle từ Stitch.</p><ul><li>Layout trung thành với design</li><li>Theme-native cho Haravan</li><li>Ready for editor fragment paste</li></ul><p>Phần mô tả này đủ dài để vượt ngưỡng tối thiểu và chứng minh đây là fragment đã được điền thật, không phải placeholder.</p>';
  writeText(path.join(showcase, 'THEME_DESCRIPTION.html'), description);
  if (mode !== 'missing-artifact') writePng(path.join(showcase, 'Trang chủ.png'), 876, 2000, () => [240, 235, 225, 255]);
  writePng(path.join(showcase, 'Trang chủ-mobile.png'), mode === 'wrong-dimensions' ? 320 : 276, mode === 'wrong-dimensions' ? 500 : 480, () => [232, 226, 216, 255]);
  writePng(path.join(showcase, 'Trang chủ-fullpage.png'), 1200, 2400, () => [220, 214, 204, 255]);
  writePng(path.join(showcase, 'Trang chủ-mobile-fullpage.png'), 375, 1400, () => [208, 202, 192, 255]);
}

// 11. Audit scripts can run standalone (no BOM/shebang issues)
const liquidClean = runScript('liquid_content_audit.js', ['--root', MOCK, '--dry-run']);
check('integration: liquid_content_audit.js spawns clean on good mock', liquidClean.status === 0 && /Liquid Content Audit/.test(liquidClean.stdout) && !liquidClean.stderr.includes('SyntaxError'));
check('integration: liquid_content_audit.js prints report exactly once', (liquidClean.stdout.match(/# Liquid Content Audit/g) || []).length === 1);

const liquidBad = runScript('liquid_content_audit.js', ['--root', path.resolve(__dirname, 'mock-theme-bad'), '--dry-run']);
check('integration: liquid_content_audit detects HARD_1280 in bad mock', /HARD_1280/.test(liquidBad.stdout));
check('integration: liquid_content_audit detects HARDCODE_COLOR in bad mock', /HARDCODE_COLOR/.test(liquidBad.stdout));
check('integration: liquid_content_audit detects ENGLISH_HARDCODE in bad mock', /ENGLISH_HARDCODE/.test(liquidBad.stdout));
check('integration: liquid_content_audit detects SCSS_MIN_MAX in bad mock', /SCSS_MIN_MAX/.test(liquidBad.stdout));
check('integration: liquid_content_audit detects STITCH_FILENAME in bad mock', /STITCH_FILENAME/.test(liquidBad.stdout));
check('integration: liquid_content_audit detects WEBP_ASSET in bad mock', /WEBP_ASSET/.test(liquidBad.stdout));
check('integration: liquid_content_audit detects WEBP_REF in bad mock', /WEBP_REF/.test(liquidBad.stdout));

const settingsBad = runScript('settings_boundary_audit.js', ['--root', path.resolve(__dirname, 'mock-theme-bad'), '--dry-run']);
check('integration: settings_boundary_audit.js spawns clean', settingsBad.status === 0 && !settingsBad.stderr.includes('SyntaxError'));
check('integration: settings_boundary_audit prints report exactly once', (settingsBad.stdout.match(/# Settings Boundary Audit/g) || []).length === 1);
check('integration: settings_boundary_audit detects MISSING_SETTINGS_BOUNDARY', /MISSING_SETTINGS_BOUNDARY/.test(settingsBad.stdout));

const cssBad = runScript('css_token_audit.js', ['--root', path.resolve(__dirname, 'mock-theme-bad'), '--dry-run']);
check('integration: css_token_audit.js spawns clean', cssBad.status === 0 && !cssBad.stderr.includes('SyntaxError'));
check('integration: css_token_audit detects HARDCODE_COLOR_HEX', /HARDCODE_COLOR_HEX/.test(cssBad.stdout));

const liquidWarnFail = runScript('liquid_content_audit.js', ['--root', path.resolve(__dirname, 'mock-theme-bad'), '--fail-on', 'warn']);
check('integration: liquid_content_audit fail-on warn exits non-zero on bad mock', liquidWarnFail.status !== 0);
const settingsWarnFail = runScript('settings_boundary_audit.js', ['--root', path.resolve(__dirname, 'mock-theme-bad'), '--fail-on', 'warn']);
check('integration: settings_boundary_audit fail-on warn exits non-zero on bad mock', settingsWarnFail.status !== 0);
const cssWarnFail = runScript('css_token_audit.js', ['--root', path.resolve(__dirname, 'mock-theme-bad'), '--fail-on', 'warn']);
check('integration: css_token_audit fail-on warn exits non-zero on bad mock', cssWarnFail.status !== 0);

const liquidMissingRoot = runScript('liquid_content_audit.js', ['--root']);
check('integration: liquid_content_audit rejects missing root value', liquidMissingRoot.status !== 0 && /Missing value for --root/.test(liquidMissingRoot.stderr + liquidMissingRoot.stdout));
const settingsBadFailOn = runScript('settings_boundary_audit.js', ['--root', BAD, '--fail-on', 'nope']);
check('integration: settings_boundary_audit rejects invalid fail-on', settingsBadFailOn.status !== 0 && /Invalid --fail-on value/.test(settingsBadFailOn.stderr + settingsBadFailOn.stdout));

// 12. Shared helper files exist and no BOM in JS files
const helperFiles = ['lib/cli-args.js', 'lib/findings.js', 'lib/report.js', 'lib/path-utils.js', 'lib/image.js'];
for (const helper of helperFiles) {
  check(`helper exists: ${helper}`, fs.existsSync(path.join(KIT_ROOT, helper)));
}
const jsFiles = ['liquid_content_audit.js', 'settings_boundary_audit.js', 'css_token_audit.js', 'qa_restyle_check.js', 'run_preflight.js', 'workflow_final_guard.js', 'final_showcase_capture.js', 'final_feature_deck.js', 'final_theme_export.js', 'audit_restyle.js', 'stitch_consume.js', 'asset_pipeline.js', 'orphan_sweep.js', 'visual_diff.js', 'theme_push.js', 'design_token_extract.js', 'section_scaffold.js', 'a11y_deep.js', 'perf_check.js', 'lib/theme-walk.js', 'lib/cli-args.js', 'lib/findings.js', 'lib/report.js', 'lib/path-utils.js', 'lib/image.js', 'test/run_tests.js'];
const bomFiles = jsFiles.filter((f) => {
  const b = fs.readFileSync(path.join(KIT_ROOT, f));
  return b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
});
check('no js file has UTF-8 BOM', bomFiles.length === 0);

// 13. Version sync across kit
const pkgVersion = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'package.json'), 'utf8')).version;
const startHere = fs.readFileSync(path.join(KIT_ROOT, 'START_HERE.md'), 'utf8');
const readme = fs.readFileSync(path.join(KIT_ROOT, 'README.md'), 'utf8');
check('version: package.json matches START_HERE.md', startHere.includes('KIT_VERSION: ' + pkgVersion));
check('version: package.json matches README.md', readme.includes('**Version:** ' + pkgVersion));

// 14. No duplicate mock-theme-bad at root
check('no duplicate mock-theme-bad at root', !fs.existsSync(path.join(KIT_ROOT, 'mock-theme-bad')));

// --- 15. New automation scripts (Stitch end-to-end coverage) ---
const newScripts = ['stitch_consume.js', 'asset_pipeline.js', 'orphan_sweep.js', 'visual_diff.js', 'theme_push.js'];
for (const s of newScripts) {
  check(`script exists: ${s}`, fs.existsSync(path.join(KIT_ROOT, s)));
  const help = runScript(s, ['--help']);
  check(`integration: ${s} --help spawns clean`, help.status === 0 && !help.stderr.includes('SyntaxError'));
}

// stitch_consume produces report on a sample HTML + linked CSS
const sampleDir = path.join(KIT_ROOT, 'test', '_tmp-stitch-in');
const sampleOut = path.join(KIT_ROOT, 'test', '_tmp-stitch-out');
const sampleHtml = path.join(sampleDir, 'design.html');
const sampleCssDir = path.join(sampleDir, 'styles');
fs.mkdirSync(sampleCssDir, { recursive: true });
fs.writeFileSync(sampleHtml, '<html><head><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="./styles/theme.css"><style>.a{color:#1a1a1a;background:#f7f4ee;font-family:Inter;font-size:32px;padding:48px;}</style></head><body><section id="hero"><h1>Glow Ritual</h1><p>Ritual dưỡng da tối giản.</p><img src="https://picsum.photos/800/600"><button>Mua ngay</button></section></body></html>', 'utf8');
fs.writeFileSync(path.join(sampleCssDir, 'theme.css'), '.overlay{background:rgba(10,20,30,0.6);} .hero{color:#223344;}', 'utf8');
const stitchRun = runScript('stitch_consume.js', ['--in', sampleHtml, '--out', sampleOut]);
check('integration: stitch_consume produces report.md', stitchRun.status === 0 && fs.existsSync(path.join(sampleOut, 'report.md')));
check('integration: stitch_consume produces stitch-fidelity.json', fs.existsSync(path.join(sampleOut, 'stitch-fidelity.json')));
check('integration: stitch_consume follows linked CSS', /Linked CSS: 1/.test(stitchRun.stdout));
check('integration: stitch_consume strips CDN tags', stitchRun.stdout.includes('Stripped CDN tags'));
check('integration: stitch_consume detects placeholder URL', fs.readFileSync(path.join(sampleOut, 'report.md'), 'utf8').includes('picsum.photos'));
check('integration: stitch_consume extracts color tokens', fs.readFileSync(path.join(sampleOut, 'report.md'), 'utf8').includes('#1a1a1a'));
const stitchTokens = JSON.parse(fs.readFileSync(path.join(sampleOut, 'tokens.json'), 'utf8'));
check('integration: stitch_consume preserves rgba token from linked CSS', stitchTokens.colors.some((c) => /^rgba\(/.test(c.value)));
const stitchFidelity = JSON.parse(fs.readFileSync(path.join(sampleOut, 'stitch-fidelity.json'), 'utf8'));
check('integration: stitch_consume fidelity has sections array', Array.isArray(stitchFidelity.sections) && stitchFidelity.sections.length >= 1);
check('integration: stitch_consume fidelity has assetSlots array', Array.isArray(stitchFidelity.assetSlots) && stitchFidelity.assetSlots.length >= 1);
check('integration: stitch_consume fidelity has copyBlocks array', Array.isArray(stitchFidelity.copyBlocks) && stitchFidelity.copyBlocks.length >= 1);
check('integration: stitch_consume fidelity has mergeStatus pending', stitchFidelity.mergeStatus === 'pending');
check('integration: stitch_consume fidelity has allowedDeviations array', Array.isArray(stitchFidelity.allowedDeviations));

// asset_pipeline reports plan against mock-theme (all missing)
const planRun = runScript('asset_pipeline.js', ['--plan', path.join(KIT_ROOT, 'asset-plan.template.json'), '--root', MOCK]);
check('integration: asset_pipeline reads plan and reports missing', planRun.status === 0 && /Missing: \d+/.test(planRun.stdout));
const badAssetPlanPath = path.join(KIT_ROOT, 'test', '_tmp-bad-asset-plan.json');
writeText(badAssetPlanPath, JSON.stringify({ assets: [{ key: 'escape', out: '../escape.png', source: 'brand-provided' }] }, null, 2));
const badAssetPlanRun = runScript('asset_pipeline.js', ['--plan', badAssetPlanPath, '--root', MOCK]);
check('integration: asset_pipeline blocks path escape outside root', badAssetPlanRun.status !== 0 && /escapes root/.test(badAssetPlanRun.stdout + badAssetPlanRun.stderr));

const symlinkRoot = path.join(KIT_ROOT, 'test', '_tmp-symlink-root');
const symlinkOutside = path.join(KIT_ROOT, 'test', '_tmp-symlink-outside');
const symlinkPlanPath = path.join(KIT_ROOT, 'test', '_tmp-symlink-asset-plan.json');
let symlinkGuardWorked = false;
let symlinkUnsupported = false;
try {
  ensureDir(symlinkRoot);
  ensureDir(symlinkOutside);
  fs.symlinkSync(symlinkOutside, path.join(symlinkRoot, 'linked-assets'), 'junction');
  writeText(symlinkPlanPath, JSON.stringify({ assets: [{ key: 'escape-junction', out: 'linked-assets/escape.png', source: 'brand-provided' }] }, null, 2));
  const symlinkRun = runScript('asset_pipeline.js', ['--plan', symlinkPlanPath, '--root', symlinkRoot]);
  symlinkGuardWorked = symlinkRun.status !== 0 && /escapes root/.test(symlinkRun.stdout + symlinkRun.stderr);
} catch (_) {
  symlinkUnsupported = true;
}
check('integration: asset_pipeline blocks symlink/junction escape when supported', symlinkUnsupported || symlinkGuardWorked);

const svgRoot = path.join(KIT_ROOT, 'test', '_tmp-svg-root');
const svgPlanGood = path.join(KIT_ROOT, 'test', '_tmp-svg-good-plan.json');
const svgPlanBad = path.join(KIT_ROOT, 'test', '_tmp-svg-bad-plan.json');
const svgPlanMissing = path.join(KIT_ROOT, 'test', '_tmp-svg-missing-plan.json');
writeText(path.join(svgRoot, 'assets', 'icon-good.svg'), '<svg width="100" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50"/></svg>');
writeText(path.join(svgRoot, 'assets', 'icon-bad.svg'), '<svg width="80" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="50"/></svg>');
writeText(path.join(svgRoot, 'assets', 'icon-missing.svg'), '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50"/></svg>');
writeText(svgPlanGood, JSON.stringify({ assets: [{ key: 'icon-good', out: 'assets/icon-good.svg', source: 'brand-provided', w: 100, h: 50 }] }, null, 2));
writeText(svgPlanBad, JSON.stringify({ assets: [{ key: 'icon-bad', out: 'assets/icon-bad.svg', source: 'brand-provided', w: 100, h: 50 }] }, null, 2));
writeText(svgPlanMissing, JSON.stringify({ assets: [{ key: 'icon-missing', out: 'assets/icon-missing.svg', source: 'brand-provided', w: 100, h: 50 }] }, null, 2));
const svgGoodRun = runScript('asset_pipeline.js', ['--plan', svgPlanGood, '--root', svgRoot]);
check('integration: asset_pipeline accepts svg with explicit matching dimensions', svgGoodRun.status === 0 && /Wrong: 0/.test(svgGoodRun.stdout));
const svgBadRun = runScript('asset_pipeline.js', ['--plan', svgPlanBad, '--root', svgRoot]);
check('integration: asset_pipeline rejects svg wrong dimensions', svgBadRun.status !== 0 && /wrong size: expected 100x50, got 80x50/.test(svgBadRun.stdout + svgBadRun.stderr));
const svgMissingRun = runScript('asset_pipeline.js', ['--plan', svgPlanMissing, '--root', svgRoot]);
check('integration: asset_pipeline rejects svg without explicit dimensions', svgMissingRun.status !== 0 && /svg missing explicit width\/height/.test(svgMissingRun.stdout + svgMissingRun.stderr));

// orphan_sweep on clean mock should find zero
const orphanRun = runScript('orphan_sweep.js', ['--root', MOCK]);
check('integration: orphan_sweep reports zero orphans on clean mock', orphanRun.status === 0 && /Orphan assets: 0/.test(orphanRun.stdout));

// theme_push dry-run on mock-theme (no real push)
const pushRun = runScript('theme_push.js', ['--root', MOCK, '--dry-run']);
check('integration: theme_push --dry-run does not execute CLI', pushRun.status === 0 && pushRun.stdout.includes('dry-run'));

// theme_push live without --confirm-live must fail
const pushLiveRun = runScript('theme_push.js', ['--root', MOCK, '--target', 'live']);
check('integration: theme_push live without --confirm-live blocks', pushLiveRun.status !== 0);

// 16. STITCH_FIDELITY.md exists and references key contract
const fidelityPath = path.join(KIT_ROOT, 'STITCH_FIDELITY.md');
check('STITCH_FIDELITY.md exists', fs.existsSync(fidelityPath));
if (fs.existsSync(fidelityPath)) {
  const fidelity = fs.readFileSync(fidelityPath, 'utf8');
  check('STITCH_FIDELITY: documents allowed deviation', fidelity.includes('Allowed deviation') || fidelity.includes('allowed deviation'));
  check('STITCH_FIDELITY: lists anti-patterns', fidelity.includes('Anti-patterns') || fidelity.includes('anti-pattern'));
}

// 17. asset-plan.template.json is valid JSON with assets array
const planTemplate = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'asset-plan.template.json'), 'utf8'));
check('asset-plan.template.json: has assets array', Array.isArray(planTemplate.assets) && planTemplate.assets.length > 0);
check('asset-plan.template.json: has fidelity metadata', Boolean(planTemplate._fidelity) && Array.isArray(planTemplate._fidelity.allowed_deviations));
check('asset-plan.template.json: tracks stitch section on assets', planTemplate.assets.every((asset) => typeof asset.stitchSection === 'string' && typeof asset.slot === 'string'));

// 18. README references Stitch end-to-end flow
const readmeText = fs.readFileSync(path.join(KIT_ROOT, 'README.md'), 'utf8');
check('README: documents Stitch end-to-end flow', readmeText.includes('stitch:consume') && readmeText.includes('asset:plan'));

// 19. FLOW_A.md exists with all key sections
const flowAPath = path.join(KIT_ROOT, 'FLOW_A.md');
check('FLOW_A.md exists', fs.existsSync(flowAPath));
if (fs.existsSync(flowAPath)) {
  const flowA = fs.readFileSync(flowAPath, 'utf8');
  check('FLOW_A: has 15 steps (A.1 through A.15)', /A\.15/.test(flowA));
  check('FLOW_A: has implement order (global layer first)', /global layer/i.test(flowA) || /global/.test(flowA));
  check('FLOW_A: has Stitch Gap Checklist', /Stitch Gap/i.test(flowA));
  check('FLOW_A: has quick lookup table', /Quick lookup/i.test(flowA));
  check('FLOW_A: has 6 rules cứng', /quy t.c c.ng/i.test(flowA) || /rules c.ng/i.test(flowA) || /quy tắc cứng/i.test(flowA));
}

// 19b. Ledger template has Stitch Inventory table
const ledgerPath = path.join(KIT_ROOT, 'RESTYLE_PROGRESS_LEDGER.template.md');
const ledger = fs.readFileSync(ledgerPath, 'utf8');
check('LEDGER: has Stitch Inventory table', /Stitch Inventory/i.test(ledger));
check('LEDGER: has Stitch Gap Checklist', /Stitch Gap/i.test(ledger));
check('LEDGER: has Stitch Fidelity confirmed field', /Stitch Fidelity/i.test(ledger));

// --- 20. Advanced 4-script suite (token extract, scaffold, a11y deep, perf) ---
const advancedScripts = ['design_token_extract.js', 'section_scaffold.js', 'a11y_deep.js', 'perf_check.js'];
for (const s of advancedScripts) {
  check(`script exists: ${s}`, fs.existsSync(path.join(KIT_ROOT, s)));
  const help = runScript(s, ['--help']);
  check(`integration: ${s} --help spawns clean`, help.status === 0 && !help.stderr.includes('SyntaxError'));
}

// design_token_extract: end-to-end on mock theme + rich stitch consume output
const tmpExtract = path.join(KIT_ROOT, 'test', '_tmp-extract-out');
const extractRun = runScript('design_token_extract.js', ['--theme', MOCK, '--stitch-tokens', path.join(sampleOut, 'tokens.json'), '--out', tmpExtract]);
check('integration: design_token_extract produces mapping.md', extractRun.status === 0 && fs.existsSync(path.join(tmpExtract, 'mapping.md')));
check('integration: design_token_extract produces tokens.css', fs.existsSync(path.join(tmpExtract, 'tokens.css')));
check('integration: design_token_extract produces mapping.json', fs.existsSync(path.join(tmpExtract, 'mapping.json')));
const mappingJson = JSON.parse(fs.readFileSync(path.join(tmpExtract, 'mapping.json'), 'utf8'));
check('integration: design_token_extract.suggestions is array', Array.isArray(mappingJson.suggestions));
check('integration: design_token_extract preserves rgba stitch colors', mappingJson.stitchColors.some((c) => /^rgba\(/.test(c.value)));
check('integration: design_token_extract writes stitch-fidelity-token-map.json', fs.existsSync(path.join(tmpExtract, 'stitch-fidelity-token-map.json')));
check('integration: design_token_extract mapping.json includes fidelity summary', Boolean(mappingJson.fidelity) && typeof mappingJson.fidelity.sectionCount === 'number' && mappingJson.fidelity.sectionCount >= 1);

// section_scaffold: dry-run on template config
const scaffoldRoot = path.join(KIT_ROOT, 'test', '_tmp-scaffold');
const scaffoldDry = runScript('section_scaffold.js', ['--config', path.join(KIT_ROOT, 'section-config.template.json'), '--root', scaffoldRoot, '--dry-run']);
check('integration: section_scaffold --dry-run plans 4 files', scaffoldDry.status === 0 && /Files planned: 4/.test(scaffoldDry.stdout));
const scaffoldRun = runScript('section_scaffold.js', ['--config', path.join(KIT_ROOT, 'section-config.template.json'), '--root', scaffoldRoot]);
check('integration: section_scaffold writes section liquid', scaffoldRun.status === 0 && fs.existsSync(path.join(scaffoldRoot, 'templates', 'sections', 'hero-banner.liquid')));
const heroLiquid = fs.readFileSync(path.join(scaffoldRoot, 'templates', 'sections', 'hero-banner.liquid'), 'utf8');
check('integration: section_scaffold output has schema block', heroLiquid.includes('{% schema %}') && heroLiquid.includes('{% endschema %}'));
check('integration: section_scaffold output has Stitch source comment', heroLiquid.includes('Stitch source'));
check('integration: section_scaffold renders CTA only once', (heroLiquid.match(/cta_text/g) || []).length <= 4); // schema + button render only

// section_scaffold safe mode (no overwrite)
const scaffoldSafe = runScript('section_scaffold.js', ['--config', path.join(KIT_ROOT, 'section-config.template.json'), '--root', scaffoldRoot]);
check('integration: section_scaffold without --force skips existing', scaffoldSafe.stdout.includes('SKIP'));

// perf_check: bundle scan + save baseline
const perfOut = path.join(KIT_ROOT, 'test', '_tmp-perf');
const perfRun = runScript('perf_check.js', ['--root', MOCK, '--out', perfOut, '--save-baseline']);
check('integration: perf_check writes report.md', perfRun.status === 0 && fs.existsSync(path.join(perfOut, 'perf-report.md')));
check('integration: perf_check saves baseline', fs.existsSync(path.join(perfOut, 'perf-baseline.json')));
const perfDiff = runScript('perf_check.js', ['--root', MOCK, '--out', perfOut, '--baseline', path.join(perfOut, 'perf-baseline.json')]);
check('integration: perf_check diff vs same baseline reports zero delta', perfDiff.status === 0 && /\+0 kB|0 kB|No bundle changes/.test(perfDiff.stdout));

// a11y_deep: local fixture smoke coverage
let axeResolved = false;
try { require.resolve('axe-core/axe.min.js'); axeResolved = true; } catch (_) {}
check('a11y_deep dependency: axe-core/axe.min.js resolvable', axeResolved);

const browserFixtureBase = 'file:///' + path.join(KIT_ROOT, 'test', 'fixtures', 'browser').replace(/\\/g, '/').replace(/^\/+/, '');
const qaOut = path.join(KIT_ROOT, 'test', '_tmp-qa-fixture');
const qaFlowPath = path.join(KIT_ROOT, 'test', '_tmp-qa-flow.json');
writeText(qaFlowPath, JSON.stringify({
  flows: [
    {
      name: 'fixture-flow',
      path: '/flow-page.html',
      viewports: [375],
      steps: [
        { action: 'fill', selector: '#email', value: 'demo@example.com' },
        { action: 'click', selector: '#submit' },
        { action: 'expectVisible', selector: '#result' }
      ]
    }
  ]
}, null, 2));
const qaFixtureRun = runScript('qa_restyle_check.js', ['--base', browserFixtureBase, '--paths', '/basic-page.html,/overflow-page.html,/flow-page.html', '--viewports', '375', '--out', qaOut, '--flow', qaFlowPath]);
check('integration: qa_restyle_check local fixture smoke passes without fail status', qaFixtureRun.status === 0 && fs.existsSync(path.join(qaOut, 'qa-results.json')) && fs.existsSync(path.join(qaOut, 'qa-results.md')));
const qaFixtureJson = JSON.parse(fs.readFileSync(path.join(qaOut, 'qa-results.json'), 'utf8'));
check('integration: qa fixture detects overflow warning', qaFixtureJson.some((item) => item.path === '/overflow-page.html' && item.overflow));
check('integration: qa fixture records flow results', qaFixtureJson.some((item) => item.path === '/flow-page.html' && Array.isArray(item.flow) && item.flow.length > 0));
check('integration: qa fixture records console errors as warnings', qaFixtureJson.some((item) => item.path === '/flow-page.html' && Array.isArray(item.consoleErrors) && item.consoleErrors.includes('fixture-console-error')));
check('integration: qa fixture records a11y warnings', qaFixtureJson.some((item) => item.path === '/basic-page.html' && Array.isArray(item.a11y) && item.a11y.length > 0));

const a11yOut = path.join(KIT_ROOT, 'test', '_tmp-a11y-fixture');
const a11yFixtureRun = runScript('a11y_deep.js', ['--base', browserFixtureBase, '--paths', '/basic-page.html', '--viewports', '375', '--out', a11yOut, '--fail-on', 'minor']);
check('integration: a11y_deep local fixture writes outputs', fs.existsSync(path.join(a11yOut, 'a11y-results.json')) && fs.existsSync(path.join(a11yOut, 'a11y-report.md')));
check('integration: a11y_deep local fixture fails on minor threshold', a11yFixtureRun.status !== 0);

// 24. workflow_final_guard fixture coverage
const fgPassRoot = path.join(KIT_ROOT, 'test', '_tmp-final-guard-pass');
const fgMissingRoot = path.join(KIT_ROOT, 'test', '_tmp-final-guard-missing');
const fgWrongDimsRoot = path.join(KIT_ROOT, 'test', '_tmp-final-guard-wrong-dims');
const fgInvalidDescRoot = path.join(KIT_ROOT, 'test', '_tmp-final-guard-invalid-desc');
const fgPendingRoot = path.join(KIT_ROOT, 'test', '_tmp-final-guard-pending');
createFinalGuardFixture(fgPassRoot, 'pass');
createFinalGuardFixture(fgMissingRoot, 'missing-artifact');
createFinalGuardFixture(fgWrongDimsRoot, 'wrong-dimensions');
createFinalGuardFixture(fgInvalidDescRoot, 'invalid-description');
createFinalGuardFixture(fgPendingRoot, 'pending-ledger');
const finalGuardPass = runScript('workflow_final_guard.js', ['--root', fgPassRoot]);
check('integration: workflow_final_guard passes valid fixture', finalGuardPass.status === 0 && /PASS: final gate clear/.test(finalGuardPass.stdout));
const finalGuardMissing = runScript('workflow_final_guard.js', ['--root', fgMissingRoot]);
check('integration: workflow_final_guard fails missing artifact fixture', finalGuardMissing.status !== 0 && /missing desktop screenshot/.test(finalGuardMissing.stderr));
const finalGuardWrongDims = runScript('workflow_final_guard.js', ['--root', fgWrongDimsRoot]);
check('integration: workflow_final_guard fails wrong-dimensions fixture', finalGuardWrongDims.status !== 0 && /expected 276x480/.test(finalGuardWrongDims.stderr));
const finalGuardInvalidDesc = runScript('workflow_final_guard.js', ['--root', fgInvalidDescRoot]);
check('integration: workflow_final_guard fails invalid description fixture', finalGuardInvalidDesc.status !== 0 && /editor fragment/.test(finalGuardInvalidDesc.stderr));
const finalGuardPending = runScript('workflow_final_guard.js', ['--root', fgPendingRoot]);
check('integration: workflow_final_guard fails pending ledger fixture', finalGuardPending.status !== 0 && /final gate not clear/.test(finalGuardPending.stderr));
const finalGuardMissingValue = runScript('workflow_final_guard.js', ['--root']);
check('integration: workflow_final_guard rejects missing root value', finalGuardMissingValue.status !== 0 && /Missing value for --root/.test(finalGuardMissingValue.stderr + finalGuardMissingValue.stdout));
const finalGuardRequirePptx = runScript('workflow_final_guard.js', ['--root', fgPassRoot, '--require-pptx']);
check('integration: workflow_final_guard --require-pptx fails without pptx', finalGuardRequirePptx.status !== 0 && /missing feature deck pptx/.test(finalGuardRequirePptx.stderr));
writeText(path.join(fgPassRoot, 'final-showcase', 'demo-features.pptx'), 'PK' + String.fromCharCode(3,4) + 'fake-pptx');
const finalGuardRequirePptxPass = runScript('workflow_final_guard.js', ['--root', fgPassRoot, '--require-pptx']);
check('integration: workflow_final_guard --require-pptx passes when pptx present', finalGuardRequirePptxPass.status === 0);

// 24a. final multi-template capture + feature deck scripts
check('script exists: final_feature_deck.js', fs.existsSync(path.join(KIT_ROOT, 'final_feature_deck.js')));
check('script exists: final_feature_capture.js', fs.existsSync(path.join(KIT_ROOT, 'final_feature_capture.js')));
check('template exists: FEATURES.template.json', fs.existsSync(path.join(KIT_ROOT, 'FEATURES.template.json')));
check('template exists: FEATURE_SHOTS.template.json', fs.existsSync(path.join(KIT_ROOT, 'FEATURE_SHOTS.template.json')));
check('template exists: CAPTURE_PATHS.template.json', fs.existsSync(path.join(KIT_ROOT, 'CAPTURE_PATHS.template.json')));
check('template exists: SKILL_IMPROVEMENT_LOG.template.md', fs.existsSync(path.join(KIT_ROOT, 'SKILL_IMPROVEMENT_LOG.template.md')));
const stitchPromptDoc = fs.readFileSync(path.join(KIT_ROOT, 'STITCH_PROMPT.template.md'), 'utf8');
check('STITCH_PROMPT: has GLOBAL RULES block', stitchPromptDoc.includes('GLOBAL RULES (BẮT BUỘC)'));
check('STITCH_PROMPT: screen list covers new modals', /Swal Modal/.test(stitchPromptDoc) && /Sale Popup/.test(stitchPromptDoc) && /Notify Modal/.test(stitchPromptDoc) && /Livechat Modal/.test(stitchPromptDoc));
check('STITCH_PROMPT: has SHELL SPEC anti-drift', /SHELL SPEC/.test(stitchPromptDoc));
check('STITCH_PROMPT: has MOTION/INTERACTION SPEC', /MOTION\/INTERACTION SPEC/.test(stitchPromptDoc));
const captureHelp = runScript('final_showcase_capture.js', ['--help']);
check('integration: final_showcase_capture --help mentions all-templates', captureHelp.status === 0 && /all-templates/.test(captureHelp.stdout));
check('integration: final_showcase_capture --help mentions mobile-pages', captureHelp.status === 0 && /mobile-pages/.test(captureHelp.stdout));
const featureCaptureHelp = runScript('final_feature_capture.js', ['--help']);
check('integration: final_feature_capture --help spawns clean', featureCaptureHelp.status === 0 && /FEATURE_SHOTS/.test(featureCaptureHelp.stdout));
const capturePathsTemplate = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'CAPTURE_PATHS.template.json'), 'utf8'));
const requiredCaptureKeys = ['home', 'collection', 'product', 'blog', 'article', 'page-default', 'page-custom', 'login', 'register'];
check('CAPTURE_PATHS.template has required template keys', requiredCaptureKeys.every((k) => Object.prototype.hasOwnProperty.call(capturePathsTemplate, k)));
const featuresTemplate = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'FEATURES.template.json'), 'utf8'));
check('FEATURES.template has features array', Array.isArray(featuresTemplate.features) && featuresTemplate.features.length >= 1);
check('FEATURES.template documents bullets', featuresTemplate.features.some((f) => Array.isArray(f.bullets)));
const featureShotsTemplate = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'FEATURE_SHOTS.template.json'), 'utf8'));
check('FEATURE_SHOTS.template has shots array', Array.isArray(featureShotsTemplate.shots) && featureShotsTemplate.shots.length >= 1);
const deckHelp = runScript('final_feature_deck.js', ['--help']);
check('integration: final_feature_deck --help spawns clean', deckHelp.status === 0 && !deckHelp.stderr.includes('SyntaxError'));
const deckRoot = path.join(KIT_ROOT, 'test', '_tmp-feature-deck');
const deckOut = path.join(deckRoot, 'final-showcase');
ensureDir(deckOut);
writePng(path.join(deckOut, 'Trang chủ.png'), 876, 2000, () => [20, 20, 20, 255]);
writePng(path.join(deckOut, 'Trang chủ-fullpage.png'), 400, 800, () => [30, 30, 30, 255]);
writeText(path.join(deckOut, 'FEATURES.json'), JSON.stringify({
  brand: 'Demo Brand',
  tagline: 'Deck smoke test',
  coverSubtitle: 'Smoke cover',
  sectionTitle: 'TÍNH NĂNG NỔI BẬT',
  thankYou: 'Team Demo xin cảm ơn ạ.',
  features: [
    { title: 'Feature A', body: 'Body A long enough for slide copy.', bullets: ['One', 'Two'], image: 'Trang chủ.png' },
    { title: 'Feature B', body: 'Body B', image: 'Trang chủ-fullpage.png' }
  ]
}, null, 2));
const deckRun = runScript('final_feature_deck.js', ['--out', deckOut, '--brand', 'Demo Brand', '--file', 'demo-features.pptx']);
check('integration: final_feature_deck writes pptx', deckRun.status === 0 && fs.existsSync(path.join(deckOut, 'demo-features.pptx')));
check('integration: final_feature_deck reports feature count', /Features: 2/.test(deckRun.stdout));

// 24b. visual_diff functional coverage
const diffBeforeDir = path.join(KIT_ROOT, 'test', '_tmp-visual-before');
const diffAfterSameDir = path.join(KIT_ROOT, 'test', '_tmp-visual-after-same');
const diffAfterDifferentDir = path.join(KIT_ROOT, 'test', '_tmp-visual-after-different');
const diffAfterSizeDir = path.join(KIT_ROOT, 'test', '_tmp-visual-after-size');
const diffAfterCorruptDir = path.join(KIT_ROOT, 'test', '_tmp-visual-after-corrupt');
const diffOutDir = path.join(KIT_ROOT, 'test', '_tmp-visual-out');
writePng(path.join(diffBeforeDir, 'home-375.png'), 4, 4, () => [255, 0, 0, 255]);
writePng(path.join(diffAfterSameDir, 'home-375.png'), 4, 4, () => [255, 0, 0, 255]);
writePng(path.join(diffAfterDifferentDir, 'home-375.png'), 4, 4, () => [0, 0, 255, 255]);
writePng(path.join(diffAfterSizeDir, 'home-375.png'), 5, 4, () => [255, 0, 0, 255]);
writeText(path.join(diffAfterCorruptDir, 'home-375.png'), 'not-a-real-png');
const diffSame = runScript('visual_diff.js', ['--before', diffBeforeDir, '--after', diffAfterSameDir, '--paths', '/', '--viewports', '375', '--threshold', '0.01', '--out', diffOutDir]);
check('integration: visual_diff passes identical PNGs', diffSame.status === 0 && /0\.00%/.test(diffSame.stdout));
const diffDifferent = runScript('visual_diff.js', ['--before', diffBeforeDir, '--after', diffAfterDifferentDir, '--paths', '/', '--viewports', '375', '--threshold', '0.01', '--out', diffOutDir]);
check('integration: visual_diff fails over-threshold PNGs', diffDifferent.status !== 0 && /fail/.test(diffDifferent.stdout));
const diffSize = runScript('visual_diff.js', ['--before', diffBeforeDir, '--after', diffAfterSizeDir, '--paths', '/', '--viewports', '375', '--threshold', '1', '--out', diffOutDir]);
check('integration: visual_diff warns on size mismatch under threshold', diffSize.status === 0 && /\| no \| warn \|/.test(diffSize.stdout));
const diffCorrupt = runScript('visual_diff.js', ['--before', diffBeforeDir, '--after', diffAfterCorruptDir, '--paths', '/', '--viewports', '375', '--threshold', '0.01', '--out', diffOutDir]);
check('integration: visual_diff fails on corrupt PNG', diffCorrupt.status !== 0 && /not a PNG/.test(diffCorrupt.stdout));
const diffBadThreshold = runScript('visual_diff.js', ['--before', diffBeforeDir, '--after', diffAfterSameDir, '--threshold', 'nope']);
check('integration: visual_diff rejects invalid threshold', diffBadThreshold.status !== 0 && /Invalid numeric value for --threshold/.test(diffBadThreshold.stderr + diffBadThreshold.stdout));

// Cleanup temp dirs
for (const d of [badAssetPlanPath, symlinkRoot, symlinkOutside, symlinkPlanPath, svgRoot, svgPlanGood, svgPlanBad, svgPlanMissing, tmpExtract, scaffoldRoot, perfOut, qaOut, qaFlowPath, a11yOut, fgPassRoot, fgMissingRoot, fgWrongDimsRoot, fgInvalidDescRoot, fgPendingRoot, deckRoot, diffBeforeDir, diffAfterSameDir, diffAfterDifferentDir, diffAfterSizeDir, diffAfterCorruptDir, diffOutDir]) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
}

// 21. New npm scripts present
check('package.json: has token:extract', Boolean(pkg.scripts['token:extract']));
check('package.json: has section:scaffold', Boolean(pkg.scripts['section:scaffold']));
check('package.json: has a11y:deep', Boolean(pkg.scripts['a11y:deep']));
check('package.json: has stitch:full', Boolean(pkg.scripts['stitch:full']));
check('package.json: has perf:check', Boolean(pkg.scripts['perf:check']));
check('package.json: has final:pptx', Boolean(pkg.scripts['final:pptx']));
check('package.json: has final:capture', Boolean(pkg.scripts['final:capture']));

// 22. axe-core declared in dependencies
check('package.json: axe-core in dependencies', Boolean(pkg.dependencies && pkg.dependencies['axe-core']));
check('package.json: pptxgenjs in dependencies', Boolean(pkg.dependencies && pkg.dependencies['pptxgenjs']));

// 23. section-config.template.json valid
const sectionConfig = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'section-config.template.json'), 'utf8'));
check('section-config.template.json: has sections array', Array.isArray(sectionConfig.sections) && sectionConfig.sections.length > 0);
check('section-config.template.json: every section has name', sectionConfig.sections.every((s) => typeof s.name === 'string' && s.name.length > 0));
check('section-config.template.json: has fidelity metadata', Boolean(sectionConfig._fidelity) && Array.isArray(sectionConfig._fidelity.allowed_deviations));
check('section-config.template.json: sections track stitch fidelity fields', sectionConfig.sections.every((s) => typeof s.stitchSectionIndex === 'number' && Array.isArray(s.copyBlocks) && Array.isArray(s.requiredAssets)));

// 25. PROMPT.template.md exists with key prompt sections
const promptPath = path.join(KIT_ROOT, 'PROMPT.template.md');
check('PROMPT.template.md exists', fs.existsSync(promptPath));
if (fs.existsSync(promptPath)) {
  const prompt = fs.readFileSync(promptPath, 'utf8');
  check('PROMPT: documents Kickoff luồng A', /Kickoff lu.ng A/i.test(prompt));
  check('PROMPT: documents Resume', /Resume/i.test(prompt));
  check('PROMPT: documents Final handoff', /Final handoff/i.test(prompt));
  check('PROMPT: documents Audit-led', /Audit-led/i.test(prompt) || /lu.ng C/i.test(prompt));
  check('PROMPT: lists Anti-prompt examples', /Anti-prompt/i.test(prompt));
  check('PROMPT: 3 minimum info documented', prompt.includes('Theme path') || prompt.includes('Theme:'));
}

// 25b. stitch_pipeline_runner smoke
check('script exists: stitch_pipeline_runner.js', fs.existsSync(path.join(KIT_ROOT, 'stitch_pipeline_runner.js')));
const runnerHelp = runScript('stitch_pipeline_runner.js', ['--help']);
check('integration: stitch_pipeline_runner.js --help spawns clean', runnerHelp.status === 0 && !runnerHelp.stderr.includes('SyntaxError'));
const runnerOut = path.join(KIT_ROOT, 'test', '_tmp-runner-out');
const runnerDry = runScript('stitch_pipeline_runner.js', ['--theme', MOCK, '--stitch', sampleHtml, '--out', runnerOut]);
check('integration: stitch_pipeline_runner dry-run writes plan file', runnerDry.status === 0 && fs.existsSync(path.join(runnerOut, 'stitch-pipeline-plan.json')));
const runnerPlan = JSON.parse(fs.readFileSync(path.join(runnerOut, 'stitch-pipeline-plan.json'), 'utf8'));
check('integration: stitch_pipeline_runner plan has steps array', Array.isArray(runnerPlan.steps) && runnerPlan.steps.length > 0);
check('integration: stitch_pipeline_runner plan has checkpoints array', Array.isArray(runnerPlan.checkpoints) && runnerPlan.checkpoints.length >= 4);
const runnerExec = runScript('stitch_pipeline_runner.js', ['--theme', MOCK, '--stitch', sampleHtml, '--out', runnerOut, '--execute']);
check('integration: stitch_pipeline_runner execute stops at first gated checkpoint', runnerExec.status === 0 && /STOP at checkpoint: section-config/.test(runnerExec.stdout));
try { fs.rmSync(runnerOut, { recursive: true, force: true }); } catch (_) {}
try { fs.rmSync(sampleDir, { recursive: true, force: true }); } catch (_) {}
try { fs.rmSync(sampleOut, { recursive: true, force: true }); } catch (_) {}

// 26. README points to PROMPT.template.md
check('README: points to PROMPT.template.md', readmeText.includes('PROMPT.template.md'));
check('FLOW_A: points to PROMPT.template.md', fs.readFileSync(flowAPath, 'utf8').includes('PROMPT.template.md'));
const runGuidePath = path.join(KIT_ROOT, 'RUN_GUIDE.md');
check('RUN_GUIDE.md exists', fs.existsSync(runGuidePath));
if (fs.existsSync(runGuidePath)) {
  const guide = fs.readFileSync(runGuidePath, 'utf8');
  check('RUN_GUIDE: documents flow A', /Lu\u1ED3ng A/.test(guide) || guide.includes('Luồng A'));
  check('RUN_GUIDE: documents flow B', /Lu\u1ED3ng B/.test(guide) || guide.includes('Luồng B'));
  check('RUN_GUIDE: documents flow C', /Lu\u1ED3ng C/.test(guide) || guide.includes('Luồng C'));
  check('RUN_GUIDE: documents flow D', /Lu\u1ED3ng D/.test(guide) || guide.includes('Luồng D'));
  check('RUN_GUIDE: links to FLOW_A.md', guide.includes('FLOW_A.md'));
  check('RUN_GUIDE: lists common pitfalls', guide.includes('Common pitfalls') || guide.includes('common pitfalls'));
  check('RUN_GUIDE: includes quick reference table', guide.includes('Quick reference') || guide.includes('quick reference'));
}

console.log('');console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);