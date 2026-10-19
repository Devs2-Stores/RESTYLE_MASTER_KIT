#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

const MAX_PROMPT_BYTES = 1536; // ~1.5KB
const MAX_PROMPT_SECTIONS = 6;
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes client-side

function parseArgs(argv) {
  const args = {
    promptFile: '',
    out: '',
    project: '',
    device: 'desktop',
    timeout: DEFAULT_TIMEOUT_MS,
    force: false,
    render: false,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') {
      args.help = true;
    } else if (v === '--prompt-file') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --prompt-file');
      args.promptFile = path.resolve(val);
      i += 1;
    } else if (v === '--out') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --out');
      args.out = path.resolve(val);
      i += 1;
    } else if (v === '--project') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --project');
      args.project = val;
      i += 1;
    } else if (v === '--device') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --device');
      args.device = val.toLowerCase();
      i += 1;
    } else if (v === '--timeout') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --timeout');
      args.timeout = parseInt(val, 10);
      i += 1;
    } else if (v === '--force') {
      args.force = true;
    } else if (v === '--render') {
      args.render = true;
    } else if (v === '--prompt' || (!v.startsWith('--') && i === 2)) {
      throw new Error('Prompts must be provided via --prompt-file <path>, not raw argv string (to avoid Windows cmd.exe newline truncation).');
    } else {
      throw new Error(`Unknown argument: ${v}`);
    }
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node stitch_generate.js --prompt-file <file.md> --out <dir> [--project <id>] [--device desktop|mobile|tablet] [--timeout <ms>] [--force] [--render]

Options:
  --prompt-file <path>   Required path to prompt file (never argv string).
  --out <dir>            Required output directory for generated screens.
  --project <id>         Stitch project ID (defaults to STITCH_PROJECT_ID env or auto-detected).
  --device <type>        Target device: desktop (default), mobile, or tablet.
  --timeout <ms>         Client timeout in ms (default: 600000ms / 10m).
                         Note: Stitch server gateway enforces a ~300s cutoff (-32001 timeout).
  --force                Bypass prompt size (>1.5KB) and section count (>6) limits.
  --render               Render each generated DESIGN screen to 1440 full-page PNG using Puppeteer.
  --help, -h             Show this help message.

Prompt Chunking Notice:
  Google Stitch API Gateway has an unconfigurable server-side timeout of ~300s (-32001).
  Prompts with > 6 sections or > 1.5KB frequently trigger this cutoff.
  Always chunk pages into <= 6 sections (top, middle, bottom chunks of <= 1.5KB each).
