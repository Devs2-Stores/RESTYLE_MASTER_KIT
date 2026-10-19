'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const KIT = path.resolve(__dirname, '..');
const FX = path.join(__dirname, 'fixtures', 'backlog');
const TOOL = path.join(KIT, 'backlog_audit.js');

let passed = 0, failed = 0;
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label);
  ok ? passed++ : failed++;
}
function run(args) {
  const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const bad = run(['--file', path.join(FX, 'bad.json')]);
check('bad: exit 1', bad.code === 1);
check('bad: reports the open P0', /P0 open: 1\b/.test(bad.out));
check('bad: declined with empty reason is an error', /status declined needs a non-empty reason/.test(bad.out));
check('bad: approval-pending without reason is an error', /status approval-pending needs a non-empty reason/.test(bad.out));
check('bad: duplicate slug is an error', /duplicate slug/.test(bad.out));
check('bad: id placed twice is an error', /id U-KIT-01 already placed/.test(bad.out));
check('bad: unknown status is an error', /status must be one of/.test(bad.out));
check('bad: unknown priority is an error', /priority must be one of/.test(bad.out));
check('bad: non-kebab slug is an error', /slug must be kebab-case/.test(bad.out));

const good = run(['--file', path.join(FX, 'good.json')]);
check('good: exit 0', good.code === 0);
check('good: P0 open 0', /P0 open: 0\b/.test(good.out));
check('good: a P2 open row does not fail the gate', /P2: [^\n]*open 1/.test(good.out) && /\nPASS\s*$/.test(good.out));

const unionMiss = run(['--file', path.join(FX, 'good.json'), '--union', path.join(FX, 'union.md')]);
check('union: an unplaced union id fails', unionMiss.code === 1 && /union id U-TH-12 is not placed/.test(unionMiss.out));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-'));
const goodAll = JSON.parse(fs.readFileSync(path.join(FX, 'good.json'), 'utf8'));
goodAll.rows.push({ slug: 'snap-dirs', ids: ['U-TH-12'], priority: 'P2', owner: 'theme', packet: 'P6b', status: 'open' });
fs.writeFileSync(path.join(tmp, 'full.json'), JSON.stringify(goodAll));
const unionOk = run(['--file', path.join(tmp, 'full.json'), '--union', path.join(FX, 'union.md')]);
check('union: every id placed passes', unionOk.code === 0 && /union ids checked: 5/.test(unionOk.out));

const missing = run(['--file', path.join(tmp, 'nope.json')]);
check('missing file: exit 2 UNMEASURED', missing.code === 2 && /UNMEASURED/.test(missing.out));
fs.writeFileSync(path.join(tmp, 'empty.json'), '  \n');
check('empty file: exit 2', run(['--file', path.join(tmp, 'empty.json')]).code === 2);
fs.writeFileSync(path.join(tmp, 'norows.json'), '{"rows":[]}');
check('zero rows: exit 2', run(['--file', path.join(tmp, 'norows.json')]).code === 2);
fs.writeFileSync(path.join(tmp, 'broken.json'), '{"rows":[');
check('invalid JSON: exit 2', run(['--file', path.join(tmp, 'broken.json')]).code === 2);
check('union file missing: exit 2', run(['--file', path.join(FX, 'good.json'), '--union', path.join(tmp, 'none.md')]).code === 2);

check('no --file: exit 3', run([]).code === 3);
check('unknown flag: exit 3', run(['--file', path.join(FX, 'good.json'), '--bogus']).code === 3);

const json = run(['--file', path.join(FX, 'bad.json'), '--json']);
let parsed = null;
try { parsed = JSON.parse(json.out); } catch (_) { parsed = null; }
check('--json: parseable with verdict FAIL and p0Open 1', !!parsed && parsed.verdict === 'FAIL' && parsed.p0Open === 1);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
