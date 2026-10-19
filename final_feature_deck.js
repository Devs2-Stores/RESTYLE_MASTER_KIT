#!/usr/bin/env node
'use strict';
/**
 * Build a sales feature PPTX from final-showcase screenshots + FEATURES.json.
 * Layout mirrors F1GENZ Farm-style decks: cover → section → feature slides → thank-you.
 */
const fs = require('fs');
const path = require('path');
const { readValue } = require('./lib/cli-args');

function parseArgs(argv) {
  const args = {
    outDir: '',
    features: '',
    file: '',
    brand: '',
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--out') { args.outDir = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (value === '--features') { args.features = path.resolve(readValue(argv, i, '--features')); i += 1; }
    else if (value === '--file') { args.file = readValue(argv, i, '--file'); i += 1; }
    else if (value === '--brand') { args.brand = readValue(argv, i, '--brand'); i += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node final_feature_deck.js --out <final-showcase> [--features FEATURES.json] [--file brand-features.pptx] [--brand "Name"]

Inputs (resolved under --out unless absolute):
  FEATURES.json              Feature list + copy (copy from FEATURES.template.json)
  screenshots referenced by  features[].image (relative to --out)

Output:
  <out>/<file>               Default: <brand-slug>-features.pptx
`);
}

function requirePptxGen() {
  try {
    // eslint-disable-next-line global-require
    return require('pptxgenjs');
  } catch (error) {
    throw new Error(
      'pptxgenjs is required for final:pptx. Run `npm install` in RESTYLE_MASTER_KIT (dependency pptxgenjs).'
      + ` Original: ${error.message}`
    );
  }
}

function loadFeatures(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`FEATURES file not found: ${filePath}\nCopy FEATURES.template.json → final-showcase/FEATURES.json and fill brand + features.`);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid FEATURES JSON: ${error.message}`);
  }
  if (!data || typeof data !== 'object') throw new Error('FEATURES must be a JSON object');
  if (!Array.isArray(data.features) || !data.features.length) {
    throw new Error('FEATURES.features must be a non-empty array');
  }
  return data;
}

function slugify(text) {
  return String(text || 'theme')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'theme';
}

function resolveImage(outDir, rel) {
  if (!rel) return null;
  const full = path.isAbsolute(rel) ? rel : path.join(outDir, rel);
  if (!fs.existsSync(full)) return null;
  return full;
}

const UTILITY_PAGE_REGEX = /(?:đăng\s*nhập|đăng\s*ký|login|register|404|cart|checkout|account|tài\s*khoản|search|tìm\s*kiếm|giỏ\s*hàng|thanh\s*toán)/i;

function pickFallbackImage(outDir, featureIndex, feature = {}) {
  const candidates = [
    'Trang chủ.png',
    'Trang chủ-fullpage.png',
    'desktop-876x2000.png',
    'desktop-fullpage-raw.png',
    path.join('pages', 'Trang nhóm sản phẩm.png'),
    path.join('pages', 'Trang chi tiết sản phẩm.png'),
    // legacy machine keys (pre human-readable rename)
    path.join('pages', 'collection-desktop.png'),
    path.join('pages', 'product-desktop.png')
  ];
  // Prefer pages/* in order if present (excluding utility and auth pages)
  const pagesDir = path.join(outDir, 'pages');
  if (fs.existsSync(pagesDir)) {
    const pageFiles = fs.readdirSync(pagesDir)
      .filter((name) => /\.png$/i.test(name) && !name.startsWith('_') && !UTILITY_PAGE_REGEX.test(name))
      .sort();
    if (pageFiles.length) {
      const titleLower = String(feature.title || feature.name || '').toLowerCase();
      if (titleLower) {
        const words = titleLower.split(/\s+/).filter((w) => w.length >= 3);
        const keywordMatch = pageFiles.find((name) => {
          const nameLower = name.toLowerCase();
          return words.some((w) => nameLower.includes(w));
        });
        if (keywordMatch) return path.join(pagesDir, keywordMatch);
      }
      const pick = pageFiles[featureIndex % pageFiles.length];
      return path.join(pagesDir, pick);
    }
  }
  for (const rel of candidates) {
    if (UTILITY_PAGE_REGEX.test(rel)) continue;
    const full = path.join(outDir, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function paletteOf(data) {
  const p = data.palette || {};
  return {
    bg: p.bg || '#111111',
    surface: p.surface || '#1A1A1A',
    accent: p.accent || '#C8F54B',
    text: p.text || '#FFFFFF',
    muted: p.muted || '#B3B3B3',
    card: p.card || '#F7F7F5'
  };
}

function addCoverSlide(pptx, brand, data, colors) {
  const slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: colors.bg.replace('#', '') }
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.18, h: '100%',
    fill: { color: colors.accent.replace('#', '') }
  });
  slide.addText(brand, {
    x: 0.8, y: 2.2, w: 11.5, h: 1.1,
    fontSize: 44, fontFace: 'Arial', bold: true,
    color: colors.text.replace('#', ''), margin: 0
  });
  const subtitle = data.coverSubtitle || data.tagline || '';
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.8, y: 3.4, w: 10.5, h: 1.2,
      fontSize: 18, fontFace: 'Arial',
      color: colors.muted.replace('#', ''), margin: 0
    });
  }
  slide.addText(data.sectionTitle || 'TÍNH NĂNG NỔI BẬT', {
    x: 0.8, y: 6.5, w: 10, h: 0.4,
    fontSize: 12, fontFace: 'Arial', bold: true,
    color: colors.accent.replace('#', ''), margin: 0
  });
}

