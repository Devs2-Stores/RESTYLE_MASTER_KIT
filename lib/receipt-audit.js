'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { walkTheme } = require('./theme-walk');

const RECEIPT_VERSIONS = new Set(['1.1', '1.2', '1.3']);
const LEGACY_VERSION = '1.1';
const SHELL_SCREEN = 'shell';
const HOSTED_AUTH_STATUS = 'verified-static-hosted-auth';
const MAX_LISTED = 8;

const CODE_SLUG = {
  RECEIPT_WRONG_ROOT: 'wrong-root-receipt',
  COVERAGE_BELOW_FLOOR: 'zero-coverage',
  RECEIPT_STALE: 'stale-receipt',
  RECEIPT_DEGRADED: 'degraded-run'
};
const UNMEASURED_CODES = new Set(['RECEIPTS_MISSING', 'SCREEN_PATH_MISSING', 'PREVIEW_UNREACHABLE']);

function normalizeRoot(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function normalizePathname(value) {
  if (typeof value !== 'string' || !value) return null;
  let pathname;
  try {
    pathname = new URL(value, 'http://receipt.invalid').pathname;
  } catch (_) {
    return null;
  }
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function cellKey(pathname, width) {
  return `${pathname}@${width}`;
}

function failure(code, detail) {
  return { code, rule: CODE_SLUG[code] || null, detail };
}

function listed(items) {
  const head = items.slice(0, MAX_LISTED).join(', ');
  return items.length > MAX_LISTED ? `${head} (+${items.length - MAX_LISTED} more)` : head;
}

/** Contract screens with a path become cells; the shell screen inherits home and has none. Screens with status verified-static-hosted-auth render on the hosted SSO, off-theme, so no theme receipt can match them; they are listed in skippedHostedAuth. A non-shell screen without a path is reported, never guessed. */
function expectedCells(contract, widths) {
  const screens = contract && Array.isArray(contract.screens) ? contract.screens : [];
  const cells = [];
  const missingPath = [];
  const skippedHostedAuth = [];
  const seen = new Set();
  for (const screen of screens) {
    const name = screen && screen.name ? String(screen.name) : 'unnamed';
    if (name === SHELL_SCREEN) continue;
    if (screen && screen.status === HOSTED_AUTH_STATUS) {
      skippedHostedAuth.push(name);
      continue;
    }
    const pathname = screen && typeof screen.path === 'string' ? normalizePathname(screen.path) : null;
    if (!pathname) {
      missingPath.push(name);
      continue;
    }
    for (const width of widths) {
      const key = cellKey(pathname, width);
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ screen: name, path: screen.path, pathname, width });
    }
  }
  return { cells, missingPath, skippedHostedAuth };
}

function readContentIndex(indexFile) {
  if (!indexFile || !fs.existsSync(indexFile)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    return parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : {};
  } catch (_) {
    return {};
  }
}

/**
 * Newest theme change. With an index file, a file whose bytes still hash to the indexed digest keeps the
 * mtime recorded when that content was first seen, so a touch (formatter, sync re-download) does not stale receipts.
 */
function newestThemeMtime(root, indexFile = null) {
  const files = walkTheme(root, { ext: /./ });
  const index = readContentIndex(indexFile);
  const nextIndex = {};
  let newest = 0;
  for (const file of files) {
    const mtimeMs = fs.statSync(file).mtimeMs;
    let effective = mtimeMs;
    if (indexFile) {
      const key = path.relative(root, file).replace(/\\/g, '/');
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const known = index[key];
      if (known && known.sha256 === sha256 && Number.isFinite(known.mtimeMs)) effective = Math.min(mtimeMs, known.mtimeMs);
      nextIndex[key] = { sha256, mtimeMs: effective };
    }
    newest = Math.max(newest, effective);
  }
  if (indexFile) {
    fs.mkdirSync(path.dirname(indexFile), { recursive: true });
    fs.writeFileSync(indexFile, JSON.stringify({ version: 1, files: nextIndex }, null, 2));
  }
  return { newestMs: newest, files: files.length };
}

function readReceiptDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter((name) => /\.json$/i.test(name))
    .map((name) => {
      const file = path.join(dir, name);
      const mtimeMs = fs.statSync(file).mtimeMs;
      try {
        const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return { name, file, mtimeMs, receipt: null, error: 'not a JSON object' };
        if (!RECEIPT_VERSIONS.has(String(receipt.receiptVersion))) return { name, file, mtimeMs, receipt: null, error: `unsupported receiptVersion ${JSON.stringify(receipt.receiptVersion)}` };
        return { name, file, mtimeMs, receipt, error: null };
      } catch (error) {
        return { name, file, mtimeMs, receipt: null, error: error.message };
      }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || (a.name < b.name ? 1 : -1));
}

