#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readValue, parseCsv } = require('./lib/cli-args');
const { walkTheme } = require('./lib/theme-walk');

const ASSET_PATTERN = /\.(?:js|mjs|js\.liquid|scss|scss\.liquid)$/i;
const BLOCK_TAGS = new Set(['if', 'unless', 'case', 'for', 'tablerow', 'capture', 'form', 'paginate', 'style']);
const TOKEN = /\{%-?([\s\S]*?)-?%\}|\{\{-?([\s\S]*?)-?\}\}/g;

function usage() {
  console.log(`Usage:
  node asset_syntax_check.js --root <theme-root> [--files <a.js,b.js.liquid>] [--json]

Syntax gate for theme assets, run after every asset edit:
  - assets/*.js and *.mjs        node --check
  - assets/*.js.liquid           Liquid stub render (settings and shop empty, first branch of each conditional), then node --check
  - assets/*.scss(.liquid)       stub render, then a sass compile when the sass package is installed
Exit: 0 clean, 1 syntax error, 2 UNMEASURED (sass missing for a .scss file); nothing is skipped silently.`);
}

function parseArgs(argv) {
  const args = { root: path.resolve(process.cwd(), '..'), files: null, json: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, i, '--root')); i += 1; }
    else if (value === '--files') { args.files = parseCsv(readValue(argv, i, '--files')); i += 1; }
    else if (value === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

/** Drops everything but the newlines so rendered line numbers stay equal to source line numbers. */
function blank(text) {
  return text.replace(/[^\n]/g, '');
}

/** Whether the emitted prefix ends inside a string, template literal or comment (outputs there become text, elsewhere a number). */
function endsInsideText(emitted, kind) {
  let state = 'code';
  for (let i = 0; i < emitted.length; i += 1) {
    const ch = emitted[i];
    const next = emitted[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '*') { state = 'block'; i += 1; }
      else if (ch === '/' && next === '/' && (kind === 'js' || kind === 'scss')) { state = 'line'; i += 1; }
      else if (ch === '\'') state = 'sq';
      else if (ch === '"') state = 'dq';
      else if (ch === '`' && kind === 'js') state = 'tpl';
    } else if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; i += 1; }
    } else if (state === 'line') {
      if (ch === '\n') state = 'code';
    } else {
      const quote = state === 'sq' ? '\'' : state === 'dq' ? '"' : '`';
      if (ch === '\\') i += 1;
      else if (ch === quote || (ch === '\n' && state !== 'tpl')) state = 'code';
    }
  }
  return state !== 'code';
}

/**
 * Renders Liquid into plain source for a syntax check. Conditionals keep their first branch, loops their body once,
 * captures vanish, and output tags become a string or a number depending on where they sit.
 * Returns { text, problems } where problems are structural Liquid errors with 1-based lines.
 */
