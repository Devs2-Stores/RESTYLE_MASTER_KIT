#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readValue(argv, i, flag) {
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parseNumber(value, flag) {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error(`Invalid numeric value for ${flag}: ${value}`);
  return num;
}

function parseArgs(argv) {
  const args = {
    before: '',
    after: '',
    out: path.resolve(process.cwd(), '..', 'scratch', 'visual-diff'),
    paths: ['/'],
    viewports: [375, 1440],
    threshold: 0.05,
    capture: false,
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--before') { args.before = readValue(argv, i, '--before'); i += 1; }
    else if (v === '--after') { args.after = readValue(argv, i, '--after'); i += 1; }
    else if (v === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (v === '--paths') {
      const raw = readValue(argv, i, '--paths');
      args.paths = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (!args.paths.length) throw new Error('Invalid --paths value: no paths provided');
      i += 1;
    }
    else if (v === '--viewports') {
      const raw = readValue(argv, i, '--viewports');
      args.viewports = raw.split(',').map((s) => parseNumber(s.trim(), '--viewports')).filter((n) => n > 0);
      if (!args.viewports.length) throw new Error('Invalid --viewports value: no positive viewports provided');
      i += 1;
    }
    else if (v === '--threshold') { args.threshold = parseNumber(readValue(argv, i, '--threshold'), '--threshold'); i += 1; }
    else if (v === '--capture') args.capture = true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  if (args.threshold < 0) throw new Error('Invalid --threshold value: must be >= 0');
  return args;
}

function usage() {
  console.log(`Usage:
  node visual_diff.js --before <url-or-dir> --after <url-or-dir> [--paths /,/products/x] [--viewports 375,1440] [--out <dir>] [--threshold 0.05] [--capture]

Modes:
  - dir+dir: so sanh PNG cung ten trong 2 thu muc.
  - url+url + --capture: tu chup screenshot 2 phia roi diff.
  - url+dir or dir+url: capture phia url + so sanh voi dir.

Diff metric: % pixel khac biet (RGBA difference > 24/255). Threshold mac dinh
0.05 (5%). Vuot threshold thi exit 1.
`);
}

function isUrl(s) { return /^https?:\/\//i.test(s); }

function sanitize(p) {
  if (p === '/') return 'home';
  return p.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'page';
}

function decodePng(buffer) {
  if (!(buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)) {
    throw new Error('not a PNG');
  }
  let i = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];
  while (i < buffer.length) {
    const len = buffer.readUInt32BE(i); i += 4;
    const type = buffer.slice(i, i + 4).toString('latin1'); i += 4;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(i);
      height = buffer.readUInt32BE(i + 4);
      bitDepth = buffer[i + 8];
      colorType = buffer[i + 9];
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.slice(i, i + len));
    } else if (type === 'IEND') {
      break;
    }
    i += len;
    i += 4;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : -1;
  if (channels < 0) throw new Error(`unsupported color type ${colorType}`);
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));

  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let prevRow = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const srcStart = y * (stride + 1);
    const filter = inflated[srcStart];
    const row = Buffer.alloc(stride);
    inflated.copy(row, 0, srcStart + 1, srcStart + 1 + stride);
    if (filter === 1) {
      for (let x = channels; x < stride; x += 1) row[x] = (row[x] + row[x - channels]) & 0xff;
    } else if (filter === 2) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + prevRow[x]) & 0xff;
    } else if (filter === 3) {
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? row[x - channels] : 0;
        row[x] = (row[x] + Math.floor((left + prevRow[x]) / 2)) & 0xff;
      }
    } else if (filter === 4) {
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? row[x - channels] : 0;
        const up = prevRow[x];
        const upLeft = x >= channels ? prevRow[x - channels] : 0;
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        let pred = upLeft;
        if (pa <= pb && pa <= pc) pred = left;
        else if (pb <= pc) pred = up;
        row[x] = (row[x] + pred) & 0xff;
      }
    } else if (filter !== 0) {
      throw new Error(`unsupported filter ${filter}`);
    }
    row.copy(pixels, y * stride);
    prevRow = row;
  }
  return { width, height, channels, pixels };
}

