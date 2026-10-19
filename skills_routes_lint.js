const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_ALIASES = {
  SC: path.join(os.homedir(), '.claude', 'skills'),
  SA: path.join(os.homedir(), '.agents', 'skills'),
  ST: path.resolve(__dirname, '..', '..', 'themes', '.claude', 'skills'),
  SO: path.join(os.homedir(), '.omp', 'agent', 'skills'),
  SM: path.join(os.homedir(), '.omp', 'agent', 'managed-skills'),
  WS: path.resolve(__dirname, '..', '..'),
  K: __dirname
};
const SKIPPED_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__']);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.js', '.mjs', '.cjs', '.yaml', '.yml', '.txt', '.py', '.liquid', '.toml']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const FIXED_DEAD_NAMES = [
  { name: 'ak-ai-multimodal-native', pattern: /(?<![\w-])ak[-:]ai-multimodal-native(?![\w-])/g },
  { name: 'ai-multimodal-other', pattern: /(?<![\w-])ai-multimodal-other(?![\w-])/g },
  { name: 'image-analysis', pattern: /(?<![\w./\\-])image-analysis(?![\w-]|\.\w)/g },
  { name: 'haravan-to-sapo', pattern: /(?<![\w-])haravan-to-sapo(?![\w-])/g }
];
const HARAVAN_SKILL_TOKEN = /(?<![\w.:-])haravan(?:-[a-z0-9]+)+(?![\w-]|\.\w)/g;
const ROUTING_CONTEXT = /skill|route|routing|router|delegate|dispatch|load/i;

function resolveAlias(entry) {
  const match = /^(SC|SA|ST|SO|SM|WS|K)(?=$|[\\/])(.*)$/.exec(entry);
  if (!match) return path.resolve(entry);
  return path.join(ROOT_ALIASES[match[1]], match[2]);
}

function walkTextFiles(directory, excludeDirs, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name) || excludeDirs.has(entry.name)) continue;
      walkTextFiles(path.join(directory, entry.name), excludeDirs, files);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const file = path.join(directory, entry.name);
      if (fs.statSync(file).size <= MAX_FILE_BYTES) files.push(file);
    }
  }
  return files;
}

function collectSkillNames(roots) {
  const names = new Set();
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md'))) names.add(entry.name);
    }
  }
  return names;
}

function isSkillRoute(text, index, token) {
  if (/skills[\\/]$/.test(text.slice(Math.max(0, index - 7), index))) return true;
  const quoted = text[index - 1] === '`' && text[index + token.length] === '`';
  return quoted && ROUTING_CONTEXT.test(text);
}

function lintRoutes({ roots, excludeDirs = [] }) {
  const exclude = new Set(excludeDirs);
  const knownSkills = collectSkillNames(roots);
  const hits = [];
  let scanned = 0;
  for (const root of roots) {
    for (const file of walkTextFiles(root, exclude)) {
      scanned += 1;
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((text, lineIndex) => {
        for (const { name, pattern } of FIXED_DEAD_NAMES) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) hits.push({ kind: 'dead-name', name, root, file, line: lineIndex + 1, text: text.trim().slice(0, 200) });
        }
        HARAVAN_SKILL_TOKEN.lastIndex = 0;
        for (const match of text.matchAll(HARAVAN_SKILL_TOKEN)) {
          if (!isSkillRoute(text, match.index, match[0]) || knownSkills.has(match[0])) continue;
          if (FIXED_DEAD_NAMES.some((fixed) => fixed.name === match[0])) continue;
          hits.push({ kind: 'unknown-skill', name: match[0], root, file, line: lineIndex + 1, text: text.trim().slice(0, 200) });
        }
      });
    }
  }
  return { scanned, hits, knownSkills: knownSkills.size };
}

