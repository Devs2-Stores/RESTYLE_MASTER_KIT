const { spawnSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MOCK = path.resolve(__dirname, 'mock-theme');

// Debug: what does preflight actually return?
const r = spawnSync('node', ['run_preflight.js', '--root', MOCK], { cwd: ROOT, encoding: 'utf8' });
console.log('status:', r.status);
console.log('error:', r.error);
console.log('stdout:', r.stdout && r.stdout.slice(0, 300));
console.log('stderr:', r.stderr && r.stderr.slice(0, 300));