`);
}

function estimatePrompt(promptText) {
  const byteLength = Buffer.byteLength(promptText, 'utf8');

  // Count section indicators:
  // - Markdown headings: #, ##, ###
  // - Explicit section numbered lines: Section 1:, 1. Section
  // - Bullet modules: - Section:, * Section:, Module:
  const headingMatches = promptText.match(/^#{1,3}\s+\S+/gm) || [];
  const numberedMatches = promptText.match(/^(?:section\s+\d+|\d+[\.\)]\s+[A-Za-z])/gmi) || [];
  const moduleMatches = promptText.match(/^\s*[-*]\s*(?:section|block|module|mô đun)\b/gmi) || [];

  const rawSectionCount = Math.max(headingMatches.length, numberedMatches.length, moduleMatches.length);
  const sectionCount = rawSectionCount > 0 ? rawSectionCount : 1;

  const isOversized = byteLength > MAX_PROMPT_BYTES || sectionCount > MAX_PROMPT_SECTIONS;
  let reason = '';
  if (isOversized) {
    reason = `Prompt exceeds safe threshold: ${sectionCount} sections detected (limit: ~${MAX_PROMPT_SECTIONS}), ${byteLength} bytes (limit: ${MAX_PROMPT_BYTES} bytes / 1.5KB).`;
  }

  return {
    byteLength,
    sectionCount,
    isOversized,
    reason
  };
}

function gatePrompt(promptText, force = false) {
  const est = estimatePrompt(promptText);
  if (est.isOversized && !force) {
    return {
      ok: false,
      error: `${est.reason}\nStitch API Gateway terminates requests at ~300s (-32001 timeout) for large/multi-section prompts.\nPlease chunk your page into <= 6 sections (e.g. top, middle, bottom chunks of <= 1.5KB each), or pass --force to proceed anyway.`,
      estimate: est
    };
  }
  return {
    ok: true,
    error: null,
    estimate: est
  };
}

function extractScreens(raw) {
  const screens = [];
  const components = raw?.outputComponents || [];
  for (const comp of components) {
    if (comp?.design?.screens && Array.isArray(comp.design.screens)) {
      for (const s of comp.design.screens) {
        screens.push(s);
      }
    }
    if (comp?.screens && Array.isArray(comp.screens)) {
      for (const s of comp.screens) {
        screens.push(s);
      }
    }
  }
  if (raw?.screens && Array.isArray(raw.screens)) {
    for (const s of raw.screens) {
      screens.push(s);
    }
  }
  return screens;
}

function categorizeScreens(screens) {
  const designScreens = [];
  const imageScreens = [];
  const otherScreens = [];

  for (const s of screens) {
    const type = (s.screenType || '').toUpperCase();
    if (type === 'DESIGN' || (!type && s.htmlCode)) {
      designScreens.push(s);
    } else if (type === 'IMAGE' || (!type && !s.htmlCode && (s.screenshot || s.image))) {
      imageScreens.push(s);
    } else {
      otherScreens.push(s);
    }
  }

  return { designScreens, imageScreens, otherScreens };
}

async function saveScreens(categorized, outDir, customFetch) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = {
    designs: [],
    assets: []
  };

  const { designScreens, imageScreens } = categorized;

  // 1. Save DESIGN screens
  for (let i = 0; i < designScreens.length; i += 1) {
    const s = designScreens[i];
    const designSubDir = path.join(outDir, `design-${i + 1}`);
    fs.mkdirSync(designSubDir, { recursive: true });

    let htmlContent = '';
    if (typeof s.htmlCode === 'string') {
      htmlContent = s.htmlCode;
    } else if (s.htmlCode?.downloadUrl) {
      if (customFetch) {
        htmlContent = await customFetch(s.htmlCode.downloadUrl);
      } else {
        try {
          const res = await fetch(s.htmlCode.downloadUrl);
          htmlContent = await res.text();
        } catch (e) {
          htmlContent = `<!-- Failed to fetch HTML from ${s.htmlCode.downloadUrl}: ${e.message} -->`;
        }
      }
    } else if (s.html) {
      htmlContent = s.html;
    } else {
      htmlContent = `<!-- No HTML returned for screen ${s.id || i + 1} -->`;
    }

    const htmlPath = path.join(designSubDir, 'index.html');
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    const meta = {
      id: s.id || `design-${i + 1}`,
      title: s.title || `Design Screen ${i + 1}`,
      screenType: 'DESIGN',
      screenshotUrl: s.screenshot?.downloadUrl || s.screenshot || null,
      htmlPath,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(designSubDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf8');
    fs.writeFileSync(path.join(designSubDir, 'raw-screen.json'), JSON.stringify(s, null, 2), 'utf8');

    results.designs.push({ dir: designSubDir, htmlPath, meta });
  }

  // 2. Save IMAGE screens into assets/
  if (imageScreens.length > 0) {
    const assetsDir = path.join(outDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    for (let i = 0; i < imageScreens.length; i += 1) {
      const s = imageScreens[i];
      const assetMeta = {
        id: s.id || `image-${i + 1}`,
        title: s.title || `Image Screen ${i + 1}`,
        screenType: 'IMAGE',
        screenshotUrl: s.screenshot?.downloadUrl || s.screenshot || s.image?.downloadUrl || null,
        savedAt: new Date().toISOString()
      };
      const assetMetaPath = path.join(assetsDir, `image-${i + 1}.json`);
      fs.writeFileSync(assetMetaPath, JSON.stringify(assetMeta, null, 2), 'utf8');
      results.assets.push(assetMeta);
    }
  }

  return results;
}

async function renderDesignHtml(htmlPath, outPngPath, puppeteerInstance) {
  let puppeteer = puppeteerInstance;
  let browserOwned = false;
  let browser = null;

  if (!puppeteer) {
    const puppeteerUtils = require('./lib/puppeteer-utils');
    puppeteer = puppeteerUtils.requirePuppeteer();
  }

  try {
    browser = await puppeteer.launch({ headless: 'new' });
    browserOwned = true;
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.screenshot({ path: outPngPath, fullPage: true });
    return { ok: true, outPngPath };
  } finally {
    if (browserOwned && browser) {
      await browser.close();
    }
  }
}

function resolveStitchSdkRoot() {
  const kitNodeModules = path.join(__dirname, 'node_modules', '@google', 'stitch-sdk');
  if (fs.existsSync(kitNodeModules)) {
    return __dirname;
  }
  if (process.env.STITCH_SDK_ROOT && fs.existsSync(process.env.STITCH_SDK_ROOT)) {
    return path.resolve(process.env.STITCH_SDK_ROOT);
  }
  const scratchRoot = path.resolve(__dirname, '..', '..', 'scratch', 'stitch');
  if (fs.existsSync(path.join(scratchRoot, 'node_modules', '@google', 'stitch-sdk'))) {
    return scratchRoot;
  }
  return null;
}

async function callStitchSdk(options, stubClient) {
  if (stubClient) {
    return stubClient.callTool('generate_screen_from_text', {
      projectId: options.project,
      prompt: options.prompt,
      deviceType: options.deviceType
    });
  }

  const sdkRoot = resolveStitchSdkRoot();
  if (!sdkRoot) {
    throw new Error('@google/stitch-sdk is not installed. To install it, run: npm install @google/stitch-sdk (or set STITCH_SDK_ROOT=<path-with-sdk>).');
  }

  // Ensure API key is present in environment for child execution
  if (!process.env.STITCH_API_KEY) {
    if (process.platform === 'win32') {
      try {
        const out = execSync('reg query HKCU\\Environment /v STITCH_API_KEY', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const match = out.match(/STITCH_API_KEY\s+REG_\w+\s+(\S+)/);
        if (match) {
          process.env.STITCH_API_KEY = match[1];
        }
      } catch {}
    }
  }

  if (!process.env.STITCH_API_KEY) {
    throw new Error('STITCH_API_KEY is not set in environment or HKCU\\Environment. Get one from Google Stitch settings.');
  }

  // Use child Node execution inside sdkRoot to guarantee clean resolution of @google/stitch-sdk
  const runnerScript = `