function addSectionSlide(pptx, title, colors) {
  const slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: colors.bg.replace('#', '') }
  });
  slide.addText(title || 'TÍNH NĂNG NỔI BẬT', {
    x: 0.8, y: 3.0, w: 11.5, h: 1.2,
    fontSize: 40, fontFace: 'Arial', bold: true,
    color: colors.text.replace('#', ''), margin: 0, align: 'center'
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 5.4, y: 4.3, w: 2.5, h: 0.08,
    fill: { color: colors.accent.replace('#', '') }
  });
}

function buildBodyText(feature, colors) {
  // Returns pptxgenjs text runs so bullet markers can carry the accent color
  // (single-color addText cannot color the `▸` separately from the bullet body).
  const accent = (colors.accent || 'D4FF00').replace('#', '');
  const runs = [];
  const body = (feature.body || feature.description || '').trim();
  if (body) {
    runs.push({ text: body, options: { color: 'F2F2F2', fontSize: 14, fontFace: 'Arial' } });
    runs.push({ text: '', options: { fontSize: 6, breakLine: true } }); // spacer
  }
  const bullets = Array.isArray(feature.bullets) ? feature.bullets.filter(Boolean) : [];
  bullets.forEach((b) => {
    runs.push({ text: '▸ ', options: { color: accent, bold: true, fontSize: 14, fontFace: 'Arial' } });
    runs.push({ text: ` ${String(b).trim()}`, options: { color: 'F2F2F2', fontSize: 13.5, fontFace: 'Arial', breakLine: true } });
  });
  return runs;
}

function readImageSize(imagePath) {
  try {
    // Prefer sharp if available; fall back to PNG/JPEG header parse via fs
    // eslint-disable-next-line global-require
    const sizeOf = require('image-size');
    const dim = sizeOf(imagePath);
    if (dim && dim.width && dim.height) return { width: dim.width, height: dim.height };
  } catch (_) {}
  try {
    const buf = fs.readFileSync(imagePath);
    // PNG IHDR
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG SOF
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
  } catch (_) {}
  return null;
}

function fitContain(boxX, boxY, boxW, boxH, imgWpx, imgHpx, pad) {
  const innerW = Math.max(0.5, boxW - pad * 2);
  const innerH = Math.max(0.5, boxH - pad * 2);
  const ar = (imgWpx && imgHpx) ? (imgWpx / imgHpx) : (16 / 9);
  let w;
  let h;
  if (innerW / innerH > ar) {
    h = innerH;
    w = h * ar;
  } else {
    w = innerW;
    h = w / ar;
  }
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    w,
    h
  };
}

