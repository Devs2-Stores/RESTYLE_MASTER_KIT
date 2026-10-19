#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readValue, normalizeEnum } = require('./lib/cli-args');

const DEFAULT_OUT = path.resolve(__dirname, '..', '..', 'scratch', 'pipeline-run');

function parseArgs(argv) {
  const args = {
    mode: 'full-theme',
    theme: '',
    stitch: '',
    base: '',
    out: DEFAULT_OUT,
    resumePlan: '',
    fromStep: '',
    qaPaths: '/,/collections/all',
    execute: false,
    allowMainTheme: false,
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
    else if (value === '--resume-plan') { args.resumePlan = path.resolve(readValue(argv, i, '--resume-plan')); i += 1; }
    else if (value === '--from-step') { args.fromStep = readValue(argv, i, '--from-step'); i += 1; }
    else if (value === '--qa-paths') { args.qaPaths = readValue(argv, i, '--qa-paths'); i += 1; }
    else if (value === '--execute') args.execute = true;
    else if (value === '--allow-main-theme') args.allowMainTheme = true;
    else if (value === '--allow-push-live') args.allowPushLive = true;
    else if (value === '--allow-settings-data') args.allowSettingsData = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node stitch_pipeline_runner.js --theme <theme-root> [--stitch <stitch-export>] [--base <preview-url>] [--mode full-theme|single-page|audit-led|resume] [--qa-paths <real-paths>] [--execute]
  node stitch_pipeline_runner.js --theme <theme-root> --mode resume --resume-plan <plan.json> [--from-step <step-id>] [--base <preview-url>] [--execute]

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
  if (args.mode === 'resume') {
    const resumePath = args.resumePlan || path.join(args.out, 'stitch-pipeline-plan.json');
    if (!fs.existsSync(resumePath)) throw new Error(`resume plan not found: ${resumePath}`);
  }
}

function loadResumePlan(args) {
  if (args.mode !== 'resume') return null;
  const resumePath = args.resumePlan || path.join(args.out, 'stitch-pipeline-plan.json');
  const plan = JSON.parse(fs.readFileSync(resumePath, 'utf8'));
  if (!Array.isArray(plan.steps) || !plan.steps.length) throw new Error(`resume plan has no steps: ${resumePath}`);
  if (plan.theme && path.resolve(plan.theme) !== args.theme) throw new Error(`resume plan theme mismatch: ${plan.theme}`);
  args.stitch = args.stitch || plan.stitch || '';
  args.base = args.base || plan.base || '';
  return { path: resumePath, plan };
}

function hydrateStep(step, args) {
  const copy = { ...step };
  if (Array.isArray(step.command)) {
    copy.command = step.command.map((value) => value === '<preview-url>' ? (args.base || value) : value);
  }
  return copy;
}

function buildPreflightCommand(args) {
  const cmd = ['node', 'run_preflight.js', '--root', args.theme];
  if (args.base) cmd.push('--base', args.base);
  if (args.allowMainTheme) cmd.push('--allow-main-theme');
  if (args.execute) cmd.push('--execute');
  return cmd;
}

function buildSteps(args, resume) {
  if (resume) {
    const prior = resume.plan.steps.map((step) => hydrateStep(step, args));
    if (args.fromStep) {
      const index = prior.findIndex((step) => step.id === args.fromStep);
      if (index < 0) throw new Error(`resume step not found: ${args.fromStep}`);
      return prior.slice(index);
    }
    return [
      {
        id: 'preflight',
        type: 'safe',
        command: buildPreflightCommand(args),
        description: 'Kiểm cấu trúc theme trước khi resume'
      },
      {
        id: 'resume-reconciliation',
        type: 'gated',
        description: 'Đối chiếu plan, ledger, artifact và source hiện tại; chọn --from-step đầu tiên chưa hoàn tất'
      },
      ...prior.filter((step) => step.id !== 'preflight')
    ];
  }

  const steps = [
    {
      id: 'preflight',
      type: 'safe',
      command: buildPreflightCommand(args),
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
        id: 'implementation-verification',
        type: 'gated',
        description: 'Implement fidelity-true markup, fill FULL_REMAKE_CONTRACT.json, preserve feature hooks, and stop at implemented-static before preview'
      },
      {
        id: 'remake-contract-audit',
        type: 'safe',
        command: ['npm', 'run', 'audit:remake-contract', '--', '--root', args.theme],
        description: 'Run full-remake contract, merchant-data, feature and CSS ownership audit'
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
        id: 'preview-package',
        type: 'safe',
        command: ['node', 'theme_package.js', '--root', args.theme, '--out', path.join(args.out, 'preview')],
        description: 'Tạo ZIP local để upload preview, không gọi Haravan CLI'
      },
      {
        id: 'preview-upload',
        type: 'gated',
        description: 'Sau approval, upload ZIP bằng Haravan Admin vào draft theme và ghi lại preview URL'
      },
      {
        id: 'qa-a11y-perf',
        type: 'safe-after-preview',
        command: [
          'npm', 'run', 'qa', '--', '--base', args.base || '<preview-url>', '--paths', args.qaPaths
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
        id: 'audit-remediation',
        type: 'gated',
        description: 'Sửa findings tại source, không CSS override mù; cập nhật ledger trước khi chạy lại audit'
      },
      {
        id: 'audit-verification',
        type: 'safe',
        command: ['npm', 'run', 'audit:restyle', '--', '--root', args.theme],
        description: 'Chạy lại audit sau remediation và yêu cầu zero blocker'
      },
      {
        id: 'preview-package',
        type: 'safe',
        command: ['node', 'theme_package.js', '--root', args.theme, '--out', path.join(args.out, 'preview')],
        description: 'Tạo ZIP local để upload preview, không gọi Haravan CLI'
      },
      {
        id: 'preview-upload',
        type: 'gated',
        description: 'Sau approval, upload ZIP bằng Haravan Admin vào draft theme và ghi lại preview URL'
      },
      {
        id: 'qa-a11y',
        type: 'safe-after-preview',
        command: ['npm', 'run', 'qa', '--', '--base', args.base || '<preview-url>', '--paths', args.qaPaths],
        description: 'Run QA after preview URL exists'
      },
      {
        id: 'final-approval',
        type: 'gated',
        description: 'Review remediation evidence and final screenshots before export'
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

function writeRunPlan(args, steps, checkpoints, resume) {
  fs.mkdirSync(args.out, { recursive: true });
  const plan = {
    generatedBy: 'stitch_pipeline_runner.js',
    mode: args.mode,
    theme: args.theme,
    stitch: args.stitch || null,
    base: args.base || null,
    execute: args.execute,
    safeByDefault: true,
    remakeContract: (args.mode === 'full-theme' || args.mode === 'single-page')
      ? path.join(args.theme, 'deliverables', 'FULL_REMAKE_CONTRACT.json')
      : null,
    steps,
    checkpoints
  };
  if (resume) {
    plan.resumedFrom = resume.path;
    plan.fromStep = args.fromStep || null;
  }
  const filePath = path.join(args.out, resume ? 'stitch-pipeline-resume-plan.json' : 'stitch-pipeline-plan.json');
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

function runSafePrefix(steps, args) {
  const completed = [];
  for (const step of steps) {
    if (step.type !== 'safe' && step.type !== 'safe-after-preview') {
      console.log(`STOP at checkpoint: ${step.id}`);
      console.log(step.description);
      fs.writeFileSync(path.join(args.out, 'stitch-pipeline-execution.json'), JSON.stringify({ completed, stoppedAt: step.id }, null, 2), 'utf8');
      return 0;
    }
    if (step.type === 'safe-after-preview' && (!args.base || step.command.includes('<preview-url>'))) {
      console.log(`STOP at checkpoint: ${step.id}`);
      console.log('Preview URL is required before this step. Resume with --base <preview-url> --from-step ' + step.id + '.');
      fs.writeFileSync(path.join(args.out, 'stitch-pipeline-execution.json'), JSON.stringify({ completed, stoppedAt: step.id, requires: 'base' }, null, 2), 'utf8');
      return 0;
    }
    console.log(`\n>> ${step.id}`);
    const result = spawnSync(step.command[0], step.command.slice(1), {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32' && step.command[0] === 'npm'
    });
    if (result.status !== 0) return result.status || 1;
    completed.push(step.id);
  }
  fs.writeFileSync(path.join(args.out, 'stitch-pipeline-execution.json'), JSON.stringify({ completed, stoppedAt: null }, null, 2), 'utf8');
  return 0;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { usage(); return 0; }
  validateArgs(args);
  const resume = loadResumePlan(args);
  const steps = buildSteps(args, resume);
  const checkpoints = buildCheckpoints(args);
  const planFile = writeRunPlan(args, steps, checkpoints, resume);
  printPlan(args, steps, checkpoints, planFile);
  if (!args.execute) return 0;
  return runSafePrefix(steps, args);
}

try {
  process.exitCode = main() ?? 0;
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