import { StitchToolClient } from '@google/stitch-sdk';
import { readFileSync, writeFileSync } from 'node:fs';

const [project, promptPath, deviceType, timeoutStr, outRawPath] = process.argv.slice(2);
const timeout = parseInt(timeoutStr, 10) || 600000;
const prompt = readFileSync(promptPath, 'utf8');

const client = new StitchToolClient({ timeout });
try {
  const raw = await client.callTool('generate_screen_from_text', {
    projectId: project,
    prompt,
    deviceType
  });
  writeFileSync(outRawPath, JSON.stringify(raw, null, 2), 'utf8');
  process.exit(0);
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
`;

  const tempRunnerPath = path.join(sdkRoot, `stitch_runner_${Date.now()}.mjs`);
  const tempRawOut = path.join(options.out, 'stitch_raw_output.json');
  fs.mkdirSync(options.out, { recursive: true });
  fs.writeFileSync(tempRunnerPath, runnerScript, 'utf8');

  try {
    execSync(
      `node "${tempRunnerPath}" "${options.project}" "${options.promptFile}" "${options.deviceType}" "${options.timeout}" "${tempRawOut}"`,
      {
        cwd: sdkRoot,
        env: process.env,
        stdio: 'inherit',
        timeout: options.timeout + 10000
      }
    );
    if (!fs.existsSync(tempRawOut)) {
      throw new Error('Stitch runner did not produce output');
    }
    const raw = JSON.parse(fs.readFileSync(tempRawOut, 'utf8'));
    return raw;
  } catch (err) {
    if (err.message && (err.message.includes('-32001') || err.message.includes('timeout'))) {
      throw new Error(`Stitch request timed out. Note: Google Stitch API Gateway enforces an unconfigurable ~300s server cutoff for large prompts. Chunk the page into <= 6 sections and <= 1.5KB prompts.`);
    }
    throw err;
  } finally {
    try { fs.unlinkSync(tempRunnerPath); } catch {}
  }
}

function resolveProjectId(args = {}) {
  const projectId = args.project || process.env.STITCH_PROJECT_ID;
  if (!projectId) {
    throw new Error('Missing Stitch project ID. The default "claudekit-default" does not exist. Please specify --project <id> or set the STITCH_PROJECT_ID environment variable.');
  }
  return projectId;
}
async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    usage();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    usage();
    process.exitCode = 0;
    return;
  }

  if (!args.promptFile) {
    console.error('ERROR: --prompt-file <path> is required.');
    usage();
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(args.promptFile)) {
    console.error(`ERROR: Prompt file not found: ${args.promptFile}`);
    process.exitCode = 1;
    return;
  }

  if (!args.out) {
    console.error('ERROR: --out <dir> is required.');
    usage();
    process.exitCode = 1;
    return;
  }

  const promptText = fs.readFileSync(args.promptFile, 'utf8');

  // Gate prompt size and section count
  const gateResult = gatePrompt(promptText, args.force);
  if (!gateResult.ok) {
    console.error(`[GATE REJECTED] ${gateResult.error}`);
    process.exitCode = 1;
    return;
  }

  console.log('# Stitch Generate');
  console.log(`Prompt file: ${args.promptFile} (${gateResult.estimate.byteLength} bytes, ~${gateResult.estimate.sectionCount} sections)`);
  console.log(`Out directory: ${args.out}`);
  console.log(`Device: ${args.device}`);
  console.log(`Client timeout: ${args.timeout}ms (Server cutoff: ~300s)`);

  let projectId;
  try {
    projectId = resolveProjectId(args);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const deviceType = args.device.toUpperCase();

  let raw;
  try {
    raw = await callStitchSdk({
      project: projectId,
      promptFile: args.promptFile,
      prompt: promptText,
      deviceType,
      timeout: args.timeout,
      out: args.out
    });
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const allScreens = extractScreens(raw);
  const categorized = categorizeScreens(allScreens);

  console.log(`\nScreens returned: ${allScreens.length} total (${categorized.designScreens.length} DESIGN, ${categorized.imageScreens.length} IMAGE)`);

  const saved = await saveScreens(categorized, args.out);

  for (const d of saved.designs) {
    console.log(`- Saved DESIGN: ${d.meta.title} (${d.meta.id}) -> ${d.htmlPath}`);
    if (args.render) {
      const pngPath = path.join(d.dir, 'preview-1440.png');
      console.log(`  Rendering 1440px full-page preview -> ${pngPath}...`);
      try {
        await renderDesignHtml(d.htmlPath, pngPath);
        console.log(`  Rendered: ${pngPath}`);
      } catch (err) {
        console.warn(`  Render warning: ${err.message}`);
      }
    }
  }

  for (const a of saved.assets) {
    console.log(`- Saved IMAGE asset metadata: ${a.title} (${a.id})`);
  }

  console.log('\nStitch generation complete.');
  process.exitCode = 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  estimatePrompt,
  gatePrompt,
  extractScreens,
  categorizeScreens,
  saveScreens,
  renderDesignHtml,
  resolveStitchSdkRoot,
  resolveProjectId,
  callStitchSdk,
  MAX_PROMPT_BYTES,
  MAX_PROMPT_SECTIONS
};