function addFeatureSlide(pptx, feature, imagePath, colors, index, total) {
  const slide = pptx.addSlide();
  const accent = (colors.accent || 'D4FF00').replace('#', '');
  const bg = (colors.bg || '#111111').replace('#', '');
  // Light card background for the screenshot well (right side)
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: (colors.card || '#FDF8F8').replace('#', '') }
  });
  // Dark copy panel (left) — GenZ brand: lime title + white body on dark
  const panelW = 4.6;
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: panelW, h: '100%',
    fill: { color: bg }
  });
  // Left accent bar (lime)
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.12, h: '100%',
    fill: { color: accent }
  });

  const title = feature.title || `Tính năng ${index + 1}`;
  const bodyRuns = buildBodyText(feature, colors);

  // Layout with safe margins (≥0.45" from slide edges)
  // Slide = 13.333 x 7.5
  const copyX = 0.45;
  const copyW = panelW - 0.7;          // keep 0.25" inner gutter
  const imgX = 4.9;
  const imgY = 0.5;
  const imgW = 7.85;                    // right edge ~12.75 → ~0.58" margin
  const imgH = 6.5;                     // bottom ~7.0 → ~0.5" margin
  const framePad = 0.35;

  // Title — lime on dark, 24pt bold (bumped from 17pt)
  slide.addText(title, {
    x: copyX, y: 0.4, w: copyW, h: 1.2,
    fontSize: 24, fontFace: 'Arial', bold: true,
    color: accent, margin: 0, valign: 'top', wrap: true
  });
  if (bodyRuns.length) {
    slide.addText(bodyRuns, {
      x: copyX, y: 1.75, w: copyW, h: 5.1,
      fontSize: 14, fontFace: 'Arial',
      margin: 0, valign: 'top', wrap: true, lineSpacingMultiple: 1.1
    });
  }
  slide.addText(`${index + 1} / ${total}`, {
    x: copyX, y: 6.9, w: copyW, h: 0.3,
    fontSize: 12, fontFace: 'Arial', bold: true,
    color: accent, align: 'left', margin: 0
  });

  // Soft image well — letterbox bg so image never touches slide edge
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: imgX, y: imgY, w: imgW, h: imgH,
    fill: { color: 'E8E8E4' },
    rectRadius: 0.08,
    line: { color: 'C8C8C4', width: 1 }
  });

  if (imagePath) {
    const dim = readImageSize(imagePath);
    const fit = fitContain(
      imgX,
      imgY,
      imgW,
      imgH,
      dim ? dim.width : 1440,
      dim ? dim.height : 900,
      framePad
    );
    // Draw at exact aspect — DO NOT pass sizing.contain (some pptxgen versions still distort)
    slide.addImage({
      path: imagePath,
      x: fit.x,
      y: fit.y,
      w: fit.w,
      h: fit.h
    });
  } else {
    slide.addText('Chưa có screenshot\n(gán features[].image hoặc chạy final:feature-capture)', {
      x: imgX + 0.4, y: imgY + 2.6, w: imgW - 0.8, h: 1.2,
      fontSize: 12, fontFace: 'Arial',
      color: '888888', align: 'center', margin: 0
    });
  }
}

function addThankYouSlide(pptx, message, colors) {
  const slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: colors.bg.replace('#', '') }
  });
  slide.addText(message || 'Xin cảm ơn ạ.', {
    x: 0.8, y: 3.0, w: 11.5, h: 1.2,
    fontSize: 32, fontFace: 'Arial', bold: true,
    color: colors.text.replace('#', ''), align: 'center', margin: 0
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 5.9, y: 4.4, w: 1.5, h: 0.08,
    fill: { color: colors.accent.replace('#', '') }
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return 0;
  }
  if (!args.outDir) throw new Error('--out is required and must point to <theme-root>/final-showcase');

  const outDir = args.outDir;
  if (!fs.existsSync(outDir)) {
    throw new Error(`Output dir not found: ${outDir}. Run final:capture first.`);
  }

  const featuresPath = args.features || path.join(outDir, 'FEATURES.json');
  const data = loadFeatures(featuresPath);
  const brand = args.brand || data.brand || 'Theme';
  const colors = paletteOf(data);
  const PptxGenJS = requirePptxGen();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'LAYOUT_16x9', width: 13.333, height: 7.5 });
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'RESTYLE_MASTER_KIT';
  pptx.title = `${brand} — Tính năng nổi bật`;
  pptx.subject = data.tagline || brand;

  addCoverSlide(pptx, brand, data, colors);
  addSectionSlide(pptx, data.sectionTitle || 'TÍNH NĂNG NỔI BẬT', colors);

  if (data.features.length > 7) {
    console.warn(`WARN: features capped at 7 (provided ${data.features.length}) for standard 10-slide sales deck.`);
  }
  const features = data.features.slice(0, 7);
  const missingImages = [];
  features.forEach((feature, index) => {
    const explicitTarget = feature.background || feature.backgroundImage || feature.image || feature.screenshot || '';
    let imagePath = resolveImage(outDir, explicitTarget);
    if (!imagePath) {
      imagePath = pickFallbackImage(outDir, index, feature);
      if (!explicitTarget) missingImages.push(`${feature.title || index}: no image/background field, used fallback`);
      else missingImages.push(`${feature.title || index}: missing ${explicitTarget}`);
    }
    addFeatureSlide(pptx, feature, imagePath, colors, index, features.length);
  });

  addThankYouSlide(pptx, data.thankYou || `Team ${brand} xin cảm ơn ạ.`, colors);

  const fileName = args.file || `${slugify(brand)}-features.pptx`;
  const outFile = path.isAbsolute(fileName) ? fileName : path.join(outDir, fileName);
  await pptx.writeFile({ fileName: outFile });

  console.log('# Final Feature Deck');
  console.log(`Brand: ${brand}`);
  console.log(`Features: ${features.length}`);
  console.log(`Slides: ${2 + features.length + 1} (cover + section + features + thank-you)`);
  console.log(`Output: ${outFile}`);
  if (missingImages.length) {
    console.log('WARNING: image issues:');
    for (const line of missingImages) console.log(`- ${line}`);
  }
  return 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