function deadNameList(hits) {
  const byName = new Map();
  for (const hit of hits) {
    if (!byName.has(hit.name)) byName.set(hit.name, { name: hit.name, kind: hit.kind, references: [] });
    byName.get(hit.name).references.push({ file: hit.file, line: hit.line });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function resolveAssertionFile(entry, baseDir) {
  const alias = /^(SC|SA|ST|SO|SM|WS|K)(?=[\\/])/.test(entry);
  if (alias || path.isAbsolute(entry)) return resolveAlias(entry);
  return path.resolve(baseDir, entry);
}

function readAssertionTargets(entry, baseDir) {
  const names = Array.isArray(entry.files) ? entry.files : [entry.file];
  const texts = [];
  const unreadable = [];
  for (const name of names) {
    const target = resolveAssertionFile(name, baseDir);
    try {
      texts.push(fs.readFileSync(target, 'utf8'));
    } catch {
      unreadable.push(target);
    }
  }
  return { label: entry.id || names.join(','), text: unreadable.length ? null : texts.join('\n'), unreadable };
}

function runAssertions(assertionFile) {
  const results = [];
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(assertionFile, 'utf8'));
  } catch (error) {
    return { error: `cannot read assertions ${assertionFile}: ${error.message}`, results };
  }
  if (!Array.isArray(entries) || !entries.length) return { error: `assertions file has no entries: ${assertionFile}`, results };
  for (const entry of entries) {
    if (!entry || (typeof entry.file !== 'string' && !Array.isArray(entry.files))) return { error: 'assertion entry without file or files', results };
    const must = entry.mustContain || [];
    const mustNot = entry.mustNotContain || [];
    const mustMatch = entry.mustMatch || [];
    if (!must.length && !mustNot.length && !mustMatch.length) return { error: `assertion ${entry.id || entry.file} has no phrases`, results };
    if ([...must, ...mustNot, ...mustMatch].some((phrase) => typeof phrase !== 'string' || !phrase)) return { error: `assertion ${entry.id || entry.file} has an empty or non-string phrase`, results };
    const { label, text, unreadable } = readAssertionTargets(entry, path.dirname(assertionFile));
    const detail = text === null ? `file not readable: ${unreadable.join(', ')}` : '';
    const emit = (kind, phrase, ok) => results.push({ label, kind, phrase, ok: text !== null && ok, detail });
    for (const phrase of must) emit('mustContain', phrase, text !== null && text.includes(phrase));
    for (const phrase of mustNot) emit('mustNotContain', phrase, text !== null && !text.includes(phrase));
    for (const phrase of mustMatch) {
      let ok = false;
      try {
        ok = text !== null && new RegExp(phrase, 'u').test(text);
      } catch (error) {
        return { error: `assertion ${label} has an invalid regex ${JSON.stringify(phrase)}: ${error.message}`, results };
      }
      emit('mustMatch', phrase, ok);
    }
  }
  return { error: null, results };
}

function parseArgs(argv) {
  const options = { roots: [], excludeDirs: [], json: false, deadNamesOut: null, assertPhrases: null, errors: [] };
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
    if (arg === '--roots') options.roots.push(...value().split(',').map((entry) => entry.trim()).filter(Boolean));
    else if (arg === '--exclude-dir') options.excludeDirs.push(value());
    else if (arg === '--json') options.json = true;
    else if (arg === '--dead-names-out') options.deadNamesOut = path.resolve(value());
    else if (arg === '--assert-phrases') options.assertPhrases = path.resolve(value());
    else options.errors.push(`unknown argument: ${arg}`);
  }
  if (!options.assertPhrases && !options.roots.length) options.errors.push('--roots <csv> or --assert-phrases <json> is required');
  if (options.assertPhrases && options.roots.length) options.errors.push('--roots and --assert-phrases are separate modes');
  return options;
}

function mainAssertions(options) {
  const { error, results } = runAssertions(options.assertPhrases);
  if (error) {
    console.error(error);
    return 2;
  }
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.label} ${result.kind} ${JSON.stringify(result.phrase)}${result.detail ? ` (${result.detail})` : ''}`);
  const failed = results.filter((result) => !result.ok).length;
  console.log(`PASS ${results.length - failed}`);
  console.log(`FAIL ${failed}`);
  return failed ? 1 : 0;
}

function mainRoutes(options) {
  const roots = options.roots.map(resolveAlias);
  for (const root of roots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      console.error(`root not found: ${root}`);
      return 2;
    }
  }
  const { scanned, hits, knownSkills } = lintRoutes({ roots, excludeDirs: options.excludeDirs });
  if (!scanned) {
    console.error('no text files found under the given roots');
    return 2;
  }
  const deadNames = deadNameList(hits);
  if (options.deadNamesOut) {
    fs.mkdirSync(path.dirname(options.deadNamesOut), { recursive: true });
    fs.writeFileSync(options.deadNamesOut, `${JSON.stringify(deadNames, null, 2)}\n`);
  }
  if (options.json) console.log(JSON.stringify({ roots, excludeDirs: options.excludeDirs, scanned, knownSkills, hits, deadNames }, null, 2));
  else {
    for (const hit of hits) console.log(`${hit.kind} ${hit.name}: ${hit.file}:${hit.line}`);
    console.log(`files scanned: ${scanned}; known skills: ${knownSkills}; dead names: ${deadNames.length}; hits: ${hits.length}`);
  }
  return hits.length ? 1 : 0;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.errors.length) {
    for (const message of options.errors) console.error(message);
    return 3;
  }
  if (options.assertPhrases) return mainAssertions(options);
  return mainRoutes(options);
}

if (require.main === module) process.exitCode = main();

module.exports = { lintRoutes, runAssertions, resolveAlias };