function receiptPathname(receipt) {
  return normalizePathname(receipt.observedUrl);
}

function receiptWidth(receipt) {
  return receipt.viewport && Number.isFinite(receipt.viewport.width) ? receipt.viewport.width : null;
}

function isRedirected(receipt) {
  return receipt.workspaceRootRedirected === true;
}

function isComplete(receipt) {
  return receipt.verdict === 'QA_PASSED' && receipt.passed === true && receipt.execution === 'COMPLETED' && receipt.errorCode === null;
}

function nativeCoverageShort(receipt) {
  const c = receipt.coverage;
  if (!c || !Number.isFinite(c.measured) || !Number.isFinite(c.expected) || c.expected <= 0) return false;
  return c.measured < c.expected;
}

function debtOutcome(root, debtFile, passingMtimes) {
  if (!fs.existsSync(debtFile)) return { failures: [], notes: [] };
  let debt;
  try {
    debt = JSON.parse(fs.readFileSync(debtFile, 'utf8'));
  } catch (error) {
    return { failures: [failure('RECEIPT_UNPARSEABLE', `qa debt file ${debtFile}: ${error.message}`)], notes: [] };
  }
  const files = Array.isArray(debt.files) ? debt.files : [];
  if (!files.length) return { failures: [], notes: [] };
  if (normalizeRoot(debt.root) !== normalizeRoot(root)) {
    return { failures: [], notes: [`qa debt root ${JSON.stringify(debt.root)} differs from theme root; ignored`] };
  }
  const since = typeof debt.since === 'number' ? debt.since : Date.parse(debt.since);
  if (!Number.isFinite(since)) {
    return { failures: [failure('RECEIPT_UNPARSEABLE', `qa debt file ${debtFile} has no usable since timestamp`)], notes: [] };
  }
  const cleared = passingMtimes.some((m) => m > since);
  if (cleared) return { failures: [], notes: [] };
  return { failures: [failure('RECEIPT_STALE', `qa debt open since ${new Date(since).toISOString()} for ${files.length} file(s) (${listed(files)}) with no newer passing receipt`)], notes: [] };
}

/**
 * Receipt truth: only QA_PASSED/COMPLETED receipts for this theme root, newer than the newest theme content change, cover a cell.
 * Freshness uses file mtime only (the hook's own clock), never createdAt; contentIndexFile lets an unchanged-bytes touch keep its earlier mtime.
 */
