#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const registry = require('../lib/registry');
const { runHaravanLint } = require('../haravan_lint');
const { runSettingsSchemaAudit } = require('../lib/settings-audit');

const KIT = path.resolve(__dirname, '..');
const STRICT_ALL = process.argv.includes('--all');
let failures = 0;
let passes = 0;

function check(label, ok) {
  if (ok) {
    passes += 1;
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}`);
  }
}

function throwsWith(fn, pattern) {
  try {
    fn();
  } catch (err) {
    return pattern.test(String(err.message));
  }
  return false;
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  return file;
}

console.log('\n## registry loader');

const entries = registry.readRegistry();
const slugs = entries.map((e) => e.slug);
check('registry has 32 distinct slugs', entries.length === 32 && new Set(slugs).size === 32);
check('every tier is blocker or warn', entries.every((e) => registry.TIERS.includes(e.tier)));
check('every entry has exactly one registered gate', entries.every((e) => registry.GATES.includes(e.gate)));
check('every entry names a distinct bad and good fixture', entries.every((e) => e.fixtures.bad && e.fixtures.good && e.fixtures.bad !== e.fixtures.good));

const probeEntry = {
  slug: 'sample-class', tier: 'warn', gate: 'lint', staticRule: 'LIQUID_SAMPLE', runtimeProbe: null,
  rule: 'sample', fixtures: { bad: 'bad', good: 'good' }, origin: 'unit test'
};
const scratch = tmpDir('registry-loader');
fs.mkdirSync(path.join(scratch, 'bad'));
fs.mkdirSync(path.join(scratch, 'good'));
check('loader accepts a consistent registry', registry.loadRegistry({ file: writeJson(scratch, 'ok.json', [probeEntry]), kitRoot: scratch }).length === 1);
check('loader throws on a duplicate slug',
  throwsWith(() => registry.loadRegistry({ file: writeJson(scratch, 'dup.json', [probeEntry, { ...probeEntry }]), kitRoot: scratch }), /duplicate slug: sample-class/));
check('loader throws on a bad tier',
  throwsWith(() => registry.loadRegistry({ file: writeJson(scratch, 'tier.json', [{ ...probeEntry, tier: 'info' }]), kitRoot: scratch }), /tier must be one of/));
check('loader throws when two gates are given',
  throwsWith(() => registry.loadRegistry({ file: writeJson(scratch, 'gate.json', [{ ...probeEntry, gate: ['lint', 'probe'] }]), kitRoot: scratch }), /exactly one gate/));
check('loader throws when no gate is given',
  throwsWith(() => registry.loadRegistry({ file: writeJson(scratch, 'nogate.json', [{ ...probeEntry, gate: undefined }]), kitRoot: scratch }), /exactly one gate/));
check('loader throws on a missing fixture path',
  throwsWith(() => registry.loadRegistry({ file: writeJson(scratch, 'fx.json', [{ ...probeEntry, fixtures: { bad: 'bad', good: 'absent-dir' } }]), kitRoot: scratch }), /fixtures missing[\s\S]*absent-dir/));
check('loader throws on unreadable JSON',
  throwsWith(() => registry.readRegistry({ file: path.join(scratch, 'does-not-exist.json') }), /unreadable/));

console.log('\n## thresholds');

const thresholds = registry.loadThresholds();
check('thresholds carry the two keys from the registry file',
  thresholds.minTextPx === 12 && thresholds.minTapHitPx === 24 && Object.keys(thresholds).length === 2);
check('contract typeScale overrides one key',
  registry.loadThresholds({ contract: { designDefaults: { typeScale: { minTextPx: 14 } } } }).minTextPx === 14);
check('unknown contract typeScale key throws',
  throwsWith(() => registry.loadThresholds({ contract: { designDefaults: { typeScale: { minLeading: 3 } } } }), /not a known threshold/));
check('missing threshold key throws (no code default)',
  throwsWith(() => registry.loadThresholds({ file: writeJson(scratch, 'th.json', { minTextPx: 12 }) }), /minTapHitPx/));

console.log('\n## lint fixtures: each lint slug flags bad and passes good');

function lintFixture(slug, side, options) {
  return runHaravanLint(path.join(KIT, 'test', 'fixtures', 'registry', slug, side), options);
}

const lintEntries = entries.filter((e) => e.gate === 'lint');
for (const entry of lintEntries) {
  const ids = registry.ruleIdsOf(entry);
  const bad = lintFixture(entry.slug, 'bad');
  for (const id of ids) {
    check(`${entry.slug}: bad fixture is flagged by ${id}`, bad.some((f) => f.rule === id));
  }
  const good = lintFixture(entry.slug, 'good');
  check(`${entry.slug}: good fixture has 0 findings of ${ids.join('+')}`, !good.some((f) => ids.includes(f.rule)));
  check(`${entry.slug}: good fixture has 0 blockers`, good.every((f) => f.severity !== 'blocker'));
  check(`${entry.slug}: findings carry the registry tier`, bad.filter((f) => ids.includes(f.rule)).every((f) => f.severity === entry.tier));
}

console.log('\n## lint rule precision');

const byRule = (findings, rule) => findings.filter((f) => f.rule === rule);
const fileOf = (f) => f.location.split(':')[0].replace(/\\/g, '/');

const globalBad = byRule(lintFixture('include-global-fallback', 'bad'), 'LIQUID_INCLUDE_GLOBAL_FALLBACK');
check('include-global-fallback: the iter0 product-card copy is flagged', globalBad.some((f) => fileOf(f) === 'snippets/product-card.liquid'));
check('include-global-fallback: default-global and else-branch forms are flagged', globalBad.filter((f) => fileOf(f) === 'snippets/featured-card.liquid').length === 2);

check('include-scope-leak: only the leaked read is flagged',
  byRule(lintFixture('include-scope-leak', 'bad'), 'LIQUID_INCLUDE_SCOPE_LEAK').length === 1);

check('scheme-before-img-url: both non-absolute sites flagged',
  byRule(lintFixture('scheme-before-img-url', 'bad'), 'LIQUID_SCHEME_BEFORE_IMG_URL').length === 2);
check('scheme-before-img-url: og:*, itemprop url and ld+json contexts are exempt',
  byRule(lintFixture('scheme-before-img-url', 'good'), 'LIQUID_SCHEME_BEFORE_IMG_URL').length === 0);

const textBad = lintFixture('hardcoded-visible-text', 'bad');
check('hardcoded-visible-text: literal size-guide table flagged', textBad.some((f) => f.rule === 'LIQUID_HARDCODED_VISIBLE_TEXT' && /Literal data table/.test(f.message)));
check('hardcoded-visible-text: aria-label, title and placeholder literals flagged',
  ['aria-label', 'title', 'placeholder'].every((attr) => textBad.some((f) => f.rule === 'LIQUID_HARDCODED_VISIBLE_TEXT' && f.message.includes(`Hardcoded ${attr}`))));
check('hardcoded-visible-text: ThemeUtils.t fallback and Vietnamese JS literal flagged',
  byRule(textBad, 'JS_HARDCODED_VISIBLE_TEXT').length === 2);

check('utc-date-idiom: slice(0,10) and split T both flagged', byRule(lintFixture('utc-date-idiom', 'bad'), 'JS_UTC_DATE_IDIOM').length === 2);
check('root-font-shrink: 62.5% and 12px flagged, contract 14px allowed',
  byRule(lintFixture('root-font-shrink', 'bad'), 'CSS_ROOT_FONT_SHRINK').length === 2
  && byRule(lintFixture('root-font-shrink', 'good'), 'CSS_ROOT_FONT_SHRINK').length === 0);
check('root-font-shrink: without a contract mobileRootFontPx the 14px root is flagged',
  byRule(lintFixture('root-font-shrink', 'good', { contract: { designDefaults: {} } }), 'CSS_ROOT_FONT_SHRINK').length === 1);
check('font-below-min: px, rem and var() forms flagged',
  byRule(lintFixture('font-below-min', 'bad'), 'CSS_FONT_BELOW_MIN').length === 3);
check('font-below-min: contract typeScale lowers the minimum',
  byRule(lintFixture('font-below-min', 'bad', { contract: { designDefaults: { mobileRootFontPx: 14, typeScale: { minTextPx: 8 } } } }), 'CSS_FONT_BELOW_MIN').length === 0);
check('undeclared-css-var: both undeclared variables flagged', byRule(lintFixture('undeclared-css-var', 'bad'), 'CSS_UNDECLARED_VAR').length === 2);
check('icon-stroke-mismatch: only the minority stroke is flagged', byRule(lintFixture('icon-stroke-mismatch', 'bad'), 'SVG_ICON_STROKE_MISMATCH').length === 1);
check('overlay-viewport-cap: unbounded card and drawer flagged', byRule(lintFixture('overlay-viewport-cap', 'bad'), 'CSS_OVERLAY_NO_VIEWPORT_CAP').length === 2);
check('trigger-without-gated-modal: only the ungated trigger is flagged', byRule(lintFixture('trigger-without-gated-modal', 'bad'), 'LIQUID_TRIGGER_WITHOUT_GATE').length === 1);

console.log('\n## lint input and waivers');

const emptyRoot = tmpDir('lint-empty');
const emptyFindings = runHaravanLint(emptyRoot);
check('lint on an empty directory reports LINT_NO_INPUT as a blocker', emptyFindings.some((f) => f.rule === 'LINT_NO_INPUT' && f.severity === 'blocker'));
const cli = spawnSync(process.execPath, [path.join(KIT, 'haravan_lint.js'), '--root', emptyRoot], { encoding: 'utf8' });
check('lint CLI exits 1 on an empty directory', cli.status === 1);

const snapRoot = tmpDir('lint-snap');
fs.mkdirSync(path.join(snapRoot, 'snippets'), { recursive: true });
fs.writeFileSync(path.join(snapRoot, 'snippets', 'stub.liquid'), '<p>{{ shop.name | escape }}</p>\n', 'utf8');
const snapDir = path.join(snapRoot, 'deliverables', 'loop', 'snap', 'iter0', 'snippets');
fs.mkdirSync(snapDir, { recursive: true });
fs.copyFileSync(path.join(KIT, 'test', 'fixtures', 'registry', 'include-global-fallback', 'bad', 'snippets', 'product-card.liquid'), path.join(snapDir, 'product-card.liquid'));
check('a bad file under deliverables/**/snap is not walked',
  !runHaravanLint(snapRoot).some((f) => f.rule === 'LIQUID_INCLUDE_GLOBAL_FALLBACK'));

const utcBad = path.join(KIT, 'test', 'fixtures', 'registry', 'utc-date-idiom', 'bad');
const waived = runHaravanLint(utcBad, { waivers: [{ rule: 'utc-date-idiom', reason: 'legacy booking widget, tracked separately' }] });
check('a waiver removes the finding and lists it', byRule(waived, 'JS_UTC_DATE_IDIOM').length === 0 && waived.waived.length === 2 && waived.waived[0].rule === 'utc-date-idiom');
check('a waiver for another slug leaves the finding',
  byRule(runHaravanLint(utcBad, { waivers: [{ rule: 'font-below-min', reason: 'unrelated waiver entry' }] }), 'JS_UTC_DATE_IDIOM').length === 2);
check('a waiver with an unknown slug throws', throwsWith(() => runHaravanLint(utcBad, { waivers: [{ rule: 'not-a-slug', reason: 'long enough reason' }] }), /registry slug/));
check('a waiver reason under 10 chars throws', throwsWith(() => runHaravanLint(utcBad, { waivers: [{ rule: 'utc-date-idiom', reason: 'short' }] }), /at least 10/));
const waiverFile = writeJson(scratch, 'QA_WAIVERS.json', [{ rule: 'utc-date-idiom', reason: 'legacy booking widget, tracked separately' }]);
const cliWaived = spawnSync(process.execPath, [path.join(KIT, 'haravan_lint.js'), '--root', utcBad, '--json', '--waivers', waiverFile], { encoding: 'utf8' });
const cliPayload = JSON.parse(cliWaived.stdout);
check('lint CLI --waivers reports waived findings in JSON', cliWaived.status === 0 && cliPayload.waived.length === 2 && !cliPayload.ruleCounts.JS_UTC_DATE_IDIOM);

const kindRoot = tmpDir('lint-kinds');
fs.mkdirSync(path.join(kindRoot, 'snippets'), { recursive: true });
fs.writeFileSync(path.join(kindRoot, 'snippets', 'kinds.liquid'),
  '<button type="button" aria-label="Đóng cửa sổ">x</button>\n<p>Chào mừng bạn đến cửa hàng</p>\n<input type="text" placeholder="Nhập địa chỉ email">\n<img src="{{ shop.logo }}" alt="Biểu tượng cửa hàng" width="1" height="1">\n', 'utf8');
const textRule = 'LIQUID_HARDCODED_VISIBLE_TEXT';
const kindsOf = (findings) => byRule(findings, textRule).map((f) => f.kind).sort().join(',');
check('visible-text findings carry a structured kind', kindsOf(runHaravanLint(kindRoot)) === 'alt,aria-label,placeholder,text');
const kindWaived = runHaravanLint(kindRoot, { waivers: [{ rule: 'hardcoded-visible-text', reason: 'aria labels are waived by decision', kinds: ['aria-label'] }] });
check('a kinds waiver waives only the listed kind', kindsOf(kindWaived) === 'alt,placeholder,text' && kindWaived.waived.length === 1 && kindWaived.waived[0].finding.kind === 'aria-label');
check('a waiver without kinds still waives every finding of the slug', byRule(runHaravanLint(kindRoot, { waivers: [{ rule: 'hardcoded-visible-text', reason: 'whole slug waived on purpose' }] }), textRule).length === 0);
check('a waiver with an unknown kind throws', throwsWith(() => runHaravanLint(kindRoot, { waivers: [{ rule: 'hardcoded-visible-text', reason: 'long enough reason', kinds: ['colour'] }] }), /kinds\[0\] must be one of/));
check('a waiver with an empty kinds array throws', throwsWith(() => runHaravanLint(kindRoot, { waivers: [{ rule: 'hardcoded-visible-text', reason: 'long enough reason', kinds: [] }] }), /kinds must be a non-empty array/));
check('a waiver with kinds on a rule without kinds throws', throwsWith(() => runHaravanLint(kindRoot, { waivers: [{ rule: 'utc-date-idiom', reason: 'long enough reason', kinds: ['text'] }] }), /findings carry no kind/));

console.log('\n## settings-audit fixtures');

const auditEntries = entries.filter((e) => e.gate === 'settings-audit');
for (const entry of auditEntries) {
  const [id] = registry.ruleIdsOf(entry);
  const badRun = runSettingsSchemaAudit(registry.resolveFixture(entry.fixtures.bad));
  const goodRun = runSettingsSchemaAudit(registry.resolveFixture(entry.fixtures.good));
  const all = (run) => [...run.errors, ...run.warnings, ...run.info];
  check(`${entry.slug}: bad fixture is flagged by ${id}`, all(badRun).some((f) => f.rule === id));
  check(`${entry.slug}: good fixture has 0 findings of ${id}`, !all(goodRun).some((f) => f.rule === id));
  check(`${entry.slug}: good fixture has 0 errors`, goodRun.errors.length === 0);
}

console.log('\n## foreign-gate fixtures (receipt, probe, readiness)');

const pending = [];
for (const entry of entries.filter((e) => !['lint', 'settings-audit'].includes(e.gate))) {
  const missing = registry.missingFixtures(entry);
  if (missing.length === 0) {
    check(`${entry.slug}: bad and good fixture exist`, true);
  } else if (STRICT_ALL) {
    check(`${entry.slug}: bad and good fixture exist (${missing.map((m) => m.side).join(', ')} missing)`, false);
  } else {
    pending.push(...missing);
  }
}
for (const m of pending) console.log(`PENDING ${m.slug} ${m.side}: ${m.path}`);
if (STRICT_ALL) {
  check('strict loadRegistry resolves every fixture of every slug', (() => { try { registry.loadRegistry(); return true; } catch { return false; } })());
}

for (const dir of [scratch, emptyRoot, snapRoot]) fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${passes} passed, ${failures} failed${pending.length ? `, ${pending.length} foreign fixture paths pending (run with --all to require them)` : ''}`);
process.exit(failures ? 1 : 0);
