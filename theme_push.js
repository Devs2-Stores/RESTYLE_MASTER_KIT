#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    target: 'unpublished',
    confirmLive: false,
    dryRun: false,
    nodelete: false,
    only: '',
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--root') args.root = path.resolve(argv[++i]);
    else if (v === '--target') args.target = argv[++i];
    else if (v === '--confirm-live') args.confirmLive = true;
    else if (v === '--dry-run') args.dryRun = true;
    else if (v === '--nodelete') args.nodelete = true;
    else if (v === '--only') args.only = argv[++i];
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node theme_push.js --root <theme-root> [--target unpublished|live] [--only <glob>] [--nodelete] [--dry-run]

Wrapper an toan cho 'haravan theme push'.
- target=unpublished (mac dinh): push len theme draft, an toan.
- target=live: yeu cau co them --confirm-live; in canh bao 5 giay.
- --dry-run: in lenh ra console nhung khong execute.
- --only: pattern glob, chi push file khop.
- --nodelete: khong delete file ben Haravan khong co local.

Doc theo Haravan CLI 'haravan theme'. Doi env HARAVAN_CLI_CMD neu CLI path khac.
`);
}

function ensureThemeRoot(root) {
  const required = ['layout/theme.liquid', 'config/settings.html'];
  for (const rel of required) {
    if (!fs.existsSync(path.join(root, rel))) {
      console.error(`ERROR: not a Haravan theme root (missing ${rel}): ${root}`);
      process.exit(1);
    }
  }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }

  ensureThemeRoot(args.root);

  if (args.target === 'live' && !args.confirmLive) {
    console.error('ERROR: --target live requires --confirm-live to acknowledge production push.');
    process.exit(1);
  }
  if (args.target !== 'unpublished' && args.target !== 'live') {
    console.error(`ERROR: --target must be unpublished or live, got "${args.target}"`);
    process.exit(1);
  }

  const cli = process.env.HARAVAN_CLI_CMD || 'haravan';
  const cmdArgs = ['theme', 'push'];
  if (args.target === 'unpublished') cmdArgs.push('--unpublished');
  // Live target intentionally has no extra flag; published theme is the live one.
  if (args.nodelete) cmdArgs.push('--nodelete');
  if (args.only) cmdArgs.push('--only', args.only);

  console.log('# Theme Push');
  console.log(`Theme root: ${args.root}`);
  console.log(`Target: ${args.target}`);
  console.log(`Command: ${cli} ${cmdArgs.join(' ')}`);

  if (args.target === 'live') {
    console.log('\n!!! LIVE PUSH WARNING !!!');
    console.log('Pushing to live theme will affect real customers.');
    console.log('Aborting in 5 seconds unless you Ctrl-C...');
    for (let s = 5; s > 0; s -= 1) {
      process.stdout.write(`\r${s}s `);
      await sleep(1000);
    }
    process.stdout.write('\n');
  }

  if (args.dryRun) {
    console.log('\n(dry-run: command not executed)');
    return;
  }

  const result = spawnSync(cli, cmdArgs, {
    cwd: args.root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    console.error(`ERROR: failed to run ${cli}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