function auditReceipts(options) {
  const { root, receiptsDir, contract, widths, coverageFloor, debtFile, contentIndexFile } = options;
  const failures = [];
  const notes = [];
  const rootKey = normalizeRoot(root);
  const { cells: expected, missingPath, skippedHostedAuth } = expectedCells(contract, widths);
  const theme = newestThemeMtime(root, contentIndexFile || null);
  const entries = readReceiptDir(receiptsDir);

  if (missingPath.length) {
    failures.push(failure('SCREEN_PATH_MISSING', `contract screen(s) without a path: ${listed(missingPath)}`));
  }
  if (!entries.length) {
    failures.push(failure('RECEIPTS_MISSING', `no receipts in ${receiptsDir}`));
    return { failures, notes, cells: expected.map((c) => ({ source: 'receipt', screen: c.screen, path: c.path, width: c.width, status: 'missing', durationMs: 0 })), expected: expected.length, measured: 0, skippedHostedAuth };
  }

  const newest = entries[0];
  if (!newest.receipt) {
    failures.push(failure('RECEIPT_UNPARSEABLE', `newest receipt ${newest.name} is unusable: ${newest.error}`));
  }
  for (const entry of entries.slice(1)) {
    if (!entry.receipt) notes.push(`older receipt ${entry.name} is unusable: ${entry.error}`);
  }

  const parsed = entries.filter((e) => e.receipt);
  const wrongRoot = parsed.filter((e) => normalizeRoot(e.receipt.workspaceRoot) !== rootKey || isRedirected(e.receipt));
  if (wrongRoot.length) {
    const roots = [...new Set(wrongRoot.map((e) => String(e.receipt.workspaceRoot)))];
    failures.push(failure('RECEIPT_WRONG_ROOT', `${wrongRoot.length} receipt(s) in this theme's receipt dir carry another or redirected workspaceRoot (${listed(roots)}): ${listed(wrongRoot.map((e) => e.name))}`));
  }

  const mine = parsed.filter((e) => !wrongRoot.includes(e));
  const legacy = mine.filter((e) => String(e.receipt.receiptVersion) === LEGACY_VERSION);
  if (legacy.length) {
    failures.push(failure('RECEIPT_DEGRADED', `${legacy.length} receipt(s) for this theme root are v1.1 (no viewport, no execution) and can never cover a cell: ${listed(legacy.map((e) => e.name))}`));
  }
  const byCell = new Map();
  for (const entry of mine) {
    if (legacy.includes(entry)) continue;
    const pathname = receiptPathname(entry.receipt);
    const width = receiptWidth(entry.receipt);
    if (!pathname || width === null) continue;
    const key = cellKey(pathname, width);
    if (!byCell.has(key)) byCell.set(key, entry);
  }

  const cells = [];
  const stale = [];
  const degraded = [];
  const failed = [];
  const missing = [];
  const passingMtimes = [];
  let measured = 0;
  for (const cell of expected) {
    const entry = byCell.get(cellKey(cell.pathname, cell.width));
    const label = `${cell.screen}@${cell.width}`;
    let status;
    if (!entry) {
      status = 'missing';
      missing.push(label);
    } else if (entry.mtimeMs < theme.newestMs) {
      status = 'stale';
      stale.push(`${label} (${entry.name})`);
    } else if (entry.receipt.execution !== 'COMPLETED' || entry.receipt.errorCode !== null || entry.receipt.passed === null || nativeCoverageShort(entry.receipt)) {
      status = 'degraded';
      degraded.push(`${label} (${entry.name}: execution=${entry.receipt.execution} errorCode=${entry.receipt.errorCode})`);
    } else if (!isComplete(entry.receipt)) {
      status = 'failed';
      failed.push(`${label} (${entry.name}: ${entry.receipt.verdict})`);
    } else {
      status = 'measured';
      measured += 1;
      passingMtimes.push(entry.mtimeMs);
    }
    cells.push({ source: 'receipt', screen: cell.screen, path: cell.path, width: cell.width, status, durationMs: 0, receipt: entry ? entry.name : null });
  }

  if (stale.length) failures.push(failure('RECEIPT_STALE', `${stale.length} cell receipt(s) older than the newest theme file (${new Date(theme.newestMs).toISOString()}): ${listed(stale)}`));
  if (degraded.length) failures.push(failure('RECEIPT_DEGRADED', `${degraded.length} cell receipt(s) are degraded or incomplete: ${listed(degraded)}`));
  if (expected.length && measured / expected.length < coverageFloor) {
    const parts = [`measured ${measured} of ${expected.length} cells (${(measured / expected.length).toFixed(3)} < floor ${coverageFloor})`];
    if (missing.length) parts.push(`no receipt: ${listed(missing)}`);
    if (failed.length) parts.push(`QA_FAILED: ${listed(failed)}`);
    failures.push(failure('COVERAGE_BELOW_FLOOR', parts.join('; ')));
  }

  const debt = debtFile ? debtOutcome(root, debtFile, passingMtimes) : { failures: [], notes: [] };
  failures.push(...debt.failures);
  notes.push(...debt.notes);
  return { failures, notes, cells, expected: expected.length, measured, skippedHostedAuth };
}

function hostOf(receipt) {
  for (const key of ['observedUrl', 'expectedUrl']) {
    if (typeof receipt[key] === 'string') {
      try {
        return new URL(receipt[key]).host;
      } catch (_) {}
    }
  }
  return null;
}

/** Groups receipts by workspaceRoot and observed host. Reads only; nothing is deleted or moved. */
function classifyReceipts(dir, options = {}) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`receipts directory not found: ${dir}`);
  const entries = readReceiptDir(dir);
  const rootKey = options.root ? normalizeRoot(options.root) : null;
  const groups = new Map();
  const unparseable = [];
  for (const entry of entries) {
    if (!entry.receipt) {
      unparseable.push({ file: entry.name, error: entry.error });
      continue;
    }
    const workspaceRoot = entry.receipt.workspaceRoot == null ? null : String(entry.receipt.workspaceRoot);
    const host = hostOf(entry.receipt);
    const key = `${normalizeRoot(workspaceRoot)}|${host}`;
    const group = groups.get(key) || { workspaceRoot, host, count: 0, newestMtime: 0, matchesRoot: rootKey ? normalizeRoot(workspaceRoot) === rootKey : null, files: [] };
    group.count += 1;
    group.newestMtime = Math.max(group.newestMtime, entry.mtimeMs);
    group.files.push(entry.name);
    groups.set(key, group);
  }
  const list = [...groups.values()]
    .map((g) => ({ ...g, newestMtime: new Date(g.newestMtime).toISOString(), files: g.files.sort() }))
    .sort((a, b) => b.count - a.count || String(a.host).localeCompare(String(b.host)));
  return { dir: path.resolve(dir), total: entries.length, unparseable, groups: list };
}

module.exports = {
  CODE_SLUG,
  UNMEASURED_CODES,
  normalizeRoot,
  normalizePathname,
  expectedCells,
  newestThemeMtime,
  readReceiptDir,
  auditReceipts,
  classifyReceipts
};
