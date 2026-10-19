'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'skills-sync');
const SYNC = path.join(KIT_ROOT, 'skills_sync.js');
const LINT = path.join(KIT_ROOT, 'skills_routes_lint.js');
const ASSERTIONS = path.join(KIT_ROOT, 'registry', 'guidance-assertions.json');

let passed = 0;
let failed = 0;
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label);
  ok ? passed++ : failed++;
}

const fixture = (...parts) => path.join(FIXTURES, ...parts);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-sync-tests-'));
let counter = 0;

function copyOf(name) {
  const target = path.join(scratch, `${name}-${counter++}`);
  fs.cpSync(fixture(name), target, { recursive: true });
  return target;
}

function emptyDir() {
  const target = path.join(scratch, `empty-${counter++}`);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: KIT_ROOT });
  return { status: result.status, out: `${result.stdout}${result.stderr}`, stdout: result.stdout };
}

const sync = (...args) => run(SYNC, args);
const lint = (...args) => run(LINT, args);
const canon = fixture('canon');

try {
  const ok = sync('--check', '--canonical', canon, '--mirror', fixture('mirror-ok'), '--skill', 'alpha,beta');
  check('sync: clean mirror exits 0', ok.status === 0);
  check('sync: clean mirror reports in sync', /skills in sync/.test(ok.out));

  const missing = sync('--check', '--canonical', canon, '--mirror', fixture('mirror-missing'), '--skill', 'alpha,beta');
  check('sync: mirror without a skill copy exits 1', missing.status === 1);
  check('sync: missing copy is named', /missing beta/.test(missing.out) && /missing mirror copies: 1/.test(missing.out));

  const noSkillFile = copyOf('mirror-ok');
  fs.rmSync(path.join(noSkillFile, 'beta', 'SKILL.md'));
  const noSkillFileRun = sync('--check', '--canonical', canon, '--mirror', noSkillFile, '--skill', 'alpha,beta');
  check('sync: mirror directory lacking SKILL.md exits 1', noSkillFileRun.status === 1 && /missing beta/.test(noSkillFileRun.out));

  const drift = sync('--check', '--canonical', canon, '--mirror', fixture('mirror-drift'), '--skill', 'alpha,beta');
  check('sync: drifted copy exits 1', drift.status === 1);
  check('sync: drifted file is listed', /~ SKILL\.md \(differs from canonical\)/.test(drift.out) && /drifted files: 1/.test(drift.out));

  const extra = sync('--check', '--canonical', canon, '--mirror', fixture('mirror-extra'), '--skill', 'alpha,beta');
  check('sync: mirror-only file fails the check and is reported', extra.status === 1 && /\? references\/stale\.md/.test(extra.out));
  const extraIgnored = sync('--check', '--ignore-extra', '--canonical', canon, '--mirror', fixture('mirror-extra'), '--skill', 'alpha,beta');
  check('sync: --ignore-extra accepts mirror-only files', extraIgnored.status === 0);
  check('sync: check never deletes the extra file', fs.existsSync(fixture('mirror-extra', 'alpha', 'references', 'stale.md')));

  const prunedWithCheck = sync('--check', '--prune-extra', '--canonical', canon, '--mirror', fixture('mirror-extra'), '--skill', 'alpha');
  check('sync: --check --prune-extra is a usage error', prunedWithCheck.status === 3);

  const keepCopy = copyOf('mirror-extra');
  const kept = sync('--canonical', canon, '--mirror', keepCopy, '--skill', 'alpha,beta');
  check('sync: apply keeps the extra file', kept.status === 0 && fs.existsSync(path.join(keepCopy, 'alpha', 'references', 'stale.md')));
  check('sync: apply says extras were kept', /kept 1 mirror-only file/.test(kept.out));
  const pruneCopy = copyOf('mirror-extra');
  const pruned = sync('--prune-extra', '--canonical', canon, '--mirror', pruneCopy, '--skill', 'alpha,beta');
  check('sync: --prune-extra removes the extra file', pruned.status === 0 && !fs.existsSync(path.join(pruneCopy, 'alpha', 'references', 'stale.md')));

  const missingCopy = copyOf('mirror-missing');
  const applied = sync('--canonical', canon, '--mirror', missingCopy, '--skill', 'alpha,beta');
  check('sync: apply creates the missing skill copy', applied.status === 0 && fs.existsSync(path.join(missingCopy, 'beta', 'SKILL.md')));
  check('sync: check passes after apply', sync('--check', '--canonical', canon, '--mirror', missingCopy, '--skill', 'alpha,beta').status === 0);
  const driftCopy = copyOf('mirror-drift');
  sync('--canonical', canon, '--mirror', driftCopy, '--skill', 'alpha,beta');
  check(
    'sync: apply restores the drifted file',
    fs.readFileSync(path.join(driftCopy, 'alpha', 'SKILL.md'), 'utf8') === fs.readFileSync(path.join(canon, 'alpha', 'SKILL.md'), 'utf8')
  );

  const allOk = sync('--check', '--all', '--canonical', canon, '--mirror', fixture('mirror-ok'));
  check('sync: --all clean exits 0 and covers every canonical directory', allOk.status === 0 && /skills checked: 3;/.test(allOk.out));
  const allDrift = sync('--check', '--all', '--canonical', canon, '--mirror', fixture('mirror-drift'));
  check('sync: --all detects drift', allDrift.status === 1 && /drifted files: 1/.test(allDrift.out));
  const allMissing = sync('--check', '--all', '--canonical', canon, '--mirror', fixture('mirror-missing'));
  check('sync: --all lists directories a mirror does not carry', allMissing.status === 0 && /not mirrored in .*\(2, opt-in by directory\): beta, shared/.test(allMissing.out));
  const supportDrift = copyOf('mirror-ok');
  fs.writeFileSync(path.join(supportDrift, 'shared', 'guide.md'), '# edited\n');
  check('sync: --all compares directories without SKILL.md', sync('--check', '--all', '--canonical', canon, '--mirror', supportDrift).status === 1);

  const json = sync('--check', '--json', '--canonical', canon, '--mirror', fixture('mirror-drift'), '--skill', 'alpha,beta');
  let parsed = null;
  try {
    parsed = JSON.parse(json.stdout);
  } catch {
    parsed = null;
  }
  check('sync: --json reports the same verdict', parsed && parsed.ok === false && parsed.summary.driftedFiles === 1 && json.status === 1);

  const diff = sync('--content-diff', 'alpha', '--canonical', canon, '--mirror', fixture('mirror-drift'));
  check('sync: --content-diff prints a unified diff and exits 1', diff.status === 1 && /^@@ /m.test(diff.out) && /^-Alpha skill body\.$/m.test(diff.out) && /^\+Alpha skill body, edited in the mirror\.$/m.test(diff.out));
  check('sync: --content-diff on identical copies exits 0', sync('--content-diff', 'alpha', '--canonical', canon, '--mirror', fixture('mirror-ok')).status === 0);

  const absentCanonical = sync('--check', '--canonical', canon, '--mirror', fixture('mirror-ok'), '--skill', 'ghost');
  check('sync: unknown canonical skill exits 1', absentCanonical.status === 1 && /canonical skill missing: ghost/.test(absentCanonical.out));
  check('sync: empty canonical root exits 2', sync('--check', '--all', '--canonical', emptyDir(), '--mirror', fixture('mirror-ok')).status === 2);
  check('sync: missing canonical root exits 2', sync('--check', '--canonical', path.join(scratch, 'nope'), '--mirror', fixture('mirror-ok'), '--skill', 'alpha').status === 2);
  check('sync: missing mirror root exits 2', sync('--check', '--canonical', canon, '--mirror', path.join(scratch, 'nope'), '--skill', 'alpha').status === 2);
  check('sync: unknown flag exits 3', sync('--bogus').status === 3);
  check('sync: --all with --skill exits 3', sync('--check', '--all', '--skill', 'alpha', '--canonical', canon, '--mirror', fixture('mirror-ok')).status === 3);

  const sharedDrift = copyOf('mirror-ok');
  fs.writeFileSync(path.join(sharedDrift, 'shared', 'guide.md'), '# edited\n');
  const sharedCheck = sync('--check', '--skill', 'shared', '--canonical', canon, '--mirror', sharedDrift);
  check('support dir: --skill check enumerates a directory without SKILL.md', sharedCheck.status === 1 && /drifted files: 1/.test(sharedCheck.out) && !/canonical skill missing/.test(sharedCheck.out));
  const sharedApply = sync('--skill', 'shared', '--canonical', canon, '--mirror', sharedDrift);
  check('support dir: --skill apply syncs it', sharedApply.status === 0 && fs.readFileSync(path.join(sharedDrift, 'shared', 'guide.md'), 'utf8') === fs.readFileSync(path.join(canon, 'shared', 'guide.md'), 'utf8'));
  const allDriftCopy = copyOf('mirror-ok');
  fs.writeFileSync(path.join(allDriftCopy, 'shared', 'guide.md'), '# edited\n');
  fs.writeFileSync(path.join(allDriftCopy, 'alpha', 'SKILL.md'), '---\nname: alpha\n---\nedited\n');
  check('support dir: --all check fails before apply', sync('--check', '--all', '--canonical', canon, '--mirror', allDriftCopy).status === 1);
  check('support dir: --all apply exits 0', sync('--all', '--canonical', canon, '--mirror', allDriftCopy).status === 0);
  check('support dir: --all check passes after --all apply', sync('--check', '--all', '--canonical', canon, '--mirror', allDriftCopy).status === 0);
  const pipelineCanon = path.join(scratch, `pipeline-canon-${counter++}`);
  fs.mkdirSync(path.join(pipelineCanon, 'haravan'), { recursive: true });
  fs.writeFileSync(path.join(pipelineCanon, 'haravan', 'notes.md'), 'no SKILL.md here\n');
  const pipelineNoSkill = sync('--check', '--skill', 'haravan', '--canonical', pipelineCanon, '--mirror', fixture('mirror-ok'));
  check('support dir: a pipeline skill without SKILL.md is still missing', pipelineNoSkill.status === 1 && /canonical skill missing: haravan/.test(pipelineNoSkill.out));

  const exclusionFile = (name, entries) => {
    const file = path.join(scratch, `${name}-${counter++}.json`);
    fs.writeFileSync(file, JSON.stringify(entries, null, 2));
    return file;
  };
  const driftMirror = copyOf('mirror-drift');
  const driftBefore = fs.readFileSync(path.join(driftMirror, 'alpha', 'SKILL.md'), 'utf8');
  const driftExclusions = exclusionFile('excl', [{ skill: 'alpha', mirrorRoot: driftMirror, file: 'SKILL.md', reason: 'mirror keeps its own frontmatter name' }]);
  const excludedCheck = sync('--check', '--exclusions', driftExclusions, '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha,beta');
  check('exclusions: an excluded drifted file exits 0 in check', excludedCheck.status === 0);
  check('exclusions: the excluded file is listed with its reason', /excluded alpha .*SKILL\.md \(differs\).*mirror keeps its own frontmatter name/.test(excludedCheck.out) && /excluded files: 1/.test(excludedCheck.out));
  check('exclusions: an excluded file is not counted as drift', /drifted files: 0/.test(excludedCheck.out));
  const excludedJson = sync('--check', '--json', '--exclusions', driftExclusions, '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha,beta');
  let excludedParsed = null;
  try {
    excludedParsed = JSON.parse(excludedJson.stdout);
  } catch {
    excludedParsed = null;
  }
  check('exclusions: --json lists excluded entries and ok', excludedParsed && excludedParsed.ok === true && excludedParsed.excluded.length === 1 && excludedParsed.excluded[0].file === 'SKILL.md' && excludedParsed.staleExclusions.length === 0);
  sync('--exclusions', driftExclusions, '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha,beta');
  check('exclusions: apply never overwrites an excluded file', fs.readFileSync(path.join(driftMirror, 'alpha', 'SKILL.md'), 'utf8') === driftBefore);
  const unexcluded = sync('--check', '--exclusions', exclusionFile('excl-other', [{ skill: 'alpha', mirrorRoot: driftMirror, file: 'references/notes.md', reason: 'a different file than the drifted one' }]), '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha,beta');
  check('exclusions: only the named file is excluded', unexcluded.status === 1 && /drifted files: 1/.test(unexcluded.out));
  const otherMirror = sync('--check', '--exclusions', exclusionFile('excl-root', [{ skill: 'alpha', mirrorRoot: path.join(scratch, 'elsewhere'), file: 'SKILL.md', reason: 'a different mirror root than checked' }]), '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha,beta');
  check('exclusions: an exclusion for another mirror root does not apply', otherMirror.status === 1);

  const staleMirror = copyOf('mirror-ok');
  const stale = sync('--check', '--exclusions', exclusionFile('excl-stale', [{ skill: 'alpha', mirrorRoot: staleMirror, file: 'SKILL.md', reason: 'no longer different, entry should go' }]), '--canonical', canon, '--mirror', staleMirror, '--skill', 'alpha,beta');
  check('exclusions: a stale exclusion is a warning, exit stays 0', stale.status === 0 && /warning: stale exclusion alpha .*SKILL\.md/.test(stale.out));
  const staleJson = JSON.parse(sync('--check', '--json', '--exclusions', exclusionFile('excl-stale2', [{ skill: 'alpha', mirrorRoot: staleMirror, file: 'SKILL.md', reason: 'no longer different, entry should go' }]), '--canonical', canon, '--mirror', staleMirror, '--skill', 'alpha,beta').stdout);
  check('exclusions: --json reports the stale entry', staleJson.staleExclusions.length === 1 && staleJson.excluded.length === 0);
  const unrelated = sync('--check', '--exclusions', exclusionFile('excl-unchecked', [{ skill: 'beta', mirrorRoot: staleMirror, file: 'SKILL.md', reason: 'skill is outside the checked set' }]), '--canonical', canon, '--mirror', staleMirror, '--skill', 'alpha');
  check('exclusions: an exclusion for an unchecked skill raises no warning', unrelated.status === 0 && !/warning: stale exclusion/.test(unrelated.out) && /stale exclusions: 0/.test(unrelated.out));

  const extraMirror = copyOf('mirror-extra');
  const extraExclusions = exclusionFile('excl-extra', [{ skill: 'alpha', mirrorRoot: extraMirror, file: 'references/stale.md', reason: 'mirror-only file is kept on purpose' }]);
  const extraChecked = sync('--check', '--exclusions', extraExclusions, '--canonical', canon, '--mirror', extraMirror, '--skill', 'alpha,beta');
  check('exclusions: an excluded mirror-only file passes check', extraChecked.status === 0 && /excluded alpha .*stale\.md \(mirror-only\)/.test(extraChecked.out));
  sync('--prune-extra', '--exclusions', extraExclusions, '--canonical', canon, '--mirror', extraMirror, '--skill', 'alpha,beta');
  check('exclusions: --prune-extra keeps an excluded file', fs.existsSync(path.join(extraMirror, 'alpha', 'references', 'stale.md')));

  const missingMirrorCopy = copyOf('mirror-missing');
  const missingExcluded = sync('--check', '--exclusions', exclusionFile('excl-missing', [{ skill: 'beta', mirrorRoot: missingMirrorCopy, file: 'SKILL.md', reason: 'this mirror must not carry beta' }]), '--canonical', canon, '--mirror', missingMirrorCopy, '--skill', 'alpha,beta');
  check('exclusions: an excluded missing file passes check', missingExcluded.status === 0 && /excluded beta .*SKILL\.md \(missing\)/.test(missingExcluded.out));

  const contentExcluded = sync('--content-diff', 'alpha', '--exclusions', driftExclusions, '--canonical', canon, '--mirror', driftMirror);
  check('exclusions: --content-diff reports an excluded file without a diff', contentExcluded.status === 0 && /excluded \(kept different\): SKILL\.md/.test(contentExcluded.out) && !/^@@ /m.test(contentExcluded.out));

  check('exclusions: a short reason exits 2', sync('--check', '--exclusions', exclusionFile('excl-short', [{ skill: 'alpha', mirrorRoot: driftMirror, file: 'SKILL.md', reason: 'short' }]), '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha').status === 2);
  check('exclusions: an entry without a file exits 2', sync('--check', '--exclusions', exclusionFile('excl-nofile', [{ skill: 'alpha', mirrorRoot: driftMirror, reason: 'reason is long enough here' }]), '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha').status === 2);
  check('exclusions: a path escaping the skill exits 2', sync('--check', '--exclusions', exclusionFile('excl-escape', [{ skill: 'alpha', mirrorRoot: driftMirror, file: '../beta/SKILL.md', reason: 'reason is long enough here' }]), '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha').status === 2);
  check('exclusions: a missing exclusions file exits 2', sync('--check', '--exclusions', path.join(scratch, 'nope.json'), '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha').status === 2);
  check('exclusions: a non-array file exits 2', sync('--check', '--exclusions', exclusionFile('excl-object', { skill: 'alpha' }), '--canonical', canon, '--mirror', driftMirror, '--skill', 'alpha').status === 2);

  const shippedExclusions = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'registry', 'skills-sync-exclusions.json'), 'utf8'));
  const shopifyEntry = shippedExclusions.find((entry) => entry.skill === 'shopify' && entry.file === 'SKILL.md');
  check('exclusions: shipped file excludes the agents shopify SKILL.md with a reason', Array.isArray(shippedExclusions) && shopifyEntry && /agents/.test(shopifyEntry.mirrorRoot) && shopifyEntry.reason === "agents copy is the separate 'shopify' skill; canonical is 'ck:shopify'");
  check('exclusions: every shipped entry has a reason of at least 10 characters', shippedExclusions.every((entry) => typeof entry.reason === 'string' && entry.reason.trim().length >= 10));

  const api = require(SYNC);
  const items = api.collectDrift({ canonicalRoot: canon, mirrorRoots: [fixture('mirror-missing')], skills: ['alpha', 'beta'] });
  check('sync: collectDrift reports a missing mirror copy', items.length === 1 && items[0].skill === 'beta' && items[0].missingMirror === true);
  check('sync: unifiedDiff is empty for equal text', api.unifiedDiff('a\nb\n', 'a\nb\n', 'x', 'y') === '');
  const sample = api.unifiedDiff('a\nb\nc\n', 'a\nB\nc\n', 'x', 'y');
  check('sync: unifiedDiff marks the changed line', /^-b$/m.test(sample) && /^\+B$/m.test(sample) && /^@@ -1,4 \+1,4 @@$/m.test(sample));
  const requiredPipelineSkills = ['haravan-stitch-full-run', 'haravan-demo-kit', 'haravan-settings-schema', 'theme-qa-az', 'final-showcase', 'ai-image-studio', 'haravan', 'haravan-theme', 'haravan-preview-screenshot', 'antifan-qa-cockpit', 'haravan-partners-theme-submit', 'haravan-demo-data-audit', 'haravan-demo-live-seed', 'haravan-audit'];
  check('sync: PIPELINE_SKILLS lists every theme-pipeline skill exactly once', requiredPipelineSkills.every((name) => api.PIPELINE_SKILLS.includes(name)) && new Set(api.PIPELINE_SKILLS).size === api.PIPELINE_SKILLS.length, api.PIPELINE_SKILLS.join(','));
  check('sync: the canonical root is the OMP-loaded ~/.claude/skills', api.CANONICAL_ROOT === path.join(os.homedir(), '.claude', 'skills'));

  const routes = fixture('routes', 'skills');
  const deadJson = lint('--roots', routes, '--json');
  let report = null;
  try {
    report = JSON.parse(deadJson.stdout);
  } catch {
    report = null;
  }
  const names = report ? report.deadNames.map((entry) => entry.name) : [];
  check('lint: dead routes exit 1', deadJson.status === 1);
  check('lint: reports the three dead skill names', ['ak-ai-multimodal-native', 'ai-multimodal-other', 'image-analysis'].every((name) => names.includes(name)));
  check('lint: reports a haravan route with no SKILL.md', names.includes('haravan-gone') && !names.includes('haravan-live'));
  const imageHits = report ? report.hits.filter((hit) => hit.name === 'image-analysis') : [];
  check('lint: reports/image-analysis.json is not a skill mention', imageHits.length === 1 && imageHits[0].line === 4);

  const excluded = lint('--roots', routes, '--exclude-dir', 'ak-ai-multimodal-native', '--json');
  const excludedReport = JSON.parse(excluded.stdout);
  check(
    'lint: --exclude-dir drops that directory only',
    excluded.status === 1 &&
      !excludedReport.hits.some((hit) => hit.file.includes('ak-ai-multimodal-native' + path.sep)) &&
      excludedReport.hits.some((hit) => hit.name === 'ak-ai-multimodal-native')
  );

  const cleanRun = lint('--roots', fixture('routes-clean', 'skills'));
  check('lint: clean roots exit 0', cleanRun.status === 0);

  const outFile = path.join(scratch, 'dead-names.json');
  lint('--roots', routes, '--dead-names-out', outFile);
  const written = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  check('lint: --dead-names-out writes the dead-name list', written.some((entry) => entry.name === 'image-analysis' && entry.references.length === 1));

  check('lint: empty root exits 2', lint('--roots', emptyDir()).status === 2);
  check('lint: missing root exits 2', lint('--roots', path.join(scratch, 'nope')).status === 2);
  check('lint: no arguments exits 3', lint().status === 3);
  check('lint: --roots with --assert-phrases exits 3', lint('--roots', routes, '--assert-phrases', fixture('assertions', 'good.json')).status === 3);

  const assertGood = lint('--assert-phrases', fixture('assertions', 'good.json'));
  check('assertions: satisfied entries exit 0 and print FAIL 0', assertGood.status === 0 && /^FAIL 0$/m.test(assertGood.out));
  const assertBad = lint('--assert-phrases', fixture('assertions', 'bad.json'));
  check('assertions: missing and forbidden phrases exit 1', assertBad.status === 1 && /^FAIL 2$/m.test(assertBad.out));
  const assertMissing = lint('--assert-phrases', fixture('assertions', 'missing-file.json'));
  check('assertions: an unreadable file is a failure, not a pass', assertMissing.status === 1 && /file not readable/.test(assertMissing.out));
  check('assertions: empty list exits 2', lint('--assert-phrases', fixture('assertions', 'empty.json')).status === 2);
  check('assertions: missing assertions file exits 2', lint('--assert-phrases', path.join(scratch, 'nope.json')).status === 2);

  const shipped = JSON.parse(fs.readFileSync(ASSERTIONS, 'utf8'));
  const wellFormed = shipped.every((entry) => entry.id && (entry.file || (entry.files && entry.files.length)) && [...(entry.mustContain || []), ...(entry.mustNotContain || []), ...(entry.mustMatch || [])].length > 0);
  check('assertions: shipped file is well formed', Array.isArray(shipped) && shipped.length > 0 && wellFormed);
  const shippedText = JSON.stringify(shipped);
  check(
    'assertions: shipped file covers approval text, QA capability names and router rows',
    ['agents-partners-create-update-approval', 'theme-qa-az-capability-names', 'haravan-router-rows'].every((id) => shipped.some((entry) => entry.id === id)) &&
      ['build-strict', 'state_matrix', 'batch_matrix', 'visual_quality'].every((phrase) => shippedText.includes(phrase))
  );
  check('assertions: every shipped regex compiles', shipped.every((entry) => (entry.mustMatch || []).every((pattern) => { try { new RegExp(pattern, 'u'); return true; } catch { return false; } })));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

console.log(`\nPASS ${passed}`);
console.log(`FAIL ${failed}`);
process.exit(failed ? 1 : 0);
