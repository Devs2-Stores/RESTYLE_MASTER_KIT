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
    outDir: path.resolve(process.cwd(), '..', 'final-showcase'),
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

function pickFallbackImage(outDir, featureIndex) {
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
  // Prefer pages/* in order if present (human-readable or legacy *-desktop.png)
  const pagesDir = path.join(outDir, 'pages');
  if (fs.existsSync(pagesDir)) {
    const pageFiles = fs.readdirSync(pagesDir)
      .filter((name) => /\.png$/i.test(name) && !name.startsWith('_'))
      .sort();
    if (pageFiles.length) {
      const pick = pageFiles[featureIndex % pageFiles.length];
      return path.join(pagesDir, pick);
    }
  }
  for (const rel of candidates) {
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

function buildBodyText(feature) {
  const parts = [];
  const body = feature.body || feature.description || '';
  if (body) parts.push(String(body).trim());
  const bullets = Array.isArray(feature.bullets) ? feature.bullets.filter(Boolean) : [];
  if (bullets.length) {
    parts.push(bullets.map((b) => `• ${String(b).trim()}`).join('\n'));
  }
  return parts.join('\n\n');
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
  // Light card background for screenshot readability
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: colors.card.replace('#', '') }
  });
  // Left accent bar
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.12, h: '100%',
    fill: { color: colors.accent.replace('#', '') }
  });

  const title = feature.title || `Tính năng ${index + 1}`;
  const body = buildBodyText(feature);

  // Layout with safe margins (≥0.45" from slide edges) — no edge-hugging
  // Slide = 13.333 x 7.5
  const copyX = 0.45;
  const copyW = 4.15;
  const imgX = 4.9;
  const imgY = 0.5;
  const imgW = 7.85; // right edge ~12.75 → ~0.58" margin
  const imgH = 6.5;  // bottom ~7.0 → ~0.5" margin
  const framePad = 0.35; // breathing room — never flush to frame

  slide.addText(title, {
    x: copyX, y: 0.4, w: copyW, h: 0.95,
    fontSize: 17, fontFace: 'Arial', bold: true,
    color: '111111', margin: 0, valign: 'top', wrap: true
  });
  if (body) {
    slide.addText(body, {
      x: copyX, y: 1.45, w: copyW, h: 5.4,
      fontSize: 11.5, fontFace: 'Arial',
      color: '2A2A2A', margin: 0, valign: 'top',
      wrap: true
    });
  }
  slide.addText(`${index + 1} / ${total}`, {
    x: 11.0, y: 0.2, w: 1.8, h: 0.28,
    fontSize: 11, fontFace: 'Arial',
    color: '888888', align: 'right', margin: 0
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

  const features = data.features;
  const missingImages = [];
  features.forEach((feature, index) => {
    let imagePath = resolveImage(outDir, feature.image || feature.screenshot || '');
    if (!imagePath) {
      imagePath = pickFallbackImage(outDir, index);
      if (!feature.image) missingImages.push(`${feature.title || index}: no image field, used fallback`);
      else missingImages.push(`${feature.title || index}: missing ${feature.image}`);
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
