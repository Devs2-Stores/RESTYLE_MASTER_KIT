const fs = require('fs');
const path = require('path');
const { CANONICAL_ROOT, collectDrift } = require('./skills_sync');

const root = path.resolve(__dirname, '..', '..');
const skill = (relativePath) => path.join(CANONICAL_ROOT, relativePath);
const failures = [];

function read(relativePath) {
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function checkBudget(relativePath, maxLines, maxBytes) {
  const text = read(relativePath);
  const normalized = text.replace(/\r?\n$/, '');
  const lines = normalized ? normalized.split(/\r?\n/).length : 0;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (lines > maxLines) failures.push(`${relativePath}: ${lines} lines exceeds ${maxLines}`);
  if (bytes > maxBytes) failures.push(`${relativePath}: ${bytes} bytes exceeds ${maxBytes}`);
}

function requireMatch(relativePath, pattern, label) {
  const text = read(relativePath);
  if (text && !pattern.test(text)) failures.push(`${relativePath}: missing ${label}`);
}

function forbidMatch(relativePath, pattern, label) {
  const text = read(relativePath);
  if (text && pattern.test(text)) failures.push(`${relativePath}: stale/conflicting ${label}`);
}

function checkMarkdownLinks(relativePath) {
  const text = read(relativePath);
  const base = path.dirname(path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath));
  for (const match of text.matchAll(/\]\(([^)]+\.md)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^(?:https?:|[A-Za-z]:)/i.test(target)) continue;
    if (!fs.existsSync(path.resolve(base, target))) failures.push(`${relativePath}: broken link ${target}`);
  }
}

function checkSkillSync() {
  for (const item of collectDrift()) {
    if (item.missingCanonical) failures.push(`${item.skill}: canonical copy missing in ${CANONICAL_ROOT}`);
    else failures.push(`${item.skill}: mirror drift in ${item.mirrorRoot} (${item.changed.length} changed, ${item.extra.length} extra); run npm run skills:sync`);
  }
}

const budgets = [
  ['AGENTS.md', 260, 24000],
  ['CLAUDE.md', 40, 3000],
  ['themes/CLAUDE.md', 90, 8000],
  [skill('haravan-stitch-full-run/SKILL.md'), 120, 8000],
  [skill('theme-qa-az/SKILL.md'), 90, 8500],
  [skill('haravan-demo-kit/SKILL.md'), 100, 8500]
];
for (const [file, maxLines, maxBytes] of budgets) checkBudget(file, maxLines, maxBytes);

forbidMatch('tools/RESTYLE_MASTER_KIT/STITCH_FIDELITY.md', /prefers-reduced-motion/i, 'reduced-motion requirement');
requireMatch(skill('haravan-stitch-full-run/references/workspace-and-environment.md'), /Get-Command haravan[^\n]*do not invoke CLI/i, 'non-invoking CLI presence check');
forbidMatch(skill('haravan-stitch-full-run/references/workspace-and-environment.md'), /haravan --version/i, 'CLI invocation during environment validation');
forbidMatch(skill('haravan-stitch-full-run/references/one-command-workflow.md'), /theme:push|haravan theme push/i, 'nonexistent bulk theme push workflow');
requireMatch(skill('haravan-stitch-full-run/references/stitch-upstream-handoff.md'), /capability catalog\*\*, not a universal baseline/i, 'conditional screen catalog');
requireMatch('tools/RESTYLE_MASTER_KIT/STITCH_FIDELITY.md', /ratio <= 0\.08/, 'visual diff ratio semantics');
requireMatch(skill('theme-qa-az/SKILL.md'), /Theme QA A-Z v2\.3/, 'v2.3 title');
requireMatch(skill('theme-qa-az/SKILL.md'), /qaProfiles\[\].*policy\.merchantData/, 'separate QA and data policy axes');
forbidMatch(skill('theme-qa-az/SKILL.md'), /HS1[–-]HS16/, 'HS1-HS16 scope');
forbidMatch(skill('theme-qa-az/references/qa-surface-matrix.md'), /HS1[–-]HS16/, 'HS1-HS16 matrix scope');
requireMatch(skill('theme-qa-az/references/qa-checklist-a-to-z.md'), /0\.4 \[Sapo review\/legacy-default\]/, 'profile-scoped install default');
requireMatch(skill('theme-qa-az/references/qa-checklist-a-to-z.md'), /intrinsic HTML `width`\/`height`/, 'intrinsic image dimensions');
forbidMatch(skill('theme-qa-az/references/qa-checklist-a-to-z.md'), /`standard`/, 'ambiguous merchant data policy');
forbidMatch(skill('haravan-demo-kit/references/prompt-recipes.md'), /\bBFL\b/, 'provider-specific prompt recipe');
forbidMatch(skill('haravan-demo-kit/references/data-quality.md'), /npm i sharp[^\n]*tools\/Generate/i, 'stale sharp install path');
requireMatch(skill('haravan-stitch-full-run/references/final-showcase-pptx.md'), /only when user\/contract selects Sapo output/i, 'conditional Sapo export');
if (fs.existsSync(path.join(root, 'docs/ai-context-authority.md'))) {
  requireMatch('docs/ai-context-authority.md', /## Authority matrix/, 'authority matrix');
}
requireMatch('README.md', /Contract chung: \[`AGENTS\.md`\]/, 'AGENTS authority pointer');

for (const file of budgets.map(([relativePath]) => relativePath).filter((relativePath) => relativePath.endsWith('SKILL.md'))) {
  checkMarkdownLinks(file);
}

if (!fs.existsSync(skill('haravan-settings-schema/SKILL.md'))) {
  failures.push('canonical dependency missing: haravan-settings-schema');
}
checkSkillSync();

if (failures.length) {
  console.error(`Context contract audit failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Context contract audit passed (${budgets.length} budgets, canonical skills ${CANONICAL_ROOT} + mirror sync)`);