function compareImages(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  if (w <= 0 || h <= 0) return { diffPixels: 0, totalPixels: 0, ratio: 0, sizeMismatch: a.width !== b.width || a.height !== b.height };
  let diffPixels = 0;
  const totalPixels = w * h;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ia = (y * a.width + x) * a.channels;
      const ib = (y * b.width + x) * b.channels;
      const dr = Math.abs(a.pixels[ia] - b.pixels[ib]);
      const dg = Math.abs(a.pixels[ia + 1] - b.pixels[ib + 1]);
      const db = Math.abs(a.pixels[ia + 2] - b.pixels[ib + 2]);
      if (dr + dg + db > 24) diffPixels += 1;
    }
  }
  const sizeMismatch = a.width !== b.width || a.height !== b.height;
  return { diffPixels, totalPixels, ratio: totalPixels ? diffPixels / totalPixels : 0, sizeMismatch };
}

async function captureUrl(puppeteer, baseUrl, pagePath, viewport, outFile) {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport, height: viewport <= 480 ? 844 : 1200, deviceScaleFactor: 1 });
    const url = baseUrl.replace(/\/+$/, '') + (pagePath.startsWith('/') ? pagePath : '/' + pagePath);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try { await page.waitForNetworkIdle({ timeout: 12000 }); } catch (_) {}
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: outFile, fullPage: true, type: 'png' });
  } finally {
    await browser.close();
  }
}

async function resolvePath(side, srcSpec, pagePath, viewport, outDir) {
  if (!isUrl(srcSpec)) {
    const fp = path.join(srcSpec, `${sanitize(pagePath)}-${viewport}.png`);
    if (!fs.existsSync(fp)) throw new Error(`missing source PNG: ${fp}`);
    return fp;
  }
  const tmp = path.join(outDir, `${side}-${sanitize(pagePath)}-${viewport}.png`);
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch (_) {
    throw new Error('puppeteer not installed; cannot capture from URL');
  }
  await captureUrl(puppeteer, srcSpec, pagePath, viewport, tmp);
  return tmp;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.before || !args.after) { usage(); process.exit(args.help ? 0 : 1); }
  fs.mkdirSync(args.out, { recursive: true });

  const results = [];
  let anyOver = false;

  for (const p of args.paths) {
    for (const vp of args.viewports) {
      try {
        const aPath = await resolvePath('before', args.before, p, vp, args.out);
        const bPath = await resolvePath('after', args.after, p, vp, args.out);
        const aImg = decodePng(fs.readFileSync(aPath));
        const bImg = decodePng(fs.readFileSync(bPath));
        const cmp = compareImages(aImg, bImg);
        const status = cmp.ratio > args.threshold ? 'fail' : (cmp.sizeMismatch ? 'warn' : 'pass');
        results.push({ path: p, viewport: vp, ...cmp, status });
        if (status === 'fail') anyOver = true;
      } catch (e) {
        results.push({ path: p, viewport: vp, status: 'fail', error: e.message });
        anyOver = true;
      }
    }
  }

  console.log('# Visual Diff');
  console.log(`Before: ${args.before}`);
  console.log(`After:  ${args.after}`);
  console.log(`Threshold: ${(args.threshold * 100).toFixed(2)}%\n`);
  console.log('| Path | Viewport | Diff% | Size match | Status | Note |');
  console.log('|---|---:|---:|---|---|---|');
  for (const r of results) {
    const pct = r.ratio !== undefined ? (r.ratio * 100).toFixed(2) + '%' : '-';
    const size = r.sizeMismatch === undefined ? '-' : (r.sizeMismatch ? 'no' : 'yes');
    console.log(`| ${r.path} | ${r.viewport} | ${pct} | ${size} | ${r.status} | ${r.error || ''} |`);
  }
  fs.writeFileSync(path.join(args.out, 'visual-diff.json'), JSON.stringify(results, null, 2), 'utf8');
  if (anyOver) process.exit(1);
}

main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