function renderLiquidStub(source, kind) {
  const problems = [];
  const stack = [];
  let out = '';
  let cursor = 0;
  const lineAt = (index) => source.slice(0, index).split('\n').length;
  const suppressed = () => stack.some((frame) => frame.suppress);
  const emitText = (text) => { out += suppressed() ? blank(text) : text; };
  TOKEN.lastIndex = 0;
  let match;
  while ((match = TOKEN.exec(source))) {
    emitText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (match[2] !== undefined) {
      if (suppressed()) out += blank(match[0]);
      else out += (endsInsideText(out, kind) ? 'x' : '0') + blank(match[0]);
      continue;
    }
    const body = match[1];
    const name = (/^\s*(#|\w+)/.exec(body) || [null, ''])[1];
    const whole = blank(match[0]);
    if (name === 'raw' || name === 'comment') {
      const close = new RegExp(`\\{%-?\\s*end${name}\\s*-?%\\}`, 'g');
      close.lastIndex = cursor;
      const end = close.exec(source);
      if (!end) {
        problems.push({ line: lineAt(match.index), message: `{% ${name} %} is never closed` });
        out += whole;
        continue;
      }
      const inner = source.slice(cursor, end.index);
      out += name === 'raw' && !suppressed() ? inner : blank(inner);
      out += whole + blank(end[0]);
      cursor = end.index + end[0].length;
      TOKEN.lastIndex = cursor;
      continue;
    }
    out += whole;
    if (BLOCK_TAGS.has(name)) {
      const suppress = name === 'capture' || name === 'case';
      stack.push({ name, line: lineAt(match.index), branch: 0, suppress });
    } else if (name === 'elsif' || name === 'else' || name === 'when') {
      const frame = stack[stack.length - 1];
      if (!frame || !['if', 'unless', 'case', 'for'].includes(frame.name)) {
        problems.push({ line: lineAt(match.index), message: `{% ${name} %} outside a conditional` });
      } else {
        frame.branch += 1;
        frame.suppress = frame.name === 'case' ? frame.branch !== 1 : true;
      }
    } else if (/^end\w+$/.test(name)) {
      const expected = name.slice(3);
      const frame = stack[stack.length - 1];
      if (!frame || frame.name !== expected) {
        problems.push({ line: lineAt(match.index), message: `{% ${name} %} does not match ${frame ? `the open {% ${frame.name} %} from line ${frame.line}` : 'any open block'}` });
        if (frame && stack.some((f) => f.name === expected)) {
          while (stack.length && stack[stack.length - 1].name !== expected) stack.pop();
          stack.pop();
        }
      } else {
        stack.pop();
      }
    }
  }
  emitText(source.slice(cursor));
  for (const frame of stack) problems.push({ line: frame.line, message: `{% ${frame.name} %} is never closed` });
  const rest = /\{%|\{\{/.exec(source.slice(cursor));
  if (rest) problems.push({ line: lineAt(cursor + rest.index), message: `unterminated Liquid ${rest[0] === '{%' ? 'tag' : 'output'}` });
  return { text: out, problems };
}

function nodeBin() {
  return /^node(?:\.exe)?$/i.test(path.basename(process.execPath || '')) ? process.execPath : 'node';
}

function checkJsFile(file) {
  const res = spawnSync(nodeBin(), ['--check', file], { encoding: 'utf8', timeout: 30000 });
  if (res.error) return { status: 'unmeasured', message: `node --check could not run: ${res.error.message}` };
  if (res.status === 0) return { status: 'ok' };
  const stderr = String(res.stderr || '');
  const line = /:(\d+)\s*$/m.exec(stderr);
  const message = /^(\w*Error: .*)$/m.exec(stderr);
  return { status: 'fail', line: line ? Number(line[1]) : null, message: message ? message[1] : stderr.trim().split('\n')[0] || `node --check exited ${res.status}` };
}

function loadSass(root) {
  try {
    return require(require.resolve('sass', { paths: [root, __dirname, process.cwd()] }));
  } catch (_) {
    return null;
  }
}

function checkAsset(root, file, sassRef) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const isLiquid = /\.liquid$/i.test(file);
  const isScss = /\.scss(?:\.liquid)?$/i.test(file);
  const source = fs.readFileSync(file, 'utf8');
  let text = source;
  if (isLiquid) {
    const rendered = renderLiquidStub(source, isScss ? 'scss' : 'js');
    if (rendered.problems.length) {
      const first = rendered.problems[0];
      return { file: rel, status: 'fail', line: first.line, message: `Liquid structure: ${first.message}${rendered.problems.length > 1 ? ` (+${rendered.problems.length - 1} more)` : ''}` };
    }
    text = rendered.text;
  }
  if (isScss) {
    if (!sassRef.value) sassRef.value = loadSass(root) || false;
    if (!sassRef.value) return { file: rel, status: 'unmeasured', message: 'sass package is not installed; the stylesheet was not compiled' };
    try {
      sassRef.value.compileString(text, { syntax: 'scss', logger: sassRef.value.Logger ? sassRef.value.Logger.silent : undefined });
      return { file: rel, status: 'ok' };
    } catch (error) {
      const line = error && error.span && error.span.start ? error.span.start.line + 1 : null;
      return { file: rel, status: 'fail', line, message: String(error && error.sassMessage || error.message || error).split('\n')[0] };
    }
  }
  if (!isLiquid) return { file: rel, ...checkJsFile(file) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-syntax-'));
  try {
    const target = path.join(tmp, 'rendered.js');
    fs.writeFileSync(target, text, 'utf8');
    return { file: rel, ...checkJsFile(target) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function collectFiles(root, requested, notes) {
  if (!requested) return walkTheme(root, { dirs: ['assets'], ext: ASSET_PATTERN }).sort();
  const files = [];
  for (const name of requested) {
    const full = path.isAbsolute(name) ? name : path.join(root, name);
    if (!ASSET_PATTERN.test(full)) notes.push(`${name}: not a checked asset type`);
    else if (!fs.existsSync(full)) notes.push(`${name}: file not found`);
    else files.push(full);
  }
  return files;
}

function run(opts) {
  const root = path.resolve(opts.root);
  const notes = [];
  const files = collectFiles(root, opts.files, notes);
  const sassRef = { value: undefined };
  const results = files.map((file) => checkAsset(root, file, sassRef));
  const failed = results.filter((r) => r.status === 'fail');
  const unmeasured = results.filter((r) => r.status === 'unmeasured');
  const missingRequested = Boolean(opts.files) && notes.some((n) => /file not found/.test(n));
  const exitCode = failed.length || missingRequested ? 1 : unmeasured.length ? 2 : 0;
  return { exitCode, results, notes, root };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); return 0; }
  const { exitCode, results, notes, root } = run(args);
  if (args.json) {
    console.log(JSON.stringify({ root, verdict: exitCode === 0 ? 'PASS' : exitCode === 1 ? 'FAIL' : 'UNMEASURED', results, notes }, null, 2));
    return exitCode;
  }
  console.log('# Asset Syntax Check');
  console.log(`Root: ${root}`);
  console.log(`Assets checked: ${results.length}`);
  for (const note of notes) console.log(`- note: ${note}`);
  for (const result of results) {
    if (result.status === 'ok') continue;
    const where = result.line ? `${result.file}:${result.line}` : result.file;
    console.log(`- ${result.status === 'fail' ? 'FAIL' : 'UNMEASURED'} ${where} ${result.message}`);
  }
  if (exitCode === 0) console.log('PASS: every asset parses.');
  else if (exitCode === 1) console.error('FAIL: asset syntax errors block the slice.');
  else console.error('UNMEASURED: some assets were not compiled; this is not a pass.');
  return exitCode;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { renderLiquidStub, run, parseArgs };
