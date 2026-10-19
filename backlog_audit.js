#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const STATUSES = new Set(['fixed', 'fixed-disk', 'declined', 'approval-pending', 'open']);
const NEEDS_REASON = new Set(['declined', 'approval-pending']);
const PRIORITIES = ['P0', 'P1', 'P2'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EXIT = { PASS: 0, FAIL: 1, UNMEASURED: 2, USAGE: 3 };

function usage(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node backlog_audit.js --file <backlog.json> [--union <scout-union.md>] [--json]');
  return EXIT.USAGE;
}

function parseArgs(argv) {
  const opts = { file: null, union: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '--union') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) return { error: `${a} needs a path` };
      opts[a.slice(2)] = v;
      i++;
    } else if (a === '--json') {
      opts.json = true;
    } else {
      return { error: `unknown argument ${a}` };
    }
  }
  if (!opts.file) return { error: '--file is required' };
  return { opts };
}

function loadBacklog(file) {
  if (!fs.existsSync(file)) return { unmeasured: `backlog file not found: ${file}` };
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return { unmeasured: `backlog file is empty: ${file}` };
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { unmeasured: `backlog file is not valid JSON: ${e.message}` };
  }
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
    return { unmeasured: 'backlog has no rows' };
  }
  return { rows: data.rows };
}

function unionIds(file) {
  if (!fs.existsSync(file)) return { unmeasured: `union file not found: ${file}` };
  const ids = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\| (U-[A-Z]+-\d+) \|/.exec(line);
    if (m) ids.push(m[1]);
  }
  if (!ids.length) return { unmeasured: `union file lists no U-* rows: ${file}` };
  return { ids: [...new Set(ids)] };
}

function audit(rows, union) {
  const errors = [];
  const seenSlug = new Map();
  const idOwners = new Map();
  const counts = {};
  for (const p of PRIORITIES) counts[p] = {};

  rows.forEach((r, idx) => {
    const at = `row ${idx}${r && r.slug ? ` (${r.slug})` : ''}`;
    if (!r || typeof r !== 'object') {
      errors.push(`${at}: not an object`);
      return;
    }
    if (typeof r.slug !== 'string' || !SLUG_RE.test(r.slug)) errors.push(`${at}: slug must be kebab-case`);
    else if (seenSlug.has(r.slug)) errors.push(`${at}: duplicate slug (first at row ${seenSlug.get(r.slug)})`);
    else seenSlug.set(r.slug, idx);

    if (!PRIORITIES.includes(r.priority)) errors.push(`${at}: priority must be one of ${PRIORITIES.join('/')}`);
    if (!STATUSES.has(r.status)) errors.push(`${at}: status must be one of ${[...STATUSES].join('/')}`);
    if (NEEDS_REASON.has(r.status) && !(typeof r.reason === 'string' && r.reason.trim())) {
      errors.push(`${at}: status ${r.status} needs a non-empty reason`);
    }
    if (typeof r.owner !== 'string' || !r.owner.trim()) errors.push(`${at}: owner is required`);
    if (!Array.isArray(r.ids) || r.ids.length === 0) {
      errors.push(`${at}: ids must be a non-empty array`);
    } else {
      for (const id of r.ids) {
        if (idOwners.has(id)) errors.push(`${at}: id ${id} already placed in ${idOwners.get(id)}`);
        else idOwners.set(id, r.slug);
      }
    }
    if (PRIORITIES.includes(r.priority) && STATUSES.has(r.status)) {
      counts[r.priority][r.status] = (counts[r.priority][r.status] || 0) + 1;
    }
  });

  const unplaced = union ? union.filter((id) => !idOwners.has(id)) : [];
  for (const id of unplaced) errors.push(`union id ${id} is not placed in any row`);

  const p0Open = counts.P0.open || 0;
  return { errors, counts, p0Open, rows: rows.length, unionChecked: union ? union.length : null };
}

function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.error) return usage(parsed.error);
  const { opts } = parsed;

  const loaded = loadBacklog(path.resolve(opts.file));
  if (loaded.unmeasured) {
    console.log(`UNMEASURED: ${loaded.unmeasured}`);
    return EXIT.UNMEASURED;
  }
  let union = null;
  if (opts.union) {
    const u = unionIds(path.resolve(opts.union));
    if (u.unmeasured) {
      console.log(`UNMEASURED: ${u.unmeasured}`);
      return EXIT.UNMEASURED;
    }
    union = u.ids;
  }

  const res = audit(loaded.rows, union);
  const verdict = res.errors.length || res.p0Open > 0 ? 'FAIL' : 'PASS';
  if (opts.json) {
    console.log(JSON.stringify({ verdict, ...res }, null, 2));
  } else {
    console.log(`rows: ${res.rows}${union ? `, union ids checked: ${union.length}` : ''}`);
    for (const p of PRIORITIES) {
      const c = res.counts[p];
      const parts = Object.keys(c).sort().map((s) => `${s} ${c[s]}`);
      console.log(`${p}: ${parts.join(', ') || 'none'}`);
    }
    console.log(`P0 open: ${res.p0Open}`);
    for (const e of res.errors) console.log(`ERROR ${e}`);
    console.log(verdict);
  }
  return verdict === 'PASS' ? EXIT.PASS : EXIT.FAIL;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { audit, loadBacklog, unionIds, main, EXIT };
