#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readValue } = require('./lib/cli-args');
const { resolveInsideRoot } = require('./lib/path-utils');
const { getImageInfo } = require('./lib/image');

function parseArgs(argv) {
  const args = { plan: '', root: path.resolve(process.cwd(), '..'), execute: false, generator: '', help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--plan') { args.plan = path.resolve(readValue(argv, i, '--plan')); i += 1; }
    else if (v === '--root') { args.root = path.resolve(readValue(argv, i, '--root')); i += 1; }
    else if (v === '--execute') args.execute = true;
    else if (v === '--generator') { args.generator = readValue(argv, i, '--generator'); i += 1; }
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node asset_pipeline.js --plan <asset-plan.json> --root <theme-root> [--execute] [--generator <cmd>]

Default mode (no --execute): validate plan, report missing/wrong-size assets,
print the generation commands the agent should run via demo-image-assets skill.

With --execute: invoke an external generator command for each missing asset.
The generator receives JSON on stdin describing the asset spec.
Use this only when you have a vetted local generator wrapper.

Plan schema: see asset-plan.template.json
`);
}

function resolveAssetOut(spec, themeRoot) {
  if (!spec.out) throw new Error('missing "out" field');
  return resolveInsideRoot(themeRoot, spec.out, 'asset output');
}

function validateDimensions(spec, dims, errors) {
  if (!spec.w || !spec.h || !dims) return;
  if (dims.kind === 'svg') {
    if (dims.width == null || dims.height == null) {
      errors.push(`svg missing explicit width/height for validation: ${spec.out}`);
      return;
    }
  }
  if (dims.width !== spec.w || dims.height !== spec.h) {
    errors.push(`wrong size: expected ${spec.w}x${spec.h}, got ${dims.width}x${dims.height}`);
  }
}

function validateAsset(spec, themeRoot) {
  const errors = [];
  let out;
  try {
    out = resolveAssetOut(spec, themeRoot);
  } catch (error) {
    return { exists: false, dims: null, errors: [error.message] };
  }
  const exists = fs.existsSync(out);
  let dims = null;
  if (exists) {
    const stat = fs.statSync(out);
    if (stat.size === 0) errors.push(`empty file: ${spec.out}`);
    try {
      dims = getImageInfo(out);
      validateDimensions(spec, dims, errors);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { exists, dims, errors };
}

function specToCommand(spec, themeRoot) {
  const out = resolveAssetOut(spec, themeRoot);
  switch (spec.source) {
    case 'demo-image-assets':
    case 'magnific':
    case 'bfl':
      return [
        '# demo-image-assets / Black Forest Labs flux-2 (skill global)',
        `python C:/Users/Admin/.kiro/skills/demo-image-assets/scripts/bfl_generate.py \\`,
        `  --prompt "${(spec.prompt || '').replace(/"/g, '\\"')}" \\`,
        `  --width ${spec.w} --height ${spec.h} \\`,
        `  --out "${out}"`
      ].join('\n');
    case 'iconify':
      return [
        '# Iconify free SVG fallback',
        `node C:/Users/Admin/.kiro/skills/demo-image-assets/scripts/iconify_fetch.mjs \\`,
        `  --name "${spec.name}" --out "${out}"`
      ].join('\n');
    case 'flaticon':
    case 'freepik':
      return [
        '# Flaticon/Freepik via demo-image-assets icon API',
        `python C:/Users/Admin/.kiro/skills/demo-image-assets/scripts/icon_asset.py \\`,
        `  --query "${spec.query || spec.name}" --out "${out}"`
      ].join('\n');
    case 'existing':
      return `# Copy from existing path\nCopy-Item "${spec.from}" "${out}"`;
    case 'brand-provided':
      return `# Brand-provided. User must place file at ${out}`;
    default:
      return `# Unknown source "${spec.source}". Resolve manually.`;
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.plan) { usage(); process.exit(args.help ? 0 : 1); }
  if (!fs.existsSync(args.plan)) { console.error(`ERROR: plan not found: ${args.plan}`); process.exit(1); }

  const plan = JSON.parse(fs.readFileSync(args.plan, 'utf8'));
  if (!Array.isArray(plan.assets)) { console.error('ERROR: plan.assets must be an array'); process.exit(1); }

  const ok = [];
  const todo = [];
  const wrong = [];

  for (const spec of plan.assets) {
    const result = validateAsset(spec, args.root);
    if (result.errors.length) wrong.push({ spec, reason: result.errors.join('; '), dims: result.dims });
    else if (!result.exists) todo.push(spec);
    else ok.push({ spec, dims: result.dims });
  }

  console.log('# Asset Pipeline');
  console.log(`Plan: ${args.plan}`);
  console.log(`Theme root: ${args.root}`);
  console.log(`Total assets: ${plan.assets.length} | OK: ${ok.length} | Missing: ${todo.length} | Wrong: ${wrong.length}`);

  if (wrong.length) {
    console.log('\n## Wrong assets (must regenerate)');
    for (const w of wrong) console.log(`- ${w.spec.out || '(missing out)'}: ${w.reason}`);
  }

  if (todo.length) {
    console.log('\n## Missing assets - generation plan');
    for (const spec of todo) {
      console.log(`\n### ${spec.key || spec.out} (${spec.source})`);
      console.log(specToCommand(spec, args.root));
    }
  }

  if (args.execute && args.generator) {
    console.log('\n## Executing generator');
    const queue = [...todo, ...wrong.map((w) => w.spec)];
    for (const spec of queue) {
      console.log(`\n>> ${spec.key || spec.out}`);
      const out = resolveAssetOut(spec, args.root);
      const result = spawnSync(args.generator, [], {
        input: JSON.stringify({ ...spec, out }),
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: process.platform === 'win32'
      });
      if (result.status !== 0) console.error(`generator exited ${result.status} for ${spec.out}`);
    }
  } else if (todo.length || wrong.length) {
    console.log('\n(Run with --execute --generator <cmd> to invoke generator, or run commands manually.)');
  }

  if (wrong.length) process.exit(1);
}

try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
