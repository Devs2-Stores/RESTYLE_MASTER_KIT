'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const zlib = require('zlib');
const { createZip } = require('../lib/zip');
const {
  toAsciiSlug,
  resolvePageLabel,
  pageShotFilename,
  loadJsonObject,
  DEFAULT_HIDE_SELECTORS
} = require('../final_showcase_capture');
const { scanSettingsDataForThemeCdnUrls } = require('../final_theme_export');

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

function runScript(scriptName, extraArgs = []) {
  return spawnSync(process.execPath, [path.join(KIT_ROOT, scriptName), ...extraArgs], {
    cwd: KIT_ROOT,
    encoding: 'utf8'
  });
}

console.log('# Final Showcase & Export Test Suite\n');

// =========================================================================
// 1. Naming & Diacritic Folding Tests (Log line 84 / Change 3)
// =========================================================================
console.log('## 1. Naming & Diacritic Folding');

check('slug: folds đ and accents correctly',
  toAsciiSlug('Trang dịch vụ xưởng') === 'trang-dich-vu-xuong');
check('slug: folds Đ uppercase',
  toAsciiSlug('Đạp xe đường phố') === 'dap-xe-duong-pho');
check('slug: cleans punctuation and spaces',
  toAsciiSlug('  Áo / Quần (Bán chạy)  ') === 'ao-quan-ban-chay');
check('slug: preserves ascii alphanumeric and hyphens',
  toAsciiSlug('page-custom_2') === 'page-custom_2');

check('label: explicit customLabel used directly',
  resolvePageLabel('custom', '/pages/xuong', 'Trang dịch vụ xưởng') === 'Trang dịch vụ xưởng');
check('label: adds Trang prefix when customLabel lacks it',
  resolvePageLabel('custom', '/pages/xuong', 'Dịch vụ xưởng') === 'Trang Dịch vụ xưởng');
check('label: NFC normalization preserved',
  resolvePageLabel('custom', '/pages/xuong', 'Dịch vụ'.normalize('NFD')) === 'Trang ' + 'Dịch vụ'.normalize('NFC'));

check('filename: keeps Vietnamese letters for desktop',
  pageShotFilename('custom', 'desktop', '/pages/xuong', 'Trang dịch vụ xưởng') === 'Trang dịch vụ xưởng.png');
check('filename: keeps Vietnamese letters for mobile',
  pageShotFilename('custom', 'mobile', '/pages/xuong', 'Trang dịch vụ xưởng') === 'Trang dịch vụ xưởng-mobile.png');
check('filename: strips Windows-forbidden chars (<>:"/\\|?*)',
  pageShotFilename('custom', 'desktop', '/pages/xuong', 'Trang: dịch vụ / xưởng *?<>|') === 'Trang dịch vụ  xưởng.png');

const tmpPathsFile = path.join(KIT_ROOT, 'test', '_tmp-capture-paths.json');
fs.writeFileSync(tmpPathsFile, JSON.stringify({
  'Trang dịch vụ xưởng': '/pages/dich-vu-xuong',
  'custom-service': {
    path: '/pages/custom-service',
    label: 'Trang bảo hành chuyên sâu'
  },
  home: '/'
}, null, 2), 'utf8');

try {
  const loaded = loadJsonObject(tmpPathsFile, '--paths-file');
  check('loadJsonObject: parses key to ascii slug',
    loaded.map['trang-dich-vu-xuong'] === '/pages/dich-vu-xuong');
  check('loadJsonObject: retains human label for unicode key',
    loaded.labels['trang-dich-vu-xuong'] === 'Trang dịch vụ xưởng');
  check('loadJsonObject: retains object label field',
    loaded.labels['custom-service'] === 'Trang bảo hành chuyên sâu');
  check('loadJsonObject: standard home key untouched',
    loaded.map.home === '/');
} finally {
  try { fs.unlinkSync(tmpPathsFile); } catch (_) {}
}

check('hide: default hide selectors contains floating widgets',
  DEFAULT_HIDE_SELECTORS.includes('float-social') &&
  DEFAULT_HIDE_SELECTORS.includes('.rb-float-social') &&
  DEFAULT_HIDE_SELECTORS.includes('newsletter-modal') &&
  DEFAULT_HIDE_SELECTORS.includes('.toast-container'));

// =========================================================================
// 2. Raw Zip Placement & CLI Avoidance (Log line 85 / Change 5)
// =========================================================================
console.log('\n## 2. Raw Zip Placement & Clean Deliverables');

const tmpThemeRoot = path.join(KIT_ROOT, 'test', '_tmp-theme-export-root');
const tmpShowcaseDir = path.join(tmpThemeRoot, 'final-showcase');
const tmpRawCliZip = path.join(tmpThemeRoot, 'S2-Theme-14_10_2026.zip');

