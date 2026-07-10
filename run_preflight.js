#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

function usage() {
  console.log('Usage: node run_preflight.js [--root <theme-root>]');
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }

const script = path.join(__dirname, 'haravan_preflight_fallback.py');
const candidates = ['py', 'python3', 'python'];

for (const command of candidates) {
  const result = spawnSync(command, [script, ...args], { stdio: 'inherit' });
  if (result.error && result.error.code === 'ENOENT') continue;
  process.exitCode = result.status ?? 1;
  process.exit();
}

console.error('ERROR: No Python interpreter found. Try py, python3, or python.');
process.exitCode = 1;
