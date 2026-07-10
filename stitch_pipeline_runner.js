#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readValue, normalizeEnum } = require('./lib/cli-args');

function parseArgs(argv) {
  const args = {
    mode: 'full-theme',
    theme: '',
    stitch: '',
    base: '',
    out: path.resolve(process.cwd(), '..', 'scratch', 'pipeline-run'),
    execute: false,
    allowPushLive: false,
    allowSettingsData: false,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--mode') { args.mode = normalizeEnum(readValue(argv, i, '--mode'), '--mode', ['full-theme', 'single-page', 'audit-led', 'resume']); i += 1; }
    else if (value === '--theme') { args.theme = path.resolve(readValue(argv, i, '--theme')); i += 1; }
    else if (value === '--stitch') { args.stitch = path.resolve(readValue(argv, i, '--stitch')); i += 1; }
    else if (value === '--base') { args.base = readValue(argv, i, '--base'); i += 1; }
    else if (value === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (value === '--execute') args.execute = true;
    else if (value === '--allow-push-live') args.allowPushLive = true;
    else if (value === '--allow-settings-data') args.allowSettingsData = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node stitch_pipeline_runner.js --theme <theme-root> [--stitch <stitch-export>] [--base <preview-url>] [--mode full-theme|single-page|audit-led|resume] [--execute]

Default behavior:
  - Dry-run / planner mode only.
  - Prints the full Stitch -> Haravan flow with explicit checkpoints.
  - Writes a machine-readable run plan to <out>/stitch-pipeline-plan.json.

Execute mode:
  - Runs only the deterministic safe prefix.
  - Stops before human judgment gates such as asset selection, Stitch gap resolution,
    permission-sensitive settings data changes, preview approval, and live push.

This is intentionally NOT one-click blind automation.
`);
}

function validateArgs(args) {
  if (!args.theme) throw new Error('--theme is required');
  if (!fs.existsSync(args.theme)) throw new Error(`theme root not found: ${args.theme}`);
  if (args.mode !== 'audit-led' && args.mode !== 'resume') {
    if (!args.stitch) throw new Error(`--stitch is required for mode ${args.mode}`);
    if (!fs.existsSync(args.stitch)) throw new Error(`stitch input not found: ${args.stitch}`);
  }
}

function buildSteps(args) {
  const steps = [
    {
      id: 'preflight',
      type: 'safe',
      command: ['node', 'run_preflight.js', '--root', args.theme],
      description: 'Kiểm cấu trúc theme trước khi làm'
    }
  ];

  if (args.mode === 'full-theme' || args.mode === 'single-page') {
    steps.push(
      {
        id: 'stitch-consume',
        type: 'safe',
        command: ['node', 'stitch_consume.js', '--in', args.stitch, '--out', path.join(args.out, 'stitch')],
        description: 'Strip CDN/Tailwind, follow linked CSS, extract stitch-fidelity artifacts'
      },
      {
        id: 'token-extract',
        type: 'safe',
        command: ['node', 'design_token_extract.js', '--theme', args.theme, '--stitch-tokens', path.join(args.out, 'stitch', 'tokens.json'), '--out', path.join(args.out, 'tokens')],
        description: 'Map Stitch tokens vs theme tokens and emit token map artifacts'
      },
      {
        id: 'section-config',
        type: 'gated',
        description: 'Fill section-config from Stitch fidelity manifest and approve section mapping'
      },
      {
        id: 'asset-plan',
        type: 'gated',
        description: 'Fill asset-plan with approved sources, ratios, and allowed deviations'
      },
      {
        id: 'section-scaffold',
        type: 'safe',
        command: ['node', 'section_scaffold.js', '--config', path.join(args.out, 'section-config.json'), '--root', args.theme],
        description: 'Generate structural Liquid section/snippet scaffold after section mapping is approved'
      },
      {
        id: 'restyle-audits',
        type: 'safe',
        command: ['npm', 'run', 'audit:restyle', '--', '--root', args.theme],
        description: 'Run content/settings/css audits'
      },
      {
        id: 'orphan-sweep',
        type: 'safe',
        command: ['node', 'orphan_sweep.js', '--root', args.theme],
        description: 'Find orphan snippets/assets/sections'
      },
      {
        id: 'preview-push',
        type: 'gated',
        description: 'Push preview theme and obtain preview URL before browser verification'
      },
      {
        id: 'qa-a11y-perf',
        type: 'safe-after-preview',
        command: [
          'npm', 'run', 'qa', '--', '--base', args.base || '<preview-url>', '--paths', '/,/collections/all,/products/sample'
        ],
        description: 'Run QA smoke after preview URL exists'
      },
      {
        id: 'final-approval',
        type: 'gated',
        description: 'Review final screenshots, deviations, and description fragment before export/live push'
      }
    );
  }

  if (args.mode === 'audit-led') {
    steps.push(
      {
        id: 'restyle-audits',
        type: 'safe',
        command: ['npm', 'run', 'audit:restyle', '--', '--root', args.theme],
        description: 'Run content/settings/css audits'
      },
      {
        id: 'qa-a11y',
        type: 'safe-after-preview',
        command: ['npm', 'run', 'qa', '--', '--base', args.base || '<preview-url>', '--paths', '/'],
        description: 'Run QA after preview URL exists'
      }
    );
  }

  steps.push({
    id: 'final-export',
    type: 'gated',
    description: args.allowPushLive
      ? 'Export and optional live push only after explicit approval and green final guard'
      : 'Export only after explicit approval and green final guard'
  });

  return steps;
}

function buildCheckpoints(args) {
  return [
    { id: 'asset-approval', required: true, reason: 'Asset source, crop, and ratio need human approval.' },
    { id: 'stitch-gap-resolution', required: true, reason: 'Missing states and edge cases in Stitch need explicit handling.' },
    { id: 'permission-boundary', required: true, reason: `settings_data: ${args.allowSettingsData ? 'allowed by flag' : 'not allowed by default'}; live push remains gated.` },
    { id: 'visual-approval', required: true, reason: 'Final screenshots and deviations must be approved before export/handoff.' }
  ];
}

function writeRunPlan(args, steps, checkpoints) {
  fs.mkdirSync(args.out, { recursive: true });
  const plan = {
    generatedBy: 'stitch_pipeline_runner.js',
    mode: args.mode,
    theme: args.theme,
    stitch: args.stitch || null,
    base: args.base || null,
    execute: args.execute,
    safeByDefault: true,
    steps,
    checkpoints
  };
  const filePath = path.join(args.out, 'stitch-pipeline-plan.json');
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), 'utf8');
  return filePath;
}

function printPlan(args, steps, checkpoints, planFile) {
  console.log('# Stitch Pipeline Runner');
  console.log(`Mode: ${args.mode}`);
  console.log(`Theme: ${args.theme}`);
  if (args.stitch) console.log(`Stitch: ${args.stitch}`);
  if (args.base) console.log(`Preview: ${args.base}`);
  console.log(`Plan file: ${planFile}`);
  console.log('');
  console.log('## Steps');
  for (const step of steps) {
    console.log(`- [${step.type}] ${step.id} — ${step.description}`);
    if (step.command) console.log(`  command: ${step.command.join(' ')}`);
  }
  console.log('');
  console.log('## Required checkpoints');
  for (const checkpoint of checkpoints) {
    console.log(`- ${checkpoint.id}: ${checkpoint.reason}`);
  }
  console.log('');
  console.log(args.execute
    ? 'Execute mode will run only the deterministic safe prefix, then stop at the first gated checkpoint.'
    : 'Dry-run mode only: no script executed.');
}

function runSafePrefix(steps) {
  for (const step of steps) {
    if (step.type !== 'safe') {
      console.log(`STOP at checkpoint: ${step.id}`);
      console.log(step.description);
      return 0;
    }
    console.log(`\n>> ${step.id}`);
    const result = spawnSync(step.command[0], step.command.slice(1), {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32' && step.command[0] === 'npm'
    });
    if (result.status !== 0) return result.status || 1;
  }
  return 0;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); process.exit(0); }
  validateArgs(args);
  const steps = buildSteps(args);
  const checkpoints = buildCheckpoints(args);
  const planFile = writeRunPlan(args, steps, checkpoints);
  printPlan(args, steps, checkpoints, planFile);
  if (!args.execute) return;
  process.exit(runSafePrefix(steps));
}

try { main(); } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1); }
