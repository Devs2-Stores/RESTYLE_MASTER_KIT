'use strict';

const fs = require('fs');
const path = require('path');

const KIT_ROOT = path.resolve(__dirname, '..');
const REGISTRY_FILE = path.join(KIT_ROOT, 'registry', 'defect-classes.json');
const THRESHOLDS_FILE = path.join(KIT_ROOT, 'registry', 'thresholds.json');

const TIERS = ['blocker', 'warn'];
const GATES = ['lint', 'settings-audit', 'receipt', 'probe', 'readiness'];
const THRESHOLD_KEYS = ['minTextPx', 'minTapHitPx'];
const MIN_WAIVER_REASON = 10;
const FINDING_KINDS = {
  LIQUID_HARDCODED_VISIBLE_TEXT: ['aria-label', 'title', 'placeholder', 'alt', 'text', 'table']
};

function readJson(file, label) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`${label} unreadable at ${file}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} is not valid JSON (${file}): ${err.message}`);
  }
}

function ruleIdsOf(entry) {
  if (entry.staticRule == null) return [];
  return Array.isArray(entry.staticRule) ? entry.staticRule : [entry.staticRule];
}

function fixtureErrors(entry) {
  const errors = [];
  const fx = entry.fixtures;
  if (!fx || typeof fx !== 'object' || Array.isArray(fx)) {
    return [`${entry.slug}: fixtures must be an object {bad, good}`];
  }
  for (const side of ['bad', 'good']) {
    if (typeof fx[side] !== 'string' || !fx[side].trim()) {
      errors.push(`${entry.slug}: fixtures.${side} must be a non-empty path`);
    }
  }
  if (typeof fx.bad === 'string' && typeof fx.good === 'string' && fx.bad === fx.good) {
    errors.push(`${entry.slug}: fixtures.bad and fixtures.good must differ`);
  }
  return errors;
}

function validateRegistry(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('defect registry must be a non-empty array');
  }
  const errors = [];
  const seen = new Set();
  for (const [i, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`entry ${i} must be an object`);
      continue;
    }
    const slug = entry.slug;
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.push(`entry ${i}: slug must be kebab-case text (got ${JSON.stringify(slug)})`);
      continue;
    }
    if (seen.has(slug)) errors.push(`duplicate slug: ${slug}`);
    seen.add(slug);
    if (!TIERS.includes(entry.tier)) {
      errors.push(`${slug}: tier must be one of ${TIERS.join('|')} (got ${JSON.stringify(entry.tier)})`);
    }
    if (typeof entry.gate !== 'string' || !GATES.includes(entry.gate)) {
      errors.push(`${slug}: exactly one gate of ${GATES.join('|')} is required (got ${JSON.stringify(entry.gate)})`);
    }
    if (typeof entry.rule !== 'string' || !entry.rule.trim()) errors.push(`${slug}: rule must be a one-line text`);
    if (typeof entry.origin !== 'string' || !entry.origin.trim()) errors.push(`${slug}: origin must be non-empty text`);
    const rules = entry.staticRule;
    const rulesOk = rules == null || (typeof rules === 'string' && rules)
      || (Array.isArray(rules) && rules.length > 0 && rules.every((r) => typeof r === 'string' && r));
    if (!rulesOk) errors.push(`${slug}: staticRule must be a rule id, a list of rule ids or null`);
    if (entry.runtimeProbe != null && (typeof entry.runtimeProbe !== 'string' || !entry.runtimeProbe)) {
      errors.push(`${slug}: runtimeProbe must be a probe name or null`);
    }
    if (entry.gate === 'lint' || entry.gate === 'settings-audit') {
      if (ruleIdsOf(entry).length === 0) errors.push(`${slug}: gate ${entry.gate} needs a staticRule`);
    }
    errors.push(...fixtureErrors(entry));
  }
  if (errors.length) throw new Error(`defect registry invalid:\n- ${errors.join('\n- ')}`);
  return entries;
}

function resolveFixture(fixturePath, kitRoot = KIT_ROOT) {
  return path.resolve(kitRoot, fixturePath);
}

function missingFixtures(entry, kitRoot = KIT_ROOT) {
  const missing = [];
  for (const side of ['bad', 'good']) {
    const resolved = resolveFixture(entry.fixtures[side], kitRoot);
    if (!fs.existsSync(resolved)) missing.push({ slug: entry.slug, side, path: resolved });
  }
  return missing;
}

/** Shape-validated registry; reads no fixture from disk. Runtime consumers (lint, gates) use this. */
function readRegistry(options = {}) {
  const file = options.file || REGISTRY_FILE;
  return validateRegistry(readJson(file, 'defect registry'));
}

