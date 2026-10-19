#!/usr/bin/env node
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveSettingsAuditScript } = require('./lib/settings-audit');

function main() {
  const argv = process.argv.slice(2);
  const script = resolveSettingsAuditScript();
  const forwarded = !argv.length || argv[0].startsWith('--') ? [path.resolve(process.cwd(), '..'), ...argv] : argv;
  const nodeBin = /^node(?:\.exe)?$/i.test(path.basename(process.execPath || '')) ? process.execPath : 'node';
  const res = spawnSync(nodeBin, [script, ...forwarded], { stdio: 'inherit' });
  if (res.error) throw res.error;
  return res.status === null ? 1 : res.status;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
