'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.resolve(__dirname, '..');
const { createZip, listZipEntries, readZipEntriesWithData } = require('../lib/zip');
const { sanitizeZipThemeLiquid } = require('../final_theme_export');

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (!ok && detail ? ` :: ${detail}` : ''));
  ok ? passed++ : failed++;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'unicode-path-'));
const THEME = path.join(TMP, 'Ăn Vặt');
const OUT = path.join(THEME, 'final-showcase');

const HOT_RELOAD_BLOCK = '<script>(function(){if(window.__hrvHotReload)return;window.__hrvHotReload=1;var ws=new WebSocket("ws://127.0.0.1:35729");})();</script>';
const DIRTY_LAYOUT = `<html>\n{% comment %}hrv-hot-reload{% endcomment %}\n${HOT_RELOAD_BLOCK}\n<body>{{ content_for_layout }}</body>\n</html>\n`;
const CSS_BYTES = Buffer.from('.a{color:#c8102e}\n', 'utf8');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeTheme() {
  write(path.join(THEME, 'layout', 'theme.liquid'), DIRTY_LAYOUT);
  write(path.join(THEME, 'config', 'settings_schema.json'), '[]\n');
  write(path.join(THEME, 'config', 'settings_data.json'), '{}\n');
  write(path.join(THEME, 'templates', 'index.liquid'), '<main>Trang chủ</main>\n');
  write(path.join(THEME, 'assets', 'theme.css'), CSS_BYTES);
}

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(KIT_ROOT, script), ...args], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function entryText(zipPath, name) {
  const entry = readZipEntriesWithData(zipPath).find((item) => item.name === name);
  return entry ? entry.data.toString('utf8') : null;
}

function dirtyZip(file) {
  createZip([
    { name: 'layout/theme.liquid', data: DIRTY_LAYOUT },
    { name: 'config/settings_schema.json', data: '[]\n' },
    { name: 'templates/index.liquid', data: '<main>Trang chủ</main>\n' },
    { name: 'assets/theme.css', data: CSS_BYTES }
  ], file);
}

try {
  writeTheme();

  const sanitized = run('sanitize_theme_liquid.js', ['--root', THEME]);
  const layoutAfter = fs.readFileSync(path.join(THEME, 'layout', 'theme.liquid'), 'utf8');
  check('sanitize: a theme folder named "Ăn Vặt" is cleaned', sanitized.status === 0 && !/__hrvHotReload|hrv-hot-reload/.test(layoutAfter) && layoutAfter.includes('content_for_layout'), sanitized.out);
  const again = run('sanitize_theme_liquid.js', ['--root', THEME]);
  check('sanitize: a second run on the clean layout reports no marker and exits 0', again.status === 0 && /no hot-reload marker/.test(again.out), again.out);

  writeTheme();
  const packageOut = path.join(THEME, 'scratch', 'preview');
  const packaged = run('theme_package.js', ['--root', THEME, '--out', packageOut]);
  const packagedZip = path.join(packageOut, 'theme-preview.zip');
  check('package: a theme folder named "Ăn Vặt" builds a zip', packaged.status === 0 && fs.existsSync(packagedZip) && listZipEntries(packagedZip).includes('layout/theme.liquid'), packaged.out);

  const exported = run('final_theme_export.js', ['--root', THEME, '--local', '--out', OUT, '--file', 'handoff-local.zip']);
  const localZip = path.join(OUT, 'handoff-local.zip');
  check('export: --local succeeds for a theme folder named "Ăn Vặt"', exported.status === 0 && fs.existsSync(localZip), exported.out);
  check('export: the local zip lists the theme members', fs.existsSync(localZip) && ['layout/theme.liquid', 'config/settings_schema.json', 'templates/index.liquid', 'assets/theme.css'].every((name) => listZipEntries(localZip).includes(name)));

  const fromZip = path.join(THEME, 'Theme-16_10_2026.zip');
  dirtyZip(fromZip);
  const fromZipRun = run('final_theme_export.js', ['--root', THEME, '--from-zip', fromZip, '--out', OUT, '--file', 'handoff-from-zip.zip']);
  const handoff = path.join(OUT, 'handoff-from-zip.zip');
  check('export: --from-zip under "Ăn Vặt" exits 0 and reports the strip', fromZipRun.status === 0 && /hot-reload: stripped from layout\/theme\.liquid/.test(fromZipRun.out), fromZipRun.out);
  const handoffLayout = fs.existsSync(handoff) ? entryText(handoff, 'layout/theme.liquid') : null;
  check('export: the hot-reload block is gone from the handoff zip', handoffLayout !== null && !/__hrvHotReload|hrv-hot-reload/.test(handoffLayout) && handoffLayout.includes('content_for_layout'));
  const handoffEntries = fs.existsSync(handoff) ? readZipEntriesWithData(handoff) : [];
  const byName = (name) => handoffEntries.find((item) => item.name === name);
  check('export: every other entry is byte-identical', byName('assets/theme.css') && byName('assets/theme.css').data.equals(CSS_BYTES) && byName('config/settings_schema.json') && byName('config/settings_schema.json').data.toString('utf8') === '[]\n' && byName('templates/index.liquid') && byName('templates/index.liquid').data.toString('utf8') === '<main>Trang chủ</main>\n');
  check('export: the entry count is unchanged', handoffEntries.length === 4, String(handoffEntries.length));

  const cleanZip = path.join(THEME, 'clean-input.zip');
  createZip([{ name: 'layout/theme.liquid', data: '<html></html>\n' }, { name: 'config/settings.html', data: '<fieldset></fieldset>' }], cleanZip);
  const cleanBefore = fs.readFileSync(cleanZip);
  const rewritten = sanitizeZipThemeLiquid(cleanZip);
  check('export: a zip without the block is left untouched', rewritten === false && fs.readFileSync(cleanZip).equals(cleanBefore));
  const dirtyDirect = path.join(THEME, 'dirty-direct.zip');
  dirtyZip(dirtyDirect);
  check('export: sanitizeZipThemeLiquid rewrites a non-ASCII path in process', sanitizeZipThemeLiquid(dirtyDirect) === true && !/__hrvHotReload/.test(entryText(dirtyDirect, 'layout/theme.liquid')));

  const exportSource = fs.readFileSync(path.join(KIT_ROOT, 'final_theme_export.js'), 'utf8');
  check('export: no PowerShell script embeds the zip path', !/powershell/i.test(exportSource) && !/\.ps1/.test(exportSource));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\nPASS ${passed}`);
console.log(`FAIL ${failed}`);
process.exit(failed ? 1 : 0);
