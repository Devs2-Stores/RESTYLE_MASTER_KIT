'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.resolve(__dirname, '..');
const settingsMerge = require('../settings_merge');
const settingsAudit = require('../lib/settings-audit');
const preflight = require('../run_preflight');
const { runHaravanLint } = require('../haravan_lint');

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (!ok && detail ? ` :: ${detail}` : ''));
  ok ? passed++ : failed++;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-protocol-'));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
};
const read = (file) => fs.readFileSync(file, 'utf8');

async function quiet(fn) {
  const { log, warn, error } = console;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
}

async function rejection(fn) {
  try {
    await quiet(fn);
  } catch (error) {
    return error;
  }
  return null;
}

function runKit(script, args) {
  const result = spawnSync(process.execPath, [path.join(KIT_ROOT, script), ...args], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}`, stdout: result.stdout };
}

const SCHEMA = [
  {
    name: 'Hero',
    settings: [
      { type: 'text', id: 'hero_title', label: 'Title', default: 'Hi' },
      { type: 'text', id: 'hero_sub', label: 'Sub', default: 'Sub' },
      { type: 'text', id: 'hero_cta', label: 'Cta', default: 'Go' }
    ]
  }
];

function writeMergeTheme(name) {
  const root = path.join(TMP, name);
  write(path.join(root, 'config', 'settings_schema.json'), JSON.stringify(SCHEMA, null, 2));
  write(path.join(root, 'config', 'settings_data.json'), JSON.stringify({
    current: { hero_title: 'Hi', hero_sub: 'Sub', hero_cta: 'Go' },
    presets: { Default: {} }
  }, null, 2));
  write(path.join(root, 'layout', 'theme.liquid'), '<html>{{ settings.hero_title }}{{ settings.hero_sub }}{{ settings.hero_cta }}</html>');
  return { root, dataPath: path.join(root, 'config', 'settings_data.json') };
}

async function main() {
  console.log('\n## single-key merge');
  const single = writeMergeTheme('single-key');
  const seed = read(single.dataPath);
  const keysBefore = settingsMerge.dataKeyPaths(JSON.parse(seed)).size;

  const dry = await quiet(() => settingsMerge.runSettingsMerge({ root: single.root, key: 'hero_title', value: 'Xin chào', skipAudit: true }));
  check('single-key: without a write flag it is a dry run that leaves the file untouched', dry.dryRun === true && read(single.dataPath) === seed);

  const written = await quiet(() => settingsMerge.runSettingsMerge({
    root: single.root, key: 'hero_title', value: 'Xin chào', writeData: true, allowSettingsData: true, skipAudit: true
  }));
  const after = JSON.parse(read(single.dataPath));
  check('single-key: sets exactly the requested key', after.current.hero_title === 'Xin chào' && after.current.hero_sub === 'Sub' && after.current.hero_cta === 'Go');
  check('single-key: the key count is unchanged and nothing is reported removed', settingsMerge.dataKeyPaths(after).size === keysBefore && written.keyLoss.removed.length === 0 && written.keyLoss.before === written.keyLoss.after);
  check('single-key: structural presets survive', after.presets !== undefined);

  const withObject = await quiet(() => settingsMerge.runSettingsMerge({
    root: single.root, key: 'hero_cta', value: { label: 'Go', href: '/collections/all' }, writeData: true, allowSettingsData: true, skipAudit: true
  }));
  check('single-key: accepts any JSON value', withObject.ok === true && JSON.parse(read(single.dataPath)).current.hero_cta.href === '/collections/all');

  const keyAndManifest = await rejection(() => settingsMerge.runSettingsMerge({ root: single.root, key: 'a', value: 1, manifest: path.join(TMP, 'x.json'), skipAudit: true }));
  check('single-key: --key with --manifest is a usage error', keyAndManifest !== null && keyAndManifest.exitCode === 2 && /mutually exclusive/.test(keyAndManifest.message));
  const noValue = await rejection(() => settingsMerge.runSettingsMerge({ root: single.root, key: 'a', skipAudit: true }));
  check('single-key: --key without --value is a usage error', noValue !== null && noValue.exitCode === 2 && /--value/.test(noValue.message));
  const schemaWrite = await rejection(() => settingsMerge.runSettingsMerge({ root: single.root, key: 'a', value: 1, writeSchema: true, skipAudit: true }));
  check('single-key: never writes the schema', schemaWrite !== null && /never writes settings_schema/.test(schemaWrite.message));

  const parsed = settingsMerge.parseArgs(['node', 'settings_merge.js', '--key', 'hero_title', '--value', '"Xin chào"', '--max-key-loss', '3']);
  check('single-key: CLI parses --key, --value and --max-key-loss', parsed.key === 'hero_title' && parsed.value === 'Xin chào' && parsed.maxKeyLoss === 3);
  let badValue = null;
  try { settingsMerge.parseArgs(['node', 'settings_merge.js', '--key', 'a', '--value', '{nope']); } catch (error) { badValue = error; }
  check('single-key: a non-JSON --value is rejected', badValue !== null && /valid JSON/.test(badValue.message));
  let badLimit = null;
  try { settingsMerge.parseArgs(['node', 'settings_merge.js', '--max-key-loss', '-1']); } catch (error) { badLimit = error; }
  check('single-key: --max-key-loss must be a non-negative integer', badLimit !== null && /non-negative integer/.test(badLimit.message));

  console.log('\n## key-loss gate');
  const loss = writeMergeTheme('key-loss');
  const lossSeed = read(loss.dataPath);
  const removeManifest = path.join(TMP, 'remove-manifest.json');
  write(removeManifest, JSON.stringify({ patches: [{ layer: 'slice:S1', schema_remove: ['hero_sub', 'hero_cta'] }] }));
  const base = { root: loss.root, manifest: removeManifest, allowSchemaRemove: true, skipAudit: true };

  const blocked = await rejection(() => settingsMerge.runSettingsMerge({ ...base, writeData: true, allowSettingsData: true }));
  check('key-loss: a write that removes keys aborts with the default limit of 0', blocked !== null && /key-loss gate/.test(blocked.message) && /hero_sub/.test(blocked.message), blocked && blocked.message);
  check('key-loss: the aborted write leaves settings_data.json byte-identical', read(loss.dataPath) === lossSeed);
  const tooLow = await rejection(() => settingsMerge.runSettingsMerge({ ...base, writeData: true, allowSettingsData: true, maxKeyLoss: 1 }));
  check('key-loss: removing more keys than --max-key-loss aborts', tooLow !== null && /key-loss gate/.test(tooLow.message) && read(loss.dataPath) === lossSeed);

  const lossDry = await quiet(() => settingsMerge.runSettingsMerge(base));
  check('key-loss: a dry run reports the blocked removal without writing', lossDry.keyLoss.blocked === true && lossDry.keyLoss.removed.length === 2 && lossDry.diffReport.some((line) => /key-loss gate would abort/.test(line)) && read(loss.dataPath) === lossSeed);

  await quiet(() => settingsMerge.runSettingsMerge({ ...base, writeData: true, allowSettingsData: true, maxKeyLoss: 2 }));
  const afterLoss = JSON.parse(read(loss.dataPath));
  check('key-loss: the exact allowance lets the intended removal through', afterLoss.current.hero_sub === undefined && afterLoss.current.hero_cta === undefined && afterLoss.current.hero_title === 'Hi');

  console.log('\n## backup-sourced manifests');
  const backupDir = path.join(TMP, 'settings-backups', '2026-10-15');
  const backupManifest = path.join(backupDir, 'manifest.json');
  write(backupManifest, JSON.stringify({ patches: [{ layer: 'slice:S1', data_set: { hero_title: 'Old' } }] }));
  const refusedManifest = await rejection(() => settingsMerge.runSettingsMerge({ root: single.root, manifest: backupManifest, skipAudit: true }));
  check('backup: a manifest under a backup directory is refused', refusedManifest !== null && /backup/.test(refusedManifest.message));

  const goodManifest = path.join(TMP, 'patches', 'manifest.json');
  write(path.join(TMP, 'patches', 'D1-old.json'), '{}');
  write(goodManifest, JSON.stringify(['D1-old.json']));
  const stalePatch = path.join(backupDir, 'D1-stale.json');
  write(stalePatch, JSON.stringify({ layer: 'data-cleanup:D1', data_set: { hero_title: 'Old' } }));
  const linkingManifest = path.join(TMP, 'patches', 'links-stale.json');
  write(linkingManifest, JSON.stringify([path.relative(path.dirname(linkingManifest), stalePatch)]));
  const refusedPatch = await rejection(() => settingsMerge.runSettingsMerge({ root: single.root, manifest: linkingManifest, skipAudit: true }));
  check('backup: a patch file resolved from a backup directory is refused', refusedPatch !== null && /patch file at manifest\[0\]/.test(refusedPatch.message));

  const sourceManifest = path.join(TMP, 'patches', 'source-declared.json');
  write(sourceManifest, JSON.stringify({ source: path.relative(path.dirname(sourceManifest), backupDir), patches: [{ layer: 'slice:S1', data_set: { hero_title: 'x' } }] }));
  const refusedSource = await rejection(() => settingsMerge.runSettingsMerge({ root: single.root, manifest: sourceManifest, skipAudit: true }));
  check('backup: a manifest declaring a backup source is refused', refusedSource !== null && /manifest source/.test(refusedSource.message));

  const accepted = await quiet(() => settingsMerge.runSettingsMerge({ root: single.root, manifest: goodManifest, skipAudit: true }));
  check('backup: a manifest outside any backup directory still merges', accepted.ok === true);

  const cliRefused = runKit('settings_merge.js', ['--root', single.root, '--manifest', backupManifest, '--dry-run']);
  check('backup: the CLI exits non-zero and names the backup directory', cliRefused.status !== 0 && /backup/.test(cliRefused.out));
  const cliBoth = runKit('settings_merge.js', ['--root', single.root, '--key', 'hero_title', '--value', '"x"', '--manifest', goodManifest]);
  check('backup: the CLI exits 2 for --key together with --manifest', cliBoth.status === 2);
  const cliKey = runKit('settings_merge.js', ['--root', single.root, '--key', 'hero_title', '--value', '"CLI"', '--skip-audit']);
  check('backup: the CLI single-key dry run exits 0 and prints the key', cliKey.status === 0 && /Key: hero_title/.test(cliKey.out) && /DRY-RUN/.test(cliKey.out), cliKey.out);

  console.log('\n## settings mode (legacy settings.html)');
  const legacyRoot = path.join(TMP, 'legacy-theme');
  write(path.join(legacyRoot, 'config', 'settings_schema.json'), '[]\r\n');
  write(path.join(legacyRoot, 'config', 'settings.html'), '<fieldset><input name="hero_title" value="Hi"></fieldset>');
  write(path.join(legacyRoot, 'config', 'settings_data.json'), '{}');
  write(path.join(legacyRoot, 'layout', 'theme.liquid'), '<html><body><h1>{{ settings.hero_title }}</h1></body></html>');
  check('legacy: the placeholder schema is 4 bytes', fs.statSync(path.join(legacyRoot, 'config', 'settings_schema.json')).size === 4);

  const legacyAudit = settingsAudit.runSettingsSchemaAudit(legacyRoot, { settingsMode: 'legacy' });
  check('legacy: --settings-mode legacy audits settings.html and passes', legacyAudit.errors.length === 0 && legacyAudit.status === 0 && legacyAudit.summary.settingsMode === 'legacy', JSON.stringify(legacyAudit.errors));
  const schemaAudit = settingsAudit.runSettingsSchemaAudit(legacyRoot, { settingsMode: 'schema' });
  check('legacy: the same theme fails under --settings-mode schema', schemaAudit.errors.length > 0 && schemaAudit.errors.some((e) => e.rule === 'missing-setting'), JSON.stringify(schemaAudit.errors));

  const brokenLegacy = path.join(TMP, 'legacy-broken');
  write(path.join(brokenLegacy, 'config', 'settings_schema.json'), '[]\r\n');
  write(path.join(brokenLegacy, 'config', 'settings.html'), '<fieldset><input name="hero_title"></fieldset>');
  write(path.join(brokenLegacy, 'layout', 'theme.liquid'), '<html>{{ settings.hero_subtitle }}</html>');
  const brokenAudit = settingsAudit.runSettingsSchemaAudit(brokenLegacy, { settingsMode: 'legacy' });
  check('legacy: a settings.X reference without a settings.html control is an error', brokenAudit.errors.some((e) => e.rule === 'missing-setting' && e.id === 'hero_subtitle'));
  const noHtml = path.join(TMP, 'legacy-no-html');
  write(path.join(noHtml, 'config', 'settings_schema.json'), '[]\r\n');
  write(path.join(noHtml, 'layout', 'theme.liquid'), '<html></html>');
  check('legacy: a missing settings.html is an error', settingsAudit.runSettingsSchemaAudit(noHtml, { settingsMode: 'legacy' }).errors.some((e) => e.rule === 'missing-file'));

  write(path.join(legacyRoot, '.workspace-context.json'), JSON.stringify({ settingsMode: 'legacy' }));
  check('legacy: auto reads settingsMode from .workspace-context.json', settingsAudit.resolveSettingsMode(legacyRoot, 'auto').mode === 'legacy' && settingsAudit.runSettingsSchemaAudit(legacyRoot).errors.length === 0);
  check('legacy: an explicit flag wins over .workspace-context.json', settingsAudit.resolveSettingsMode(legacyRoot, 'schema').mode === 'schema');
  const parentContext = path.join(TMP, 'ctx-parent');
  write(path.join(parentContext, '.workspace-context.json'), JSON.stringify({ settingsMode: 'legacy' }));
  fs.mkdirSync(path.join(parentContext, 'nested', 'theme'), { recursive: true });
  check('legacy: auto finds the context file in a parent directory', settingsAudit.resolveSettingsMode(path.join(parentContext, 'nested', 'theme'), 'auto').mode === 'legacy');
  check('legacy: auto defaults to schema without a context file', settingsAudit.resolveSettingsMode(path.join(TMP, 'single-key'), 'auto').mode === 'schema');
  let invalidMode = null;
  try { settingsAudit.resolveSettingsMode(legacyRoot, 'bogus'); } catch (error) { invalidMode = error; }
  check('legacy: an unknown mode is rejected', invalidMode !== null && /Invalid settings mode/.test(invalidMode.message));

  const lintLegacy = runHaravanLint(legacyRoot, { settingsMode: 'legacy' });
  check('legacy: haravan_lint --settings-mode legacy reports no settings finding', !lintLegacy.some((f) => f.rule === 'missing-setting' || f.rule === 'schema-json'), JSON.stringify(lintLegacy.map((f) => f.rule)));
  const lintBroken = runHaravanLint(brokenLegacy, { settingsMode: 'legacy' });
  check('legacy: haravan_lint legacy mode blocks a reference with no settings.html control', lintBroken.some((f) => f.rule === 'missing-setting' && f.severity === 'blocker'));
  const lintSchema = runHaravanLint(legacyRoot, { settingsMode: 'schema' });
  check('legacy: haravan_lint --settings-mode schema fails the same theme', lintSchema.some((f) => f.rule === 'missing-setting' && f.severity === 'blocker'), JSON.stringify(lintSchema.map((f) => f.rule)));
  const lintCli = runKit('haravan_lint.js', ['--root', legacyRoot, '--settings-mode', 'legacy', '--json']);
  let lintCliJson = null;
  try { lintCliJson = JSON.parse(lintCli.stdout); } catch (_) {}
  check('legacy: the haravan_lint CLI forwards --settings-mode', lintCliJson !== null && !lintCliJson.findings.some((f) => f.rule === 'missing-setting'), lintCli.out.slice(0, 300));
  const lintBadMode = runKit('haravan_lint.js', ['--root', legacyRoot, '--settings-mode', 'nope']);
  check('legacy: the haravan_lint CLI rejects an unknown mode', lintBadMode.status !== 0 && /Invalid settings mode/.test(lintBadMode.out));

  console.log('\n## preflight keys and thresholds');
  check('preflight: only the keys the pipeline uses are tracked', JSON.stringify(preflight.TRACKED_KEYS) === JSON.stringify(['STITCH_API_KEY', 'AIBOX_API_KEY']), JSON.stringify(preflight.TRACKED_KEYS));
  const thresholds = JSON.parse(read(path.join(KIT_ROOT, 'registry', 'thresholds.json')));
  check('thresholds: the two flat keys are unchanged', thresholds.minTextPx === 12 && thresholds.minTapHitPx === 24 && !('minControlPx' in thresholds) && !('tapSpacingCirclePx' in thresholds));
  check('thresholds: mobileDensity carries two positive numbers', thresholds.mobileDensity && Number.isFinite(thresholds.mobileDensity.maxSectionSpacePx) && thresholds.mobileDensity.maxSectionSpacePx > 0 && Number.isFinite(thresholds.mobileDensity.minCardsVisible375) && thresholds.mobileDensity.minCardsVisible375 > 0);
}

main()
  .catch((error) => {
    console.log(`FAIL unexpected error :: ${error.stack || error.message}`);
    failed += 1;
  })
  .finally(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\nPASS ${passed}`);
    console.log(`FAIL ${failed}`);
    process.exit(failed ? 1 : 0);
  });
