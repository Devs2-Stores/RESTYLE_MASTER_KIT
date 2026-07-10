#!/usr/bin/env node
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

function usage() {
  console.log(`Usage:
  node audit_restyle.js [--root <theme-root>] [--fail-on blocker|warn] [--dry-run]

Combo: chay liquid_content_audit + settings_boundary_audit + css_token_audit
voi cung mot bo argument. Exit 1 neu bat ky audit nao fail.
`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

const scripts = [
  'liquid_content_audit.js',
  'settings_boundary_audit.js',
  'css_token_audit.js'
];

let exitCode = 0;
for (const script of scripts) {
  console.log(`\n--- ${script} ---`);
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  if (result.error) {
    console.error(`ERROR: failed to run ${script}: ${result.error.message}`);
    exitCode = 1;
    break;
  }
  if (result.status !== 0) exitCode = result.status;
}

process.exit(exitCode);
