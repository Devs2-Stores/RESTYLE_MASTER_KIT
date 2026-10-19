#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readValue, parseCsv, parseFiniteNumber } = require('./lib/cli-args');
const { SOURCE_DIRS } = require('./lib/theme-walk');
const { readZipEntriesWithData } = require('./lib/zip');
const receiptAudit = require('./lib/receipt-audit');
const { findContract, readContract } = require('./lib/remake-contract');

const CHECKS = ['readiness', 'qa-gate', 'residue-scan', 'claim-scan', 'description-check', 'image-health', 'zip-freshness'];
const DEFAULT_WIDTHS = [320, 375, 768, 1024, 1440];
const TEXT_ENTRY = /\.(?:liquid|js|css|html|json|txt|md|xml)$/i;
const PASS = 'PASS';
const FAIL = 'FAIL';
const UNMEASURED = 'UNMEASURED';

function usage() {
  console.log(`Usage:
  node pre_showcase_gate.js --root <theme-root> [--contract <file>] [--out <final-showcase-dir>]
    [--config <demo-kit-config.json> --base <shopUrl> --theme-id <id>] [--demo-kit <dir>] [--navigations <navigations.json>]
    [--brand <csv>] [--source-domain-words <csv>] [--capture-manifest <file>] [--zip <file>]...
    [--coverage-floor <0-1>] [--only <check,check>] [--json]

Handoff gate that must be clear before the final showcase is captured or the package is handed over.
Checks: ${CHECKS.join(', ')}.
  readiness          HaravanDemoKit readiness --live (needs --config, --base, --theme-id, the kit under --demo-kit,
                     env HARAVAN_DEMO_KIT or ../HaravanDemoKit, and its admin token); --navigations is forwarded as-is,
                     without it <demo-kit>/output/<project_key>/navigations.json is used when present
  qa-gate            QA receipts cover every contract screen x width, are fresh, and carry certification CERTIFIED
  residue-scan       residue_scan.js --final
  claim-scan         claim_scan.js
  description-check  <out>/THEME_DESCRIPTION.html passes description_check.js
  image-health       capture manifest records 0 images with naturalWidth 0 (field imageHealth)
  zip-freshness      every theme file inside the export zip still equals the file on disk
A check whose input is absent reports UNMEASURED; it is never a pass. --only runs a named subset and lists the rest as not run.
Exit: 0 clear, 1 a check failed, 2 UNMEASURED (no failure), 3 usage.`);
}

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'), contract: null, out: null, config: null, base: null, themeId: null, demoKit: null,
    brands: [], sourceDomainWords: [], captureManifest: null, zips: [], coverageFloor: null, only: null, json: false, help: false, navigations: null
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--json') args.json = true;
    else if (value === '--root') { args.root = path.resolve(readValue(argv, i, value)); i += 1; }
    else if (value === '--contract') { args.contract = path.resolve(readValue(argv, i, value)); i += 1; }
    else if (value === '--out') { args.out = path.resolve(readValue(argv, i, value)); i += 1; }
    else if (value === '--config') { args.config = path.resolve(readValue(argv, i, value)); i += 1; }
    else if (value === '--base') { args.base = readValue(argv, i, value); i += 1; }
    else if (value === '--theme-id') { args.themeId = readValue(argv, i, value); i += 1; }
    else if (value === '--demo-kit') { args.demoKit = path.resolve(readValue(argv, i, value)); i += 1; }
    else if (value === '--navigations') { args.navigations = path.resolve(readValue(argv, i, value)); i += 1; }
    else if (value === '--brand' || value === '--brands') { args.brands.push(...parseCsv(readValue(argv, i, value))); i += 1; }
    else if (value === '--source-domain-words') { args.sourceDomainWords.push(...parseCsv(readValue(argv, i, value))); i += 1; }
    else if (value === '--capture-manifest') { args.captureManifest = path.resolve(readValue(argv, i, value)); i += 1; }
    else if (value === '--zip') { args.zips.push(path.resolve(readValue(argv, i, value))); i += 1; }
    else if (value === '--coverage-floor') { args.coverageFloor = parseFiniteNumber(readValue(argv, i, value), value); i += 1; }
    else if (value === '--only') {
      args.only = parseCsv(readValue(argv, i, value));
      const unknown = args.only.filter((name) => !CHECKS.includes(name));
      if (unknown.length) throw new Error(`Unknown check in --only: ${unknown.join(', ')} (known: ${CHECKS.join(', ')})`);
      i += 1;
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (args.coverageFloor !== null && !(args.coverageFloor > 0 && args.coverageFloor <= 1)) throw new Error('--coverage-floor must be in (0, 1]');
  if (!args.out) args.out = path.join(args.root, 'final-showcase');
  return args;
}