try {
  fs.mkdirSync(path.join(tmpThemeRoot, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(tmpThemeRoot, 'config'), { recursive: true });
  fs.writeFileSync(path.join(tmpThemeRoot, 'layout', 'theme.liquid'), '<html><body>test</body></html>');
  fs.writeFileSync(path.join(tmpThemeRoot, 'config', 'settings_schema.json'), '[]');

  createZip([
    { name: 'layout/theme.liquid', data: '<html><body>test</body></html>' },
    { name: 'config/settings_schema.json', data: '[]' }
  ], tmpRawCliZip);

  // Run final_theme_export with --skip-cli so haravan CLI is NOT invoked
  const exportRun = runScript('final_theme_export.js', [
    '--root', tmpThemeRoot,
    '--brand', 'Devs2-RogBikes',
    '--file', 'Haravan-Devs2-RogBikes-v20261014-1200.zip',
    '--skip-cli',
    '--out', tmpShowcaseDir
  ]);

  check('export: runs successfully without haravan CLI (--skip-cli)',
    exportRun.status === 0, exportRun.stderr);

  const handoffZip = path.join(tmpShowcaseDir, 'Haravan-Devs2-RogBikes-v20261014-1200.zip');
  check('export: handoff zip created in final-showcase/',
    fs.existsSync(handoffZip));

  const rawMovedZip = path.join(tmpShowcaseDir, 'raw', 'S2-Theme-14_10_2026.zip');
  check('export: raw CLI zip moved into final-showcase/raw/',
    fs.existsSync(rawMovedZip));

  check('export: raw CLI zip removed from theme root',
    !fs.existsSync(tmpRawCliZip));

  const showcaseZips = fs.readdirSync(tmpShowcaseDir).filter((f) => /\.zip$/i.test(f));
  check('export: only canonical handoff zip sits directly in final-showcase/',
    showcaseZips.length === 1 && showcaseZips[0] === 'Haravan-Devs2-RogBikes-v20261014-1200.zip');

  // Verify workflow_final_guard rejects raw CLI zip sitting directly in final-showcase
  const badShowcaseDir = path.join(tmpThemeRoot, 'bad-showcase');
  fs.mkdirSync(badShowcaseDir, { recursive: true });
  fs.copyFileSync(handoffZip, path.join(badShowcaseDir, 'Haravan-Devs2-RogBikes-v20261014-1200.zip'));
  fs.copyFileSync(handoffZip, path.join(badShowcaseDir, 'S2-Theme-14_10_2026.zip'));

  const guardRawCheck = runScript('workflow_final_guard.js', [
    '--root', tmpThemeRoot,
    '--out', badShowcaseDir,
    '--require-zip'
  ]);
  check('guard: rejects raw CLI zip sitting directly in final-showcase',
    guardRawCheck.status !== 0 && /raw CLI export zip/.test(guardRawCheck.stderr));

} finally {
  try { fs.rmSync(tmpThemeRoot, { recursive: true, force: true }); } catch (_) {}
}

// =========================================================================
// 3. Portability: Theme CDN URL Scan & Warning (Change 6)
// =========================================================================
console.log('\n## 3. Portability: Theme CDN URL Scan');

const tmpCdnZip = path.join(KIT_ROOT, 'test', '_tmp-cdn-scan.zip');
const settingsWithCdn = JSON.stringify({
  current: {
    logo: 'https://cdn.hstatic.net/themes/1000123456/1000876543/assets/logo.png',
    banner: '//cdn.hstatic.net/themes/1000123456/1000876543/10/banner.jpg',
    normal_text: 'Xin chao',
    normal_img: 'https://file.hstatic.net/1000123456/file/banner.jpg'
  }
}, null, 2);

createZip([
  { name: 'layout/theme.liquid', data: '<html></html>' },
  { name: 'config/settings_schema.json', data: '[]' },
  { name: 'templates/index.liquid', data: '<main></main>' },
  { name: 'config/settings_data.json', data: settingsWithCdn }
], tmpCdnZip);

try {
  const cdnScan = scanSettingsDataForThemeCdnUrls(tmpCdnZip);
  check('cdn scan: detects hardcoded theme-specific CDN URLs',
    cdnScan.count === 2);
  check('cdn scan: captures key paths of detected URLs',
    cdnScan.keys.includes('current.logo') && cdnScan.keys.includes('current.banner'));

  // Test clean zip
  const cleanZip = path.join(KIT_ROOT, 'test', '_tmp-clean-scan.zip');
  createZip([
    { name: 'layout/theme.liquid', data: '<html></html>' },
    { name: 'config/settings_data.json', data: JSON.stringify({ current: { logo: 'logo.png' } }) }
  ], cleanZip);
  const cleanScan = scanSettingsDataForThemeCdnUrls(cleanZip);
  check('cdn scan: clean settings returns zero count',
    cleanScan.count === 0 && cleanScan.keys.length === 0);
  try { fs.unlinkSync(cleanZip); } catch (_) {}

  // Test workflow_final_guard surfaces portability as a warning without failing
  const guardCdnRoot = path.join(KIT_ROOT, 'test', '_tmp-guard-cdn-root');
  const guardCdnOut = path.join(guardCdnRoot, 'final-showcase');
  fs.mkdirSync(path.join(guardCdnRoot, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(guardCdnRoot, 'config'), { recursive: true });
  fs.mkdirSync(path.join(guardCdnRoot, 'deliverables'), { recursive: true });
  fs.mkdirSync(guardCdnOut, { recursive: true });

  fs.writeFileSync(path.join(guardCdnRoot, 'layout', 'theme.liquid'), '<html></html>');
  fs.writeFileSync(path.join(guardCdnRoot, 'config', 'settings_schema.json'), '[]');
  fs.writeFileSync(path.join(guardCdnRoot, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'), '| Phase | Status |\n|---|---|\n| Preview QA | completed |\n| Final evidence | completed |\n');

  // Copy valid artifacts into final-showcase
  const passFixture = path.join(KIT_ROOT, 'test', '_tmp-final-guard-pass', 'final-showcase');
  if (fs.existsSync(passFixture)) {
    for (const f of fs.readdirSync(passFixture)) {
      if (f.endsWith('.png') || f.endsWith('.html')) {
        fs.copyFileSync(path.join(passFixture, f), path.join(guardCdnOut, f));
      }
    }
  } else {
    function pngChunk(type, data) {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const name = Buffer.from(type, 'ascii');
      const crc = Buffer.alloc(4);
      return Buffer.concat([len, name, data, crc]);
    }
    function makeTestPng(width, height) {
      const channels = 4;
      const stride = width * channels;
      const raw = Buffer.alloc((stride + 1) * height);
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8;
      ihdr[9] = 6;
      const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const idat = zlib.deflateSync(raw);
      return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
    }
    fs.writeFileSync(path.join(guardCdnOut, 'Trang chủ.png'), makeTestPng(876, 2000));
    fs.writeFileSync(path.join(guardCdnOut, 'Trang chủ-mobile.png'), makeTestPng(276, 480));
    fs.writeFileSync(path.join(guardCdnOut, 'Trang chủ-fullpage.png'), makeTestPng(1200, 2400));
    fs.writeFileSync(path.join(guardCdnOut, 'Trang chủ-mobile-fullpage.png'), makeTestPng(375, 1400));
    fs.writeFileSync(path.join(guardCdnOut, 'THEME_DESCRIPTION.html'), '<h1>Theme Title</h1><p>Mô tả giao diện này được soạn thảo chi tiết và đầy đủ để vượt qua kiểm định độ dài của final guard. Đoạn văn này cung cấp thông tin cho merchant về tính năng và bố cục.</p><ul><li>Đặc điểm nổi bật một</li><li>Đặc điểm nổi bật hai</li></ul><p>Phần mô tả bổ sung để đảm bảo tổng số ký tự lớn hơn hai trăm theo quy chuẩn.</p>');
  }

  // Put zip with CDN URLs in final-showcase
  fs.copyFileSync(tmpCdnZip, path.join(guardCdnOut, 'Haravan-Demo-Theme-v20261014-1200.zip'));

  const guardCdnRun = runScript('workflow_final_guard.js', [
    '--root', guardCdnRoot,
    '--out', guardCdnOut,
    '--require-zip'
  ]);

  check('guard: surfaces portability warning on theme-specific CDN URLs',
    /portability: config\/settings_data\.json/.test(guardCdnRun.stderr + guardCdnRun.stdout),
    guardCdnRun.stderr);

  check('guard: portability warning is non-fatal (passes overall if other checks pass)',
    guardCdnRun.status === 0 || !/FAIL: final guard blocked handoff/.test(guardCdnRun.stderr));

  try { fs.rmSync(guardCdnRoot, { recursive: true, force: true }); } catch (_) {}
} finally {
  try { fs.unlinkSync(tmpCdnZip); } catch (_) {}
}

console.log(`\n==========================================`);
console.log(`${passed} passed, ${failed} failed`);
console.log(`==========================================`);
if (failed > 0) process.exit(1);
