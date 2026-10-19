const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const suites = [
  {
    name: 'haravan-stitch-full-run',
    file: 'themes/.claude/skills/haravan-stitch-full-run/evals/evals.json',
    minCases: 56,
    required: ['full-theme-generate-first', 'workflow-mode-zero-stop-refused', 'haravan-only-final-does-not-export-sapo', 'explicit-sapo-output-routes-conversion', 'selected-screen-coverage', 'screen-catalog-is-not-universal', 'qa-pass-criteria-full-conversion-diff', 'asset-pipeline-stitch-image-sharp'],
    invariants: {
      'haravan-only-final-does-not-export-sapo': { forbid: 'automatic Sapo conversion' },
      'explicit-sapo-output-routes-conversion': { output: ['haravan', 'sapo'] },
      'selected-screen-coverage': { behavior: 'classify the screen catalog from theme inventory and user scope; generate separate designs only for selected screens plus mobile variants required by scope; do not invent optional account/modal/compare/wishlist/search capabilities; track selected/not-applicable/requires-verification in ledger' },
      'screen-catalog-is-not-universal': { behavior: 'present the complete catalog for intake, then require selected/not-applicable/requires-verification classification; one prompt per selected screen; mobile coverage follows selected page scope; catalog does not expand project scope automatically' },
      'qa-pass-criteria-full-conversion-diff': { behavior: 'separate metrics: old-theme diff 42% only proves intentional change and is not a fidelity pass/fail score; Stitch-reference diff uses same-size images and ratio <=0.08 for 92% pixel match plus eyeball fidelity; keep audit, QA, a11y and console gates independent' },
      'asset-pipeline-stitch-image-sharp': { behavior: 'download Stitch-export raster images -> compress with sharp (resize to slot dims, quality ~80, output jpg/png — webp forbidden) BEFORE assets/; clean logo/UI icons may remain SVG with explicit dimensions; never ship raw; generation provider comes from current config' }
    }
  },
  {
    name: 'theme-qa-az',
    file: 'themes/.claude/skills/theme-qa-az/evals/evals.json',
    minCases: 32,
    required: ['platform-ambiguous-must-ask', 'haravan-anchor-title-not-universal', 'settings-only-skips-install-default', 'intrinsic-image-dimensions-allowed', 'sapo-general-qa-skips-marketplace-gate'],
    invariants: {
      'haravan-anchor-title-not-universal': { skip: 'sapo-review G1 title requirement' },
      'settings-only-skips-install-default': { skip: '0.4 legacy install default' },
      'intrinsic-image-dimensions-allowed': { result: 'pass-A1' },
      'sapo-general-qa-skips-marketplace-gate': { skip: 'criteria-0B sapo-review' }
    }
  },
  {
    name: 'haravan-demo-kit',
    file: 'themes/.claude/skills/haravan-demo-kit/evals/evals.json',
    minCases: 9,
    required: ['theme-contract-readiness-before-seed', 'provider-default-comes-from-current-config'],
    invariants: {
      'provider-default-comes-from-current-config': { providerSource: 'current config or tool source' }
    }
  }
];

const failures = [];

function matches(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => matches(actual[index], value));
  if (expected && typeof expected === 'object') return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => matches(actual[key], value));
  return actual === expected;
}

for (const suite of suites) {
  const absolutePath = path.join(root, suite.file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    failures.push(`${suite.name}: invalid JSON (${error.message})`);
    continue;
  }

  if (!Array.isArray(parsed.cases)) {
    failures.push(`${suite.name}: cases must be an array`);
    continue;
  }

  if (parsed.cases.length < suite.minCases) failures.push(`${suite.name}: ${parsed.cases.length} cases below ${suite.minCases}`);
  const names = new Set();
  for (const testCase of parsed.cases) {
    if (!testCase || typeof testCase.name !== 'string' || !testCase.name.trim()) failures.push(`${suite.name}: case missing name`);
    if (!testCase || typeof testCase.prompt !== 'string' || !testCase.prompt.trim()) failures.push(`${suite.name}: ${testCase?.name || 'unnamed'} missing prompt`);
    if (!testCase || !testCase.expect || typeof testCase.expect !== 'object') failures.push(`${suite.name}: ${testCase?.name || 'unnamed'} missing expect`);
    if (names.has(testCase.name)) failures.push(`${suite.name}: duplicate ${testCase.name}`);
    names.add(testCase.name);
  }
  for (const required of suite.required) {
    if (!names.has(required)) failures.push(`${suite.name}: missing required case ${required}`);
  }
  for (const [caseName, invariant] of Object.entries(suite.invariants)) {
    const testCase = parsed.cases.find((candidate) => candidate.name === caseName);
    if (testCase && !matches(testCase.expect, invariant)) failures.push(`${suite.name}: ${caseName} behavior invariant changed`);
  }
}

if (failures.length) {
  console.error(`Skill eval contract audit failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Skill eval fixture contract audit passed (${suites.length} suites)`);