function nodeBin() {
  return /^node(?:\.exe)?$/i.test(path.basename(process.execPath || '')) ? process.execPath : 'node';
}

function runKitScript(script, scriptArgs) {
  const res = spawnSync(nodeBin(), [path.join(__dirname, script), ...scriptArgs], { encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
  const output = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { status: res.error ? null : res.status, error: res.error, output };
}

function tail(output, lines = 6) {
  return output.split(/\r?\n/).filter(Boolean).slice(-lines).join(' | ');
}

function result(name, status, detail) {
  return { name, status, detail };
}

function loadContract(args) {
  const file = findContract(args.root, args.contract);
  if (!fs.existsSync(file)) return { file, error: `full remake contract not found: ${file}` };
  try {
    return { file, contract: readContract(file) };
  } catch (error) {
    return { file, error: `full remake contract is not valid JSON (${file}): ${error.message}` };
  }
}

function resolveDemoKit(args) {
  return args.demoKit || (process.env.HARAVAN_DEMO_KIT ? path.resolve(process.env.HARAVAN_DEMO_KIT) : path.resolve(__dirname, '..', 'HaravanDemoKit'));
}

function resolveNavigations(args, demoKit) {
  if (args.navigations) return args.navigations;
  if (!args.config) return null;
  let projectKey = null;
  try {
    projectKey = JSON.parse(fs.readFileSync(args.config, 'utf8')).project_key;
  } catch (_) {
    return null;
  }
  if (typeof projectKey !== 'string' || !projectKey.trim()) return null;
  const candidate = path.join(demoKit, 'output', projectKey.trim(), 'navigations.json');
  return fs.existsSync(candidate) ? candidate : null;
}

function checkReadiness(args, loaded) {
  const missing = [];
  if (!args.config) missing.push('--config');
  if (!args.base) missing.push('--base');
  if (!args.themeId) missing.push('--theme-id');
  if (!loaded.contract) missing.push('contract');
  if (missing.length) return result('readiness', UNMEASURED, `readiness --live was not run; missing ${missing.join(', ')}`);
  const demoKit = resolveDemoKit(args);
  const cli = path.join(demoKit, 'src', 'cli.js');
  if (!fs.existsSync(cli)) return result('readiness', UNMEASURED, `HaravanDemoKit CLI not found at ${cli}; pass --demo-kit or set HARAVAN_DEMO_KIT`);
  const readinessArgs = [cli, 'readiness', '--config', args.config, '--contract', loaded.file, '--theme', args.root, '--live', '--base', args.base, '--theme-id', args.themeId];
  const navigations = resolveNavigations(args, demoKit);
  if (navigations) readinessArgs.push('--navigations', navigations);
  const res = spawnSync(nodeBin(), readinessArgs, { encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
  const output = `${res.stdout || ''}${res.stderr || ''}`.trim();
  if (res.error) return result('readiness', UNMEASURED, `readiness could not run: ${res.error.message}`);
  if (res.status === 0) return result('readiness', PASS, 'demo data readiness passed against the live shop');
  if (res.status === 2) return result('readiness', UNMEASURED, `readiness reported UNMEASURED (token, endpoint or contract field absent): ${tail(output)}`);
  return result('readiness', FAIL, `readiness failed (exit ${res.status}): ${tail(output)}`);
}

function resolveQaSettings(args, contract) {
  const gate = contract && contract.qaGate && typeof contract.qaGate === 'object' ? contract.qaGate : {};
  const widths = Array.isArray(gate.widths) && gate.widths.length ? gate.widths : DEFAULT_WIDTHS;
  const coverageFloor = args.coverageFloor !== null ? args.coverageFloor : (Number.isFinite(gate.coverageFloor) ? gate.coverageFloor : 1);
  return { widths, coverageFloor };
}

function checkQaGate(args, loaded) {
  if (!loaded.contract) return result('qa-gate', UNMEASURED, loaded.error);
  const { widths, coverageFloor } = resolveQaSettings(args, loaded.contract);
  const receiptsDir = path.join(args.root, '.antifan', 'qa-receipts');
  const audit = receiptAudit.auditReceipts({ root: args.root, receiptsDir, contract: loaded.contract, widths, coverageFloor, debtFile: path.join(args.root, '.antifan', 'qa-debt.json'), contentIndexFile: path.join(args.root, '.antifan', 'qa-content-index.json') });
  const note = audit.skippedHostedAuth && audit.skippedHostedAuth.length ? ` [not expected, hosted auth off-theme: ${audit.skippedHostedAuth.join(', ')}]` : '';
  const hard = audit.failures.filter((f) => !receiptAudit.UNMEASURED_CODES.has(f.code));
  if (hard.length) return result('qa-gate', FAIL, hard.map((f) => `${f.code}: ${f.detail}`).join('; ') + note);
  if (audit.failures.length) return result('qa-gate', UNMEASURED, audit.failures.map((f) => `${f.code}: ${f.detail}`).join('; ') + note);
  if (!audit.expected) return result('qa-gate', UNMEASURED, `the contract declares no screen with a path, so no QA cell is expected${note}`);
  const uncertified = [];
  for (const cell of audit.cells) {
    if (cell.status !== 'measured') continue;
    let certification = null;
    try {
      certification = JSON.parse(fs.readFileSync(path.join(receiptsDir, cell.receipt), 'utf8')).certification || null;
    } catch (_) {
      certification = null;
    }
    if (certification !== 'CERTIFIED') uncertified.push(`${cell.screen}@${cell.width} (${cell.receipt}: ${certification || 'no certification field'})`);
  }
  if (uncertified.length) {
    const listed = uncertified.slice(0, 8).join(', ') + (uncertified.length > 8 ? ` (+${uncertified.length - 8} more)` : '');
    return result('qa-gate', FAIL, `${uncertified.length} of ${audit.measured} passing cell(s) are not CERTIFIED (structural pass only): ${listed}${note}`);
  }
  return result('qa-gate', PASS, `${audit.measured}/${audit.expected} cells are fresh, root-matched and CERTIFIED${note}`);
}

function checkResidue(args) {
  const scanArgs = ['--root', args.root, '--final'];
  if (args.brands.length) scanArgs.push('--brands', args.brands.join(','));
  if (args.sourceDomainWords.length) scanArgs.push('--source-domain-words', args.sourceDomainWords.join(','));
  for (const zip of args.zips) scanArgs.push('--zip', zip);
  const res = runKitScript('residue_scan.js', scanArgs);
  if (res.error) return result('residue-scan', UNMEASURED, `residue_scan could not run: ${res.error.message}`);
  if (res.status === 0) return result('residue-scan', PASS, 'no brand, donor-domain or generator residue');
  return result('residue-scan', FAIL, `residue_scan exit ${res.status}: ${tail(res.output)}`);
}

function checkClaims(args) {
  const res = runKitScript('claim_scan.js', ['--root', args.root]);
  if (res.error) return result('claim-scan', UNMEASURED, `claim_scan could not run: ${res.error.message}`);
  if (res.status === 0) return result('claim-scan', PASS, 'no fabricated commercial claims');
  return result('claim-scan', FAIL, `claim_scan exit ${res.status}: ${tail(res.output)}`);
}

function checkDescription(args) {
  const file = path.join(args.out, 'THEME_DESCRIPTION.html');
  if (!fs.existsSync(file)) return result('description-check', UNMEASURED, `no THEME_DESCRIPTION.html at ${file}`);
  const res = runKitScript('description_check.js', ['--file', file]);
  if (res.error) return result('description-check', UNMEASURED, `description_check could not run: ${res.error.message}`);
  if (res.status === 0) return result('description-check', PASS, 'THEME_DESCRIPTION.html is valid');
  return result('description-check', FAIL, `description_check exit ${res.status}: ${tail(res.output)}`);
}

function collectImageHealth(node, found = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 5) return found;
  if (node.imageHealth && typeof node.imageHealth === 'object') found.push(node.imageHealth);
  for (const value of Array.isArray(node) ? node : Object.values(node)) collectImageHealth(value, found, depth + 1);
  return found;
}

function checkImageHealth(args) {
  const file = args.captureManifest || path.join(args.out, 'CAPTURE_MANIFEST.json');
  if (!fs.existsSync(file)) return result('image-health', UNMEASURED, `no capture manifest at ${file}`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return result('image-health', FAIL, `capture manifest is not valid JSON (${file}): ${error.message}`);
  }
  const records = collectImageHealth(manifest);
  if (!records.length) return result('image-health', UNMEASURED, `${path.basename(file)} has no imageHealth record; the capture did not measure naturalWidth`);
  let total = 0;
  const broken = [];
  for (const record of records) {
    if (Number.isFinite(record.total)) total += record.total;
    if (Array.isArray(record.broken)) broken.push(...record.broken.map((item) => (typeof item === 'string' ? item : (item && (item.src || item.url)) || JSON.stringify(item))));
    else if (Number.isFinite(record.broken) && record.broken > 0) broken.push(`${record.broken} image(s) without a source`);
  }
  if (broken.length) return result('image-health', FAIL, `${broken.length} image(s) with naturalWidth 0: ${broken.slice(0, 5).join(', ')}${broken.length > 5 ? ` (+${broken.length - 5} more)` : ''}`);
  return result('image-health', PASS, `0 broken images across ${records.length} measured page(s) (${total} images)`);
}

function digest(buffer, name) {
  const body = TEXT_ENTRY.test(name) ? Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : buffer;
  return crypto.createHash('sha256').update(body).digest('hex');
}

function stripWrapper(names) {
  const tops = new Set(names.map((name) => name.split('/')[0]));
  if (tops.size === 1 && names.every((name) => name.includes('/')) && !SOURCE_DIRS.includes([...tops][0])) return (name) => name.split('/').slice(1).join('/');
  return (name) => name;
}

function compareZip(root, zip) {
  const entries = readZipEntriesWithData(zip).filter((entry) => !entry.name.endsWith('/'));
  const rel = stripWrapper(entries.map((entry) => entry.name));
  const stale = [];
  let compared = 0;
  for (const entry of entries) {
    const name = rel(entry.name);
    if (!name || name === 'config/settings_data.json') continue;
    const disk = path.join(root, name);
    if (!fs.existsSync(disk) || !fs.statSync(disk).isFile()) continue;
    compared += 1;
    if (digest(entry.data, name) !== digest(fs.readFileSync(disk), name)) stale.push(name);
  }
  return { compared, stale };
}

function discoverZips(args) {
  if (args.zips.length) return args.zips;
  return fs.existsSync(args.out)
    ? fs.readdirSync(args.out).filter((name) => /\.zip$/i.test(name)).map((name) => path.join(args.out, name))
    : [];
}

function checkZipFreshness(args) {
  const zips = discoverZips(args);
  if (!zips.length) return result('zip-freshness', UNMEASURED, `no export zip in ${args.out}; run the export first`);
  const problems = [];
  let total = 0;
  for (const zip of zips) {
    let compared;
    try {
      compared = compareZip(args.root, zip);
    } catch (error) {
      problems.push(`${path.basename(zip)} is unreadable: ${error.message}`);
      continue;
    }
    total += compared.compared;
    if (!compared.compared) problems.push(`${path.basename(zip)} holds no file that exists in the theme`);
    else if (compared.stale.length) problems.push(`${path.basename(zip)} differs from disk in ${compared.stale.length} file(s): ${compared.stale.slice(0, 5).join(', ')}${compared.stale.length > 5 ? ' ...' : ''}`);
  }
  if (problems.length) return result('zip-freshness', FAIL, problems.join('; '));
  return result('zip-freshness', PASS, `${zips.length} zip(s), ${total} theme file(s) identical to disk`);
}

function runGate(args) {
  const loaded = loadContract(args);
  const runners = {
    readiness: () => checkReadiness(args, loaded),
    'qa-gate': () => checkQaGate(args, loaded),
    'residue-scan': () => checkResidue(args),
    'claim-scan': () => checkClaims(args),
    'description-check': () => checkDescription(args),
    'image-health': () => checkImageHealth(args),
    'zip-freshness': () => checkZipFreshness(args)
  };
  const selected = args.only || CHECKS;
  const results = selected.map((name) => runners[name]());
  const notRun = CHECKS.filter((name) => !selected.includes(name));
  const verdict = results.some((r) => r.status === FAIL) ? FAIL : results.some((r) => r.status === UNMEASURED) ? UNMEASURED : PASS;
  return { verdict, exitCode: verdict === FAIL ? 1 : verdict === UNMEASURED ? 2 : 0, results, notRun };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    console.error(`pre_showcase_gate: ${error.message}`);
    return 3;
  }
  if (args.help) { usage(); return 0; }
  const outcome = runGate(args);
  if (args.json) {
    console.log(JSON.stringify({ root: args.root, ...outcome }, null, 2));
    return outcome.exitCode;
  }
  console.log('# Pre-showcase Gate');
  console.log(`Root: ${args.root}`);
  for (const r of outcome.results) console.log(`- ${r.status} ${r.name}: ${r.detail}`);
  if (outcome.notRun.length) console.log(`Not run (--only): ${outcome.notRun.join(', ')}`);
  const stream = outcome.exitCode === 0 ? console.log : console.error;
  stream(outcome.verdict === PASS ? 'PASS: pre-showcase gate clear.' : outcome.verdict === FAIL ? 'FAIL: pre-showcase gate blocked.' : 'UNMEASURED: at least one check could not be measured; this is not a pass.');
  return outcome.exitCode;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { CHECKS, parseArgs, runGate, checkImageHealth, checkZipFreshness, checkQaGate, resolveNavigations };
