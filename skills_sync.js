const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CANONICAL_ROOT = path.join(os.homedir(), '.claude', 'skills');
const MIRROR_ROOTS = [
  path.join(os.homedir(), '.agents', 'skills'),
  path.resolve(__dirname, '..', '..', 'themes', '.claude', 'skills')
];
const PIPELINE_SKILLS = [
  'haravan-stitch-full-run',
  'haravan-demo-kit',
  'haravan-settings-schema',
  'theme-qa-az',
  'final-showcase',
  'ai-image-studio',
  'haravan',
  'haravan-theme',
  'haravan-preview-screenshot',
  'antifan-qa-cockpit',
  'haravan-partners-theme-submit',
  'haravan-demo-data-audit',
  'haravan-demo-live-seed',
  'haravan-audit'
];
const IGNORED_DIRS = new Set(['node_modules', '.git', '__pycache__']);
const DIFF_CONTEXT = 3;
const DIFF_CELL_LIMIT = 25e6;
const UNMIRRORED_LISTED = 12;
const MIN_REASON_LENGTH = 10;
const DEFAULT_EXCLUSIONS = path.join(__dirname, 'registry', 'skills-sync-exclusions.json');

function listFiles(directory, base = directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute, base));
    else if (entry.isFile()) files.push(path.relative(base, absolute).replace(/\\/g, '/'));
  }
  return files.sort();
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isDirectory(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function listSkillDirs(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function diffSkill(skill, mirrorRoot, canonicalRoot = CANONICAL_ROOT) {
  const source = path.join(canonicalRoot, skill);
  const target = path.join(mirrorRoot, skill);
  const sourceFiles = listFiles(source);
  const targetFiles = new Set(listFiles(target));
  const missing = [];
  const drifted = [];
  for (const relative of sourceFiles) {
    if (!targetFiles.has(relative)) missing.push(relative);
    else if (hashFile(path.join(source, relative)) !== hashFile(path.join(target, relative))) drifted.push(relative);
    targetFiles.delete(relative);
  }
  const extra = [...targetFiles];
  return {
    skill,
    mirrorRoot,
    target,
    missing,
    drifted,
    changed: [...missing, ...drifted].sort(),
    extra,
    missingMirror: false
  };
}

function normalizeRoot(root) {
  const expanded = root === '~' || /^~[\\/]/.test(root) ? path.join(os.homedir(), root.slice(1)) : root;
  const resolved = path.resolve(expanded);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function loadExclusions(file) {
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read exclusions ${file}: ${error.message}`);
  }
  if (!Array.isArray(entries)) throw new Error(`exclusions file must be a JSON array: ${file}`);
  return entries.map((entry, index) => {
    const where = `exclusions entry ${index} in ${file}`;
    if (!entry || typeof entry !== 'object') throw new Error(`${where} is not an object`);
    for (const field of ['skill', 'mirrorRoot', 'file']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) throw new Error(`${where} needs a non-empty "${field}"`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < MIN_REASON_LENGTH) {
      throw new Error(`${where} needs a "reason" of at least ${MIN_REASON_LENGTH} characters`);
    }
    const relative = path.posix.normalize(entry.file.replace(/\\/g, '/'));
    if (relative.startsWith('../') || relative === '..' || relative === '.' || path.posix.isAbsolute(relative)) {
      throw new Error(`${where} has a file outside the skill directory: ${entry.file}`);
    }
    return { skill: entry.skill, mirrorRoot: entry.mirrorRoot, mirrorKey: normalizeRoot(entry.mirrorRoot), file: relative, reason: entry.reason.trim() };
  });
}

function takeExcluded(item, exclusions, state) {
  const key = normalizeRoot(item.mirrorRoot);
  const mine = exclusions.filter((entry) => entry.skill === item.skill && entry.mirrorKey === key);
  state.evaluated.add(`${item.skill}|${key}`);
  if (!mine.length) {
    item.changed = [...item.missing, ...item.drifted].sort();
    return;
  }
  const byFile = new Map(mine.map((entry) => [entry.file, entry]));
  const take = (list, kind) =>
    list.filter((relative) => {
      const entry = byFile.get(relative);
      if (!entry) return true;
      state.excluded.push({ skill: item.skill, mirrorRoot: item.mirrorRoot, file: relative, state: kind, reason: entry.reason });
      state.matched.add(entry);
      return false;
    });
  item.missing = take(item.missing, 'missing');
  item.drifted = take(item.drifted, 'differs');
  item.extra = take(item.extra, 'mirror-only');
  item.changed = [...item.missing, ...item.drifted].sort();
}

function inspect(options = {}) {
  const canonicalRoot = options.canonicalRoot || CANONICAL_ROOT;
  const mirrorRoots = options.mirrorRoots || MIRROR_ROOTS;
  const skills = options.skills || PIPELINE_SKILLS;
  const required = options.required || new Set(skills);
  const exclusions = options.exclusions || loadExclusions(DEFAULT_EXCLUSIONS);
  const state = { excluded: [], matched: new Set(), evaluated: new Set() };
  const items = [];
  const unmirrored = [];
  for (const skill of skills) {
    const source = path.join(canonicalRoot, skill);
    const hasSkillFile = fs.existsSync(path.join(source, 'SKILL.md'));
    const canonicalOk = hasSkillFile || (isDirectory(source) && !PIPELINE_SKILLS.includes(skill));
    if (!canonicalOk) {
      items.push({ skill, missingCanonical: true, changed: [], missing: [], drifted: [], extra: [] });
      continue;
    }
    const sourceFiles = listFiles(source);
    for (const mirrorRoot of mirrorRoots) {
      const target = path.join(mirrorRoot, skill);
      if (!isDirectory(target)) {
        if (!required.has(skill)) {
          unmirrored.push({ skill, mirrorRoot });
          continue;
        }
        const item = { skill, mirrorRoot, target, missing: [...sourceFiles], drifted: [], changed: [], extra: [], missingMirror: true };
        takeExcluded(item, exclusions, state);
        item.missingMirror = item.missing.length > 0;
        if (item.missingMirror) items.push(item);
        continue;
      }
      const result = diffSkill(skill, mirrorRoot, canonicalRoot);
      takeExcluded(result, exclusions, state);
      result.missingMirror = hasSkillFile && result.missing.includes('SKILL.md');
      if (result.changed.length || result.extra.length || result.missingMirror) items.push(result);
    }
  }
  const mirrorKeys = new Set(mirrorRoots.map(normalizeRoot));
  const staleExclusions = exclusions
    .filter((entry) => skills.includes(entry.skill) && mirrorKeys.has(entry.mirrorKey) && state.evaluated.has(`${entry.skill}|${entry.mirrorKey}`) && !state.matched.has(entry))
    .map(({ skill, mirrorRoot, file, reason }) => ({ skill, mirrorRoot, file, reason }));
  return { items, unmirrored, excluded: state.excluded, staleExclusions };
}

function collectDrift(options = {}) {
  return inspect(options).items;
}

function summarize({ items, unmirrored = [], excluded = [], staleExclusions = [] }) {
  const summary = {
    missingCanonical: 0,
    missingMirror: 0,
    missingFiles: 0,
    driftedFiles: 0,
    extraFiles: 0,
    unmirrored: unmirrored.length,
    excluded: excluded.length,
    staleExclusions: staleExclusions.length
  };
  for (const item of items) {
    if (item.missingCanonical) {
      summary.missingCanonical += 1;
      continue;
    }
    if (item.missingMirror) summary.missingMirror += 1;
    summary.missingFiles += item.missing.length;
    summary.driftedFiles += item.drifted.length;
    summary.extraFiles += item.extra.length;
  }
  return summary;
}

function isFailing(summary, ignoreExtra) {
  return Boolean(
    summary.missingCanonical ||
      summary.missingMirror ||
      summary.missingFiles ||
      summary.driftedFiles ||
      (!ignoreExtra && summary.extraFiles)
  );
}

function applySync(items, { pruneExtra = false } = {}, canonicalRoot = CANONICAL_ROOT) {
  for (const item of items) {
    if (item.missingCanonical) continue;
    const source = path.join(canonicalRoot, item.skill);
    for (const relative of item.changed) {
      const destination = path.join(item.target, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(source, relative), destination);
    }
    if (pruneExtra) for (const relative of item.extra) fs.rmSync(path.join(item.target, relative));
  }
}

function diffOps(oldLines, newLines) {
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const a = oldLines.slice(start, oldEnd);
  const b = newLines.slice(start, newEnd);
  const ops = [];
  for (let i = 0; i < start; i += 1) ops.push(['=', oldLines[i]]);
  if (a.length * b.length > DIFF_CELL_LIMIT) {
    for (const line of a) ops.push(['-', line]);
    for (const line of b) ops.push(['+', line]);
  } else {
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        table[i * width + j] =
          a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        ops.push(['=', a[i]]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        ops.push(['-', a[i]]);
        i += 1;
      } else {
        ops.push(['+', b[j]]);
        j += 1;
      }
    }
    for (; i < a.length; i += 1) ops.push(['-', a[i]]);
    for (; j < b.length; j += 1) ops.push(['+', b[j]]);
  }
  for (let i = oldEnd; i < oldLines.length; i += 1) ops.push(['=', oldLines[i]]);
  return ops;
}

function unifiedDiff(oldText, newText, oldLabel, newLabel) {
  const ops = diffOps(oldText.split('\n'), newText.split('\n'));
  const oldBefore = [0];
  const newBefore = [0];
  for (const [kind] of ops) {
    oldBefore.push(oldBefore[oldBefore.length - 1] + (kind === '+' ? 0 : 1));
    newBefore.push(newBefore[newBefore.length - 1] + (kind === '-' ? 0 : 1));
  }
  const changes = [];
  ops.forEach(([kind], index) => {
    if (kind !== '=') changes.push(index);
  });
  if (!changes.length) return '';
  const groups = [];
  for (const index of changes) {
    const last = groups[groups.length - 1];
    if (last && index - last.end <= DIFF_CONTEXT * 2) last.end = index;
    else groups.push({ start: index, end: index });
  }
  const out = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  for (const group of groups) {
    const from = Math.max(0, group.start - DIFF_CONTEXT);
    const to = Math.min(ops.length, group.end + DIFF_CONTEXT + 1);
    const oldCount = oldBefore[to] - oldBefore[from];
    const newCount = newBefore[to] - newBefore[from];
    const oldStart = oldCount ? oldBefore[from] + 1 : oldBefore[from];
    const newStart = newCount ? newBefore[from] + 1 : newBefore[from];
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (let index = from; index < to; index += 1) out.push(`${ops[index][0] === '=' ? ' ' : ops[index][0]}${ops[index][1]}`);
  }
  return out.join('\n');
}

function contentDiff(skill, options) {
  const canonicalRoot = options.canonicalRoot;
  const source = path.join(canonicalRoot, skill);
  if (!isDirectory(source)) {
    console.error(`canonical skill missing: ${source}`);
    return 1;
  }
  let differences = 0;
  for (const mirrorRoot of options.mirrorRoots) {
    const target = path.join(mirrorRoot, skill);
    if (!isDirectory(target)) {
      console.log(`mirror missing: ${target}`);
      differences += 1;
      continue;
    }
    const result = diffSkill(skill, mirrorRoot, canonicalRoot);
    const state = { excluded: [], matched: new Set(), evaluated: new Set() };
    takeExcluded(result, options.exclusions, state);
    for (const entry of state.excluded) console.log(`excluded (kept different): ${entry.file} (${target}): ${entry.reason}`);
    for (const relative of result.missing) {
      console.log(`only in canonical: ${relative} (${target})`);
      differences += 1;
    }
    for (const relative of result.extra) {
      console.log(`only in mirror: ${relative} (${target})`);
      differences += 1;
    }
    for (const relative of result.drifted) {
      const oldBuffer = fs.readFileSync(path.join(source, relative));
      const newBuffer = fs.readFileSync(path.join(target, relative));
      differences += 1;
      if (oldBuffer.includes(0) || newBuffer.includes(0)) {
        console.log(`binary files differ: ${relative} (${target})`);
        continue;
      }
      console.log(unifiedDiff(oldBuffer.toString('utf8'), newBuffer.toString('utf8'), path.join(source, relative), path.join(target, relative)));
    }
  }
  return differences ? 1 : 0;
}

function parseArgs(argv) {
  const options = {
    check: false,
    all: false,
    pipeline: false,
    skills: [],
    canonicalRoot: null,
    mirrorRoots: [],
    pruneExtra: false,
    ignoreExtra: false,
    contentDiff: null,
    json: false,
    exclusions: null,
    errors: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        options.errors.push(`${arg} needs a value`);
        return '';
      }
      index += 1;
      return next;
    };
    if (arg === '--check') options.check = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--pipeline') options.pipeline = true;
    else if (arg === '--prune-extra') options.pruneExtra = true;
    else if (arg === '--ignore-extra') options.ignoreExtra = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--skill') options.skills.push(...value().split(',').map((name) => name.trim()).filter(Boolean));
    else if (arg === '--canonical') options.canonicalRoot = path.resolve(value());
    else if (arg === '--mirror') options.mirrorRoots.push(path.resolve(value()));
    else if (arg === '--content-diff') options.contentDiff = value();
    else if (arg === '--exclusions') options.exclusions = path.resolve(value());
    else options.errors.push(`unknown argument: ${arg}`);
  }
  if (options.check && options.pruneExtra) options.errors.push('--prune-extra cannot be combined with --check');
  if (options.all && options.skills.length) options.errors.push('--all and --skill are mutually exclusive');
  return options;
}

function printItems(items, check) {
  for (const item of items) {
    if (item.missingCanonical) {
      console.error(`canonical skill missing: ${item.skill}`);
      continue;
    }
    const label = item.missingMirror ? 'missing' : check ? 'drift' : 'sync';
    console.log(`${label} ${item.skill} -> ${item.mirrorRoot}: ${item.missing.length} missing, ${item.drifted.length} drifted, ${item.extra.length} extra`);
    for (const relative of item.missing) console.log(`  + ${relative} (missing in mirror)`);
    for (const relative of item.drifted) console.log(`  ~ ${relative} (differs from canonical)`);
    for (const relative of item.extra) console.log(`  ? ${relative} (mirror-only, kept unless --prune-extra)`);
  }
}

function printExclusions({ excluded, staleExclusions }) {
  for (const entry of excluded) console.log(`excluded ${entry.skill} -> ${entry.mirrorRoot}: ${entry.file} (${entry.state}): ${entry.reason}`);
  for (const entry of staleExclusions) console.log(`warning: stale exclusion ${entry.skill} -> ${entry.mirrorRoot}: ${entry.file} no longer differs; remove the entry`);
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.errors.length) {
    for (const message of options.errors) console.error(message);
    return 3;
  }
  const canonicalRoot = options.canonicalRoot || CANONICAL_ROOT;
  const mirrorRoots = options.mirrorRoots.length ? options.mirrorRoots : MIRROR_ROOTS;
  if (!isDirectory(canonicalRoot)) {
    console.error(`canonical root not found: ${canonicalRoot}`);
    return 2;
  }
  for (const root of mirrorRoots) {
    if (!isDirectory(root)) {
      console.error(`mirror root not found: ${root}`);
      return 2;
    }
  }
  let exclusions;
  try {
    exclusions = loadExclusions(options.exclusions || DEFAULT_EXCLUSIONS);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  if (options.contentDiff) return contentDiff(options.contentDiff, { canonicalRoot, mirrorRoots, exclusions });

  let skills;
  const required = new Set(options.skills.length ? options.skills : PIPELINE_SKILLS);
  if (options.all) {
    const canonicalDirs = listSkillDirs(canonicalRoot);
    if (!canonicalDirs.length) {
      console.error(`canonical root has no skill directories: ${canonicalRoot}`);
      return 2;
    }
    skills = options.canonicalRoot ? canonicalDirs : [...new Set([...canonicalDirs, ...PIPELINE_SKILLS])].sort();
  } else skills = options.skills.length ? [...new Set(options.skills)] : PIPELINE_SKILLS;
  if (!skills.length) {
    console.error('no skills selected: nothing to compare');
    return 2;
  }

  const inspected = inspect({ canonicalRoot, mirrorRoots, skills, required, exclusions });
  const { items, unmirrored } = inspected;
  const summary = summarize(inspected);
  if (options.json && options.check) {
    console.log(JSON.stringify({ canonicalRoot, mirrorRoots, skills: skills.length, items, unmirrored, excluded: inspected.excluded, staleExclusions: inspected.staleExclusions, summary, ok: !isFailing(summary, options.ignoreExtra) }, null, 2));
    return isFailing(summary, options.ignoreExtra) ? 1 : 0;
  }
  printItems(items, options.check);
  printExclusions(inspected);
  const byMirror = new Map();
  for (const entry of unmirrored) byMirror.set(entry.mirrorRoot, [...(byMirror.get(entry.mirrorRoot) || []), entry.skill]);
  for (const [mirrorRoot, names] of byMirror) console.log(`not mirrored in ${mirrorRoot} (${names.length}, opt-in by directory): ${names.slice(0, UNMIRRORED_LISTED).join(', ')}${names.length > UNMIRRORED_LISTED ? `, and ${names.length - UNMIRRORED_LISTED} more (see --json)` : ''}`);
  const totals = `skills checked: ${skills.length}; missing canonical: ${summary.missingCanonical}; missing mirror copies: ${summary.missingMirror}; missing files: ${summary.missingFiles}; drifted files: ${summary.driftedFiles}; extra files: ${summary.extraFiles}; excluded files: ${summary.excluded}; stale exclusions: ${summary.staleExclusions}; not mirrored: ${summary.unmirrored}`;

  if (options.check) {
    console.log(totals);
    if (isFailing(summary, options.ignoreExtra)) return 1;
    console.log(`skills in sync (canonical ${canonicalRoot})`);
    return 0;
  }
  applySync(items, { pruneExtra: options.pruneExtra }, canonicalRoot);
  const after = inspect({ canonicalRoot, mirrorRoots, skills, required, exclusions });
  const remaining = summarize(after);
  console.log(totals);
  if (remaining.extraFiles) console.log(`kept ${remaining.extraFiles} mirror-only file(s); pass --prune-extra to remove them`);
  if (isFailing({ ...remaining, extraFiles: 0 }, true)) return 1;
  console.log(`synced ${items.filter((item) => !item.missingCanonical).length} mirror copy(ies); canonical ${canonicalRoot}`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { CANONICAL_ROOT, MIRROR_ROOTS, PIPELINE_SKILLS, collectDrift, inspect, unifiedDiff };