/** readRegistry plus: every fixture path must exist. Throws on the first inconsistent registry, never skips. */
function loadRegistry(options = {}) {
  const entries = readRegistry(options);
  const kitRoot = options.kitRoot || KIT_ROOT;
  const missing = entries.flatMap((entry) => missingFixtures(entry, kitRoot));
  if (missing.length) {
    throw new Error(`defect registry fixtures missing:\n- ${missing.map((m) => `${m.slug} ${m.side}: ${m.path}`).join('\n- ')}`);
  }
  return entries;
}

function slugForRule(entries, ruleId) {
  const hit = entries.find((entry) => ruleIdsOf(entry).includes(ruleId));
  return hit ? hit.slug : null;
}

function tierOfRule(entries, ruleId) {
  const hit = entries.find((entry) => ruleIdsOf(entry).includes(ruleId));
  if (!hit) throw new Error(`rule ${ruleId} is not registered in the defect registry`);
  return hit.tier;
}

function positiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number (got ${JSON.stringify(value)})`);
  }
  return value;
}

/** Thresholds come from registry/thresholds.json; contract designDefaults.typeScale may override a key. No code default exists. */
function loadThresholds(options = {}) {
  const base = readJson(options.file || THRESHOLDS_FILE, 'thresholds');
  const merged = {};
  for (const key of THRESHOLD_KEYS) merged[key] = positiveNumber(base[key], `thresholds.${key}`);
  const scale = options.contract && options.contract.designDefaults && options.contract.designDefaults.typeScale;
  if (scale != null) {
    if (typeof scale !== 'object' || Array.isArray(scale)) throw new Error('contract designDefaults.typeScale must be an object');
    for (const [key, value] of Object.entries(scale)) {
      if (!THRESHOLD_KEYS.includes(key)) throw new Error(`contract designDefaults.typeScale.${key} is not a known threshold (${THRESHOLD_KEYS.join(', ')})`);
      merged[key] = positiveNumber(value, `contract designDefaults.typeScale.${key}`);
    }
  }
  return merged;
}

/** Waivers file: [{rule, reason, kinds?}] with rule a registry slug, reason >= 10 chars, kinds a subset of the finding kinds the rule emits. */
function parseWaivers(list, entries, label = 'waivers') {
  if (!Array.isArray(list)) throw new Error(`${label} must be a JSON array of {rule, reason}`);
  const slugs = new Set(entries.map((entry) => entry.slug));
  const errors = [];
  for (const [i, waiver] of list.entries()) {
    if (!waiver || typeof waiver !== 'object' || Array.isArray(waiver)) {
      errors.push(`${label}[${i}] must be an object {rule, reason}`);
      continue;
    }
    if (typeof waiver.rule !== 'string' || !slugs.has(waiver.rule)) {
      errors.push(`${label}[${i}].rule must be a registry slug (got ${JSON.stringify(waiver.rule)})`);
    }
    if (typeof waiver.reason !== 'string' || waiver.reason.trim().length < MIN_WAIVER_REASON) {
      errors.push(`${label}[${i}].reason must be at least ${MIN_WAIVER_REASON} characters`);
    }
    if (waiver.kinds !== undefined) {
      const entry = entries.find((e) => e.slug === waiver.rule);
      const allowed = entry ? [...new Set(ruleIdsOf(entry).flatMap((id) => FINDING_KINDS[id] || []))] : [];
      if (entry && allowed.length === 0) {
        errors.push(`${label}[${i}].kinds is not allowed for ${waiver.rule}: its findings carry no kind`);
      } else if (!Array.isArray(waiver.kinds) || waiver.kinds.length === 0) {
        errors.push(`${label}[${i}].kinds must be a non-empty array`);
      } else if (entry) {
        waiver.kinds.forEach((kind, k) => {
          if (!allowed.includes(kind)) errors.push(`${label}[${i}].kinds[${k}] must be one of ${allowed.join(', ')} (got ${JSON.stringify(kind)})`);
        });
      }
    }
  }
  if (errors.length) throw new Error(`waivers invalid:\n- ${errors.join('\n- ')}`);
  return list.map((waiver) => (waiver.kinds ? { rule: waiver.rule, reason: waiver.reason.trim(), kinds: [...waiver.kinds] } : { rule: waiver.rule, reason: waiver.reason.trim() }));
}

function loadWaivers(file, entries) {
  return parseWaivers(readJson(file, 'waivers file'), entries, path.basename(file));
}

module.exports = {
  KIT_ROOT,
  REGISTRY_FILE,
  THRESHOLDS_FILE,
  TIERS,
  GATES,
  THRESHOLD_KEYS,
  MIN_WAIVER_REASON,
  ruleIdsOf,
  validateRegistry,
  readRegistry,
  loadRegistry,
  missingFixtures,
  resolveFixture,
  slugForRule,
  tierOfRule,
  loadThresholds,
  parseWaivers,
  loadWaivers
};
