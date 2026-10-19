#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runSettingsSchemaAudit } = require('./lib/settings-audit');

function usage() {
  console.log(`Usage:
  node audit_restyle.js [--root <theme-root>] [--fail-on blocker|warn] [--dry-run]

Combo: chay liquid_content_audit + settings_boundary_audit + css_token_audit + audit-settings-schema
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

let rootDir = path.resolve(process.cwd(), '..');
let dryRun = false;
let failOn = 'blocker';
for (let i = 0; i < args.length; i += 1) {
  if ((args[i] === '--root' || args[i] === '--theme') && args[i + 1]) {
    rootDir = path.resolve(args[i + 1]);
    i += 1;
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  } else if (args[i] === '--fail-on' && args[i + 1]) {
    failOn = args[i + 1];
    i += 1;
  }
}

if (fs.existsSync(path.join(rootDir, 'config', 'settings_schema.json')) || process.env.HARAVAN_SETTINGS_AUDIT) {
  console.log('\n--- audit-settings-schema.mjs ---');
  try {
    const auditRes = runSettingsSchemaAudit(rootDir);
    console.log(`Settings schema audit: ${auditRes.errors.length} error(s), ${auditRes.warnings.length} warning(s)`);
    for (const err of auditRes.errors) {
      console.log(`  [ERROR] ${err.rule}: ${err.message}`);
    }
    for (const warn of auditRes.warnings) {
      console.log(`  [WARN] ${warn.rule}: ${warn.message}`);
    }
    if (!dryRun && (auditRes.errors.length > 0 || (failOn === 'warn' && auditRes.warnings.length > 0))) {
      exitCode = 1;
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    exitCode = 1;
  }
}

process.exit(exitCode);
