#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let sharpLib = null;
try { sharpLib = require('sharp'); } catch (_) {}
const { readValue, parseFiniteNumber, parseCsv } = require('./lib/cli-args');
const { buildUrl } = require('./lib/path-utils');
const { requirePuppeteer, sleep, navigateAndSettle, withPage } = require('./lib/puppeteer-utils');

const MAX_SAFE_FULLPAGE_HEIGHT = 14000;

function writeFileAtomic(filePath, buffer) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, buffer);
  try {
    fs.renameSync(tmpFile, filePath);
  } catch (_) {
    fs.copyFileSync(tmpFile, filePath);
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function crc32Png(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32Png(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngToRawRgba(pngBuffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 33 || !pngBuffer.subarray(0, 8).equals(sig)) {
    throw new Error('Invalid PNG buffer');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idatChunks = [];
  while (offset + 8 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > pngBuffer.length) break;
    const chunkData = pngBuffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData.readUInt8(8);
      colorType = chunkData.readUInt8(9);
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format (width=${width}, height=${height}, bitDepth=${bitDepth}, colorType=${colorType})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  const prevRow = Buffer.alloc(stride);
  const currRow = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    const filterType = inflated[rowOffset];
    for (let x = 0; x < stride; x += 1) {
      const rawByte = inflated[rowOffset + 1 + x];
      const left = x >= bpp ? currRow[x - bpp] : 0;
      const up = prevRow[x];
      const upLeft = x >= bpp ? prevRow[x - bpp] : 0;
      let val = rawByte;
      if (filterType === 1) val = (rawByte + left) & 0xff;
      else if (filterType === 2) val = (rawByte + up) & 0xff;
      else if (filterType === 3) val = (rawByte + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) val = (rawByte + paethPredictor(left, up, upLeft)) & 0xff;
      currRow[x] = val;
    }
    currRow.copy(prevRow);
    if (bpp === 4) {
      currRow.copy(rgba, y * width * 4, 0, stride);
    } else {
      for (let px = 0; px < width; px += 1) {
        const dstIdx = (y * width + px) * 4;
        rgba[dstIdx] = currRow[px * 3];
        rgba[dstIdx + 1] = currRow[px * 3 + 1];
        rgba[dstIdx + 2] = currRow[px * 3 + 2];
        rgba[dstIdx + 3] = 255;
      }
    }
  }
  return { width, height, data: rgba };
}

function encodeRawRgbaToPng(width, height, rgbaData) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgbaData.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0))
  ]);
}

function resizeAndTopCropRawRgba(src, targetWidth, targetHeight) {
  const scale = targetWidth / src.width;
  const scaledHeight = Math.max(1, Math.ceil(src.height * scale));
  const dst = Buffer.alloc(targetWidth * targetHeight * 4, 255);
  const maxY = Math.min(targetHeight, scaledHeight);
  for (let y = 0; y < maxY; y += 1) {
    const srcY = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(src.width - 1, Math.floor(x / scale));
      const srcIdx = (srcY * src.width + srcX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      dst[dstIdx] = src.data[srcIdx];
      dst[dstIdx + 1] = src.data[srcIdx + 1];
      dst[dstIdx + 2] = src.data[srcIdx + 2];
      dst[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
  return dst;
}
/** Default storefront templates for final handoff capture (paths may be overridden). */
const DEFAULT_TEMPLATE_PATHS = {
  home: '/',
  collection: '/collections/all',
  product: '',
  blog: '/blogs/news',
  article: '',
  'page-default': '/pages/about-us',
  'page-custom': '',
  login: '',
  register: ''
};

/**
 * Human-readable Vietnamese filenames under pages/ (merchant-friendly).
 * Keys stay machine keys in CAPTURE_MANIFEST; files use these labels.
 */
const PAGE_FILE_LABELS = {
  home: 'Trang chủ',
  collection: 'Trang nhóm sản phẩm',
  product: 'Trang chi tiết sản phẩm',
  blog: 'Trang danh sách blog',
  article: 'Trang chi tiết bài viết',
  'page-default': 'Trang về chúng tôi',
  'page-custom': 'Trang tùy chỉnh',
  login: 'Trang đăng nhập',
  register: 'Trang đăng ký',
  contact: 'Trang liên hệ',
  faq: 'Trang FAQ',
  gallery: 'Trang gallery',
  stores: 'Trang hệ thống cửa hàng'
};

/**
 * Default floating widgets and overlays to hide during capture.
 * Combined with user-supplied --hide <selector>.
 */
const DEFAULT_HIDE_SELECTORS = [
  '#preview-bar-iframe',
  '#admin_bar_iframe',
  'iframe[src*="admin/bar"]',
  'iframe[src*="preview"]',
  'iframe[src*="preview-bar"]',
  'iframe[src*="preview_bar"]',
  '[class*="preview-bar"]',
  '#haravan-notification',
  '#PBarNextFrameWrapper',
  '#PBarNextFrame',
  '.hrv-theme-preview',
  '[id*="PreviewBar"]',
  '[class*="PreviewBar"]',
  'float-social',
  '.rb-float-social',
  '[class*="float-social"]',
  'newsletter-modal',
  '.newsletter-modal',
  '.toast-container',
  '[class*="toast-container"]',
  '.f1zs-livechatchannels',
  '[id*="fb-root"]',
  '#fb-root',
  '.widget-chat',
  '#widget-chat',
  '[class*="chat-widget"]',
  '[id*="chat-widget"]',
  '[class*="chat-fab"]',
  '[id*="chat-fab"]',
  '.az-support',
  '[data-az-support]',
  '.back-to-top',
  '[class*="back-to-top"]'
];

/** Convert text to ASCII slug with proper Vietnamese diacritic folding (đ->d). */
function toAsciiSlug(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Resolve readable page title for screenshot filenames from key + URL path or explicit label. */
function resolvePageLabel(key, pagePath, customLabel) {
  if (customLabel) {
    let lbl = String(customLabel).trim().normalize('NFC');
    if (!/^trang\b/i.test(lbl)) lbl = `Trang ${lbl}`;
    return lbl;
  }
  const p = String(pagePath || '').toLowerCase();
  if (/he-thong-cua-hang|cua-hang|\/store\b/.test(p)) return 'Trang hệ thống cửa hàng';
  if (/about-us|gioi-thieu|ve-chung-toi|\/about\b/.test(p)) return 'Trang về chúng tôi';
  if (/lien-he|\/contact\b/.test(p)) return 'Trang liên hệ';
  if (/cau-hoi|faq|hoi-dap/.test(p)) return 'Trang FAQ';
  if (/gallery|thu-vien|lookbook/.test(p)) return 'Trang gallery';
  if (/\/products\//.test(p)) return 'Trang chi tiết sản phẩm';
  if (/\/blogs\/[^/]+\/.+/.test(p)) return 'Trang chi tiết bài viết';
  if (/\/blogs\//.test(p)) return 'Trang danh sách blog';
  if (/\/collections\//.test(p)) return 'Trang nhóm sản phẩm';
  if (/\/account\/login/.test(p)) return 'Trang đăng nhập';
  if (/\/account\/register/.test(p)) return 'Trang đăng ký';
  if (PAGE_FILE_LABELS[key]) return PAGE_FILE_LABELS[key];
  const safe = String(key || 'trang').replace(/[-_]+/g, ' ').trim().normalize('NFC');
  return `Trang ${safe}`;
}

/**
 * Human-readable page screenshot filename.
 * Desktop (default): "Trang chi tiết sản phẩm.png"
 * Mobile (optional): "Trang chi tiết sản phẩm-mobile.png"
 */
function pageShotFilename(key, device, pagePath, customLabel) {
  const label = resolvePageLabel(key, pagePath, customLabel);
  // Windows-safe: keep Vietnamese letters/spaces; strip path separators and forbidden chars
  const safe = label.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  if (device === 'mobile') return `${safe}-mobile.png`;
  return `${safe}.png`;
}

function sanitizeKey(key) {
  return toAsciiSlug(key);
}

/** Human-readable home showcase filenames (guard still checks 876×2000 + 276×480 dims). */
const HOME_SHOWCASE_FILES = {
  desktopRaw: 'Trang chủ-fullpage.png',
  mobileRaw: 'Trang chủ-mobile-fullpage.png',
  desktopCrop: 'Trang chủ.png',
  mobileCrop: 'Trang chủ-mobile.png'
};

/** Legacy machine names — still accepted by guard for older packs. */
const HOME_SHOWCASE_LEGACY = {
  desktopRaw: 'desktop-fullpage-raw.png',
  mobileRaw: 'mobile-fullpage-raw.png',
  desktopCrop: 'desktop-876x2000.png',
  mobileCrop: 'mobile-276x480.png'
};

function parseArgs(argv) {
  const opts = {
    base: '',
    pagePath: '/',
    out: '',
    pathsFile: '',
    paths: null,
    allTemplates: false,
    includeAuth: false,
    themeId: '',
    // Desktop-only by default for multi-template showcase / PPTX handoff.
    // Pass --mobile-pages when mobile page shots are explicitly needed.
    includeMobilePages: false,
    desktopViewportWidth: 1440,
    desktopViewportHeight: 1200,
    mobileViewportWidth: 390,
    mobileViewportHeight: 844,
    desktopOutWidth: 876,
    desktopOutHeight: 2000,
    mobileOutWidth: 276,
    mobileOutHeight: 480,
    waitMs: 3000,
    hideSelectors: [],
    protocolTimeout: 90000,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--base') { opts.base = readValue(argv, i, '--base'); i += 1; }
    else if (arg === '--path') { opts.pagePath = readValue(argv, i, '--path'); i += 1; }
    else if (arg === '--out') { opts.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (arg === '--paths-file') { opts.pathsFile = path.resolve(readValue(argv, i, '--paths-file')); i += 1; }
    else if (arg === '--paths') {
      opts.paths = parsePathMap(readValue(argv, i, '--paths'));
      i += 1;
    }
    else if (arg === '--all-templates') opts.allTemplates = true;
    else if (arg === '--include-auth') opts.includeAuth = true;
    else if (arg === '--theme-id') { opts.themeId = String(readValue(argv, i, '--theme-id')).trim(); i += 1; }
    else if (arg === '--no-mobile-pages') opts.includeMobilePages = false;
    else if (arg === '--mobile-pages') opts.includeMobilePages = true;
    else if (arg === '--desktop-viewport') { opts.desktopViewportWidth = parseFiniteNumber(readValue(argv, i, '--desktop-viewport'), '--desktop-viewport'); i += 1; }
    else if (arg === '--desktop-height') { opts.desktopViewportHeight = parseFiniteNumber(readValue(argv, i, '--desktop-height'), '--desktop-height'); i += 1; }
    else if (arg === '--mobile-viewport') { opts.mobileViewportWidth = parseFiniteNumber(readValue(argv, i, '--mobile-viewport'), '--mobile-viewport'); i += 1; }
    else if (arg === '--mobile-height') { opts.mobileViewportHeight = parseFiniteNumber(readValue(argv, i, '--mobile-height'), '--mobile-height'); i += 1; }
    else if (arg === '--wait') { opts.waitMs = parseFiniteNumber(readValue(argv, i, '--wait'), '--wait'); i += 1; }
    else if (arg === '--hide') { opts.hideSelectors.push(readValue(argv, i, '--hide')); i += 1; }
    else if (arg === '--protocol-timeout') { opts.protocolTimeout = parseFiniteNumber(readValue(argv, i, '--protocol-timeout'), '--protocol-timeout'); i += 1; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function usage() {
  console.log(`Usage:
  node final_showcase_capture.js --base <preview-url> --out <theme-root>/final-showcase [options]

Home showcase (always written to --out root — guard contract, human-readable names):
  Trang chủ.png                 (desktop crop 876×2000)
  Trang chủ-mobile.png          (mobile crop 276×480)
  Trang chủ-fullpage.png        (desktop fullpage raw)
  Trang chủ-mobile-fullpage.png (mobile fullpage raw)

Multi-template capture:
  --all-templates          Capture default template set (collection, product, blog, ...)
  --paths-file <json>      Map of template key → path (merges over defaults)
  --paths k=v,k=v          Inline map (merges last)
  --theme-id <id>          Append ?themeid=<id> (or &themeid=) to every path
  --no-mobile-pages        Skip mobile captures under pages/ (default)
  --mobile-pages           Also capture mobile PNGs under pages/
  --hide <selector>        CSS selector to hide during capture (repeatable)
  --protocol-timeout <ms>  Puppeteer protocolTimeout in ms (default: 90000)
  Home guard contract still always writes both desktop + mobile crops.

Default template keys:
  home, collection, product, blog, article, page-default, page-custom, login, register

Page PNGs under pages/ use readable Vietnamese names, e.g.:
  Trang chi tiết sản phẩm.png
  Trang chi tiết bài viết.png
  Trang nhóm sản phẩm.png
  (not product-desktop.png / article-desktop.png)
  Mobile optional: Trang chi tiết sản phẩm-mobile.png

Empty product/article/page-custom paths are skipped with a WARNING unless provided
via --paths-file / --paths. Prefer real handles from the merchant store.

Example:
  npm run final:capture -- --base https://shop.myharavan.com --out <theme>/final-showcase --all-templates --theme-id 1001501441 --paths-file <theme>/final-showcase/CAPTURE_PATHS.json
`);
}

function parsePathMap(raw) {
  const map = {};
  const labels = {};
  // Support "key=path,key=path" and plain CSV paths (auto-keyed page-1..)
  const parts = parseCsv(raw);
  let anon = 0;
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const rawKey = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      const key = toAsciiSlug(rawKey);
      if (!key) throw new Error(`Invalid --paths entry (empty key): ${part}`);
      map[key] = value;
      if (/[^\x00-\x7F]/.test(rawKey) || /\s/.test(rawKey)) {
        labels[key] = rawKey.normalize('NFC');
      }
    } else {
      anon += 1;
      map[anon === 1 ? 'home' : `page-${anon}`] = part;
    }
  }
  return { map, labels };
}

function loadJsonObject(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} must be a JSON object of key → path`);
  }
  const map = {};
  const labels = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    let pagePath = '';
    let customLabel = '';
    if (typeof value === 'object' && value.path) {
      pagePath = String(value.path).trim();
      if (value.label) customLabel = String(value.label).trim().normalize('NFC');
    } else {
      pagePath = String(value).trim();
    }
    const cleanKey = toAsciiSlug(key) || 'page-custom';
    if (!customLabel && (/[^\x00-\x7F]/.test(key) || /\s/.test(key))) {
      customLabel = String(key).trim().normalize('NFC');
    }
    map[cleanKey] = pagePath;
    if (customLabel) labels[cleanKey] = customLabel;
  }
  return { map, labels };
}

function withThemeId(pagePath, themeId) {
  if (!themeId) return pagePath;
  if (/[?&]themeid=/i.test(pagePath)) return pagePath;
  const join = pagePath.includes('?') ? '&' : '?';
  return `${pagePath}${join}themeid=${encodeURIComponent(themeId)}`;
}

function resolveTemplateMap(opts) {
  const map = {};
  const labels = {};

  if (opts.allTemplates || opts.pathsFile || opts.paths) {
    Object.assign(map, DEFAULT_TEMPLATE_PATHS);
    if (opts.includeAuth) {
      if (!map.login) map.login = '/account/login';
      if (!map.register) map.register = '/account/register';
    }
  }
  if (opts.pathsFile) {
    const loaded = loadJsonObject(opts.pathsFile, '--paths-file');
    Object.assign(map, loaded.map);
    Object.assign(labels, loaded.labels);
  }
  if (opts.paths) {
    Object.assign(map, opts.paths.map);
    Object.assign(labels, opts.paths.labels);
  }

  // Single-path mode (legacy): only home unless multi flags set
  if (!opts.allTemplates && !opts.pathsFile && !opts.paths) {
    map.home = opts.pagePath || '/';
  } else if (opts.pagePath && opts.pagePath !== '/') {
    // Explicit --path wins for home when multi mode is on
    map.home = opts.pagePath;
  }

  if (!map.home) map.home = '/';

  // Drop empty optional paths
  const skipped = [];
  for (const [key, value] of Object.entries(map)) {
    if (!String(value || '').trim()) {
      skipped.push(key);
      delete map[key];
      delete labels[key];
    }
  }

  // Apply theme id
  for (const key of Object.keys(map)) {
    map[key] = withThemeId(map[key], opts.themeId);
  }

  return { map, labels, skipped };
}

async function freezeCarouselsAndAnimations(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.swiper, [class*="swiper"]')) {
      try {
        if (el.swiper) {
          if (el.swiper.autoplay && typeof el.swiper.autoplay.stop === 'function') {
            el.swiper.autoplay.stop();
          }
          if (typeof el.swiper.slideTo === 'function') {
            el.swiper.slideTo(0, 0, false);
          }
        }
      } catch (_) {}
    }
    for (const el of document.querySelectorAll('.splide, [class*="splide"]')) {
      try {
        if (el.splide && el.splide.Components && el.splide.Components.Autoplay) {
          el.splide.Components.Autoplay.pause();
        }
        if (el.splide && typeof el.splide.go === 'function') {
          el.splide.go(0);
        }
      } catch (_) {}
    }
    for (const el of document.querySelectorAll('[data-autoplay], [data-carousel], [data-slider], .hero-slider, .tw-hero-slider')) {
      el.removeAttribute('data-autoplay');
      el.setAttribute('data-autoplay-paused', 'true');
      const slides = el.querySelectorAll('.swiper-slide, .splide__slide, .slide, [data-slide]');
      slides.forEach((s, idx) => {
        s.style.setProperty('transition-duration', '0s', 'important');
        s.style.setProperty('animation-duration', '0s', 'important');
        if (idx === 0) {
          s.classList.add('is-active', 'swiper-slide-active', 'active');
          s.style.setProperty('opacity', '1', 'important');
          s.style.setProperty('visibility', 'visible', 'important');
        }
      });
    }
  });
}

async function primeLazyAssets(page, waitMs) {
  await freezeCarouselsAndAnimations(page);
  await page.evaluate(() => {
    const srcAttrs = ['data-src', 'data-original', 'data-lazy', 'data-lazy-src'];
    const srcsetAttrs = ['data-srcset', 'data-lazy-srcset'];

    for (const source of document.querySelectorAll('source')) {
      const srcset = srcsetAttrs.map((attr) => source.getAttribute(attr)).find(Boolean);
      if (srcset && !source.getAttribute('srcset')) source.setAttribute('srcset', srcset);
    }

    for (const img of document.images) {
      img.loading = 'eager';
      img.decoding = 'sync';
      const src = srcAttrs.map((attr) => img.getAttribute(attr)).find(Boolean);
      const srcset = srcsetAttrs.map((attr) => img.getAttribute(attr)).find(Boolean);
      const currentSrc = img.getAttribute('src') || '';
      const isPlaceholder = !currentSrc || currentSrc.startsWith('data:') || /blank|placeholder|transparent/i.test(currentSrc);
      if (srcset && !img.getAttribute('srcset')) img.setAttribute('srcset', srcset);
      if (src && isPlaceholder) img.setAttribute('src', src);
    }

    for (const node of document.querySelectorAll('[data-bg], [data-background], [data-background-image]')) {
      const value = node.getAttribute('data-bg') || node.getAttribute('data-background') || node.getAttribute('data-background-image');
      if (!value) continue;
      node.style.backgroundImage = value.startsWith('url(') ? value : `url("${value}")`;
    }
  });

  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const step = Math.max(320, Math.floor(viewport.height * 0.75));
  const pause = Math.min(450, Math.max(160, Math.floor(waitMs / 12)));
  let previousHeight = 0;

  for (let pass = 0; pass < 2; pass += 1) {
    const pageHeight = await page.evaluate(() => Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    ));
    for (let y = 0; y <= pageHeight; y += step) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await sleep(pause);
    }
    if (pageHeight === previousHeight) break;
    previousHeight = pageHeight;
  }

  try {
    await page.waitForFunction(() => {
      const docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      return Array.from(document.images).every((img) => {
        const style = window.getComputedStyle(img);
        if (style.display === 'none' || style.visibility === 'hidden') return true;
        const rect = img.getBoundingClientRect();
        const absTop = rect.top + (window.scrollY || 0);
        const absBottom = rect.bottom + (window.scrollY || 0);
        if (rect.width === 0 || rect.height === 0 || absBottom <= 0 || absTop >= docH) return true;
        const src = img.currentSrc || img.getAttribute('src') || '';
        if (!src || src.startsWith('data:image/svg')) return true;
        return img.complete && img.naturalWidth > 0;
      });
    }, { timeout: Math.max(4000, waitMs) });
  } catch (_) {
    const retryCount = await page.evaluate(() => {
      let retried = 0;
      for (const img of document.images) {
        const style = window.getComputedStyle(img);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const src = img.currentSrc || img.getAttribute('src') || '';
        if (!src || src.startsWith('data:image/svg')) continue;
        if (!img.complete || img.naturalWidth === 0) {
          img.src = src;
          retried += 1;
        }
      }
      return retried;
    });
    if (retryCount > 0) {
      console.warn(`  WARN: ${retryCount} image(s) still incomplete after initial settle; retrying load...`);
      await sleep(2000);
    }
  }

  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-aos]')) {
      el.classList.add('aos-animate');
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.visibility = 'visible';
    }
    if (typeof document.getAnimations === 'function') {
      try {
        for (const anim of document.getAnimations()) {
          try { anim.finish(); } catch (_) {}
        }
      } catch (_) {}
    }
  });
  await freezeCarouselsAndAnimations(page);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(Math.min(800, Math.max(300, Math.floor(waitMs / 4))));
}

/** Counts displayed images that carry a source; broken lists the sources that never decoded (naturalWidth 0, finished or not). Inline svg placeholders are exempt, as in the settle wait above. */
async function measureImageHealth(page) {
  const measured = await page.evaluate(() => {
    let total = 0;
    const broken = [];
    for (const img of document.images) {
      const style = window.getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden' || img.getClientRects().length === 0) continue;
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!src || src.startsWith('data:image/svg')) continue;
      total += 1;
      if (!img.complete || img.naturalWidth === 0) broken.push(src);
    }
    return { total, broken };
  });
  return { total: measured.total, broken: measured.broken, measuredAt: new Date().toISOString() };
}

/** One imageHealth record per template entry; absent when any expected viewport went unmeasured so the pre-showcase gate reports UNMEASURED instead of a partial pass. */
function combineImageHealth(byViewport, expectedViewports) {
  const names = Object.keys(byViewport).filter((name) => byViewport[name]);
  if (!names.length || expectedViewports.some((name) => !byViewport[name])) return null;
  const broken = [...new Set(names.flatMap((name) => byViewport[name].broken))];
  const measuredAt = names.map((name) => byViewport[name].measuredAt).sort().pop();
  const viewports = Object.fromEntries(names.map((name) => [name, { total: byViewport[name].total, broken: byViewport[name].broken }]));
  return { total: names.reduce((sum, name) => sum + byViewport[name].total, 0), broken, measuredAt, viewports };
}

async function handleStorefrontPassword(page) {
  const password = process.env.HARAVAN_STOREFRONT_PASSWORD || process.env.STOREFRONT_PASSWORD;
  if (!password) return;
  try {
    const hasPasswordInput = await page.$('input[type="password"], input[name="password"]');
    if (hasPasswordInput) {
      console.log('Detected storefront password prompt, entering credentials...');
      await hasPasswordInput.type(password);
      const submitBtn = await page.$('form button[type="submit"], form input[type="submit"], button[type="submit"]');
      if (submitBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {}),
          submitBtn.click()
        ]);
      } else {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {}),
          hasPasswordInput.press('Enter')
        ]);
      }
      await sleep(1000);
    }
  } catch (err) {
    console.warn(`WARN: storefront password handling failed: ${err.message}`);
  }
}

async function dismissTransientOverlays(page, hideSelectors = []) {
  await page.evaluate((extraSelectors) => {
    // 1. Kill preview bars, admin bars, floating widgets and notification overlays
    const killList = [
      '#preview-bar-iframe',
      '#admin_bar_iframe',
      '.preview-bar',
      '[class*="preview-bar"]',
      'iframe[src*="preview_bar"]',
      'iframe[src*="preview-bar"]',
      'iframe[src*="admin/bar"]',
      '#PBarNextFrameWrapper',
      '#PBarNextFrame',
      '.hrv-theme-preview',
      '[id*="PreviewBar"]',
      '[class*="PreviewBar"]',
      '#haravan-notification',
      'float-social',
      '.rb-float-social',
      '[class*="float-social"]',
      'newsletter-modal',
      '.newsletter-modal',
      '.toast-container',
      '[class*="toast-container"]',
      '.f1zs-livechatchannels',
      '[id*="fb-root"]',
      '#fb-root',
      '.widget-chat',
      '#widget-chat',
      '[class*="chat-widget"]',
      '[id*="chat-widget"]',
      '[class*="chat-fab"]',
      '[id*="chat-fab"]',
      '.az-support',
      '[data-az-support]',
      '.back-to-top',
      '[class*="back-to-top"]',
      ...(Array.isArray(extraSelectors) ? extraSelectors : [])
    ];
    for (const sel of killList) {
      if (!sel || typeof sel !== 'string') continue;
      let nodes = [];
      try {
        nodes = document.querySelectorAll(sel);
      } catch (_) {
        continue;
      }
      for (const el of nodes) {
        el.classList.remove('active', 'is-open');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        try { el.remove(); } catch (_) {}
      }
    }

    // 2. Kill fixed/sticky preview strips by text signature
    const candidates = document.querySelectorAll('div, section, aside, footer');
    let checked = 0;
    for (const el of candidates) {
      if (checked > 100) break;
      const style = window.getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      checked += 1;
      const t = (el.textContent || '').trim().slice(0, 140);
      if (/currently previewing the theme|đang xem trước|previewing the theme|bỏ xem trước|AI hỗ trợ/i.test(t)) {
        try { el.remove(); } catch (_) {
          el.style.setProperty('display', 'none', 'important');
        }
      }
    }

    // 3. Close transient modals & popups: explicit close controls only, never type=submit, skip invisible/0x0 dialogs
    const overlaySelectors = [
      '[role="dialog"]',
      '.modal',
      '.popup',
      '.newsletter',
      '.newsletter-popup',
      '[class*="popup"]',
      '[class*="modal"]'
    ];
    const closeSelectors = '[data-action^="close"]:not([type="submit"]), [aria-label*="close" i]:not([type="submit"]), [aria-label*="đóng" i]:not([type="submit"]), .close:not([type="submit"]), button[data-dismiss]:not([type="submit"])';

    for (const selector of overlaySelectors) {
      for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) continue;
        const cs = window.getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
        if (el.hasAttribute('hidden') || el.closest('[hidden]')) continue;
        const closeButton = el.querySelector(closeSelectors);
        if (closeButton) {
          const btnType = (closeButton.getAttribute('type') || closeButton.type || '').toLowerCase();
          if (btnType !== 'submit') {
            closeButton.click();
          }
        }
      }
    }

    const inFixedLayer = (node) => {
      for (let n = node; n && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).position === 'fixed') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('[class*="overlay"], .modal-backdrop, .popup-overlay, .newsletter-overlay')) {
      if (!el.matches('.modal-backdrop, .popup-overlay, .newsletter-overlay') && !inFixedLayer(el)) continue;
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    }
  }, hideSelectors);
  await sleep(600);
}

async function capturePageFullOrSliced(page) {
  const metrics = await page.evaluate(() => ({
    docWidth: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
    docHeight: Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    ),
    viewportWidth: window.innerWidth || 1200,
    viewportHeight: window.innerHeight || 800
  }));
  const totalHeight = Number(metrics?.docHeight || 0);
  const totalWidth = Number(metrics?.docWidth || metrics?.viewportWidth || 1200);
  if (!totalHeight || totalHeight <= MAX_SAFE_FULLPAGE_HEIGHT) {
    return await page.screenshot({ fullPage: true, type: 'png' });
  }
  const slices = [];
  for (let y = 0; y < totalHeight; y += MAX_SAFE_FULLPAGE_HEIGHT) {
    const sliceH = Math.min(MAX_SAFE_FULLPAGE_HEIGHT, totalHeight - y);
    const clipBuf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y, width: totalWidth, height: sliceH },
      captureBeyondViewport: true
    });
    slices.push(decodePngToRawRgba(clipBuf));
  }
  const stitchedWidth = slices[0].width;
  const stitchedHeight = slices.reduce((acc, s) => acc + s.height, 0);
  const combined = Buffer.alloc(stitchedWidth * stitchedHeight * 4);
  let offsetBytes = 0;
  for (const s of slices) {
    s.data.copy(combined, offsetBytes);
    offsetBytes += s.data.length;
  }
  return encodeRawRgbaToPng(stitchedWidth, stitchedHeight, combined);
}

async function captureFullPage(browserOrPage, urlOrFilePath, viewport, waitMs, filePath, opts = {}) {
  // Support direct (page, filePath) invocation for unit tests & direct page callers
  if (browserOrPage && typeof browserOrPage.screenshot === 'function' && typeof urlOrFilePath === 'string' && !viewport) {
    const buffer = await capturePageFullOrSliced(browserOrPage);
    writeFileAtomic(urlOrFilePath, buffer);
    return buffer;
  }
  const browser = browserOrPage;
  const url = urlOrFilePath;
  const buffer = await withPage(browser, {
    viewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      isMobile: viewport.width <= 480,
      hasTouch: viewport.width <= 480
    },
    beforeNavigate: async (page) => {
      await page.evaluateOnNewDocument(() => {
        try {
          window.localStorage.setItem('newsletter_popup_closed_v2', 'true');
          window.sessionStorage.setItem('newsletter_popup_closed_v2', 'true');
        } catch (_) {}
      });
    }
  }, async (page) => {
    await navigateAndSettle(page, url, { waitMs: 0 });
    await handleStorefrontPassword(page);
    await primeLazyAssets(page, waitMs);
    await dismissTransientOverlays(page, opts.hideSelectors);
    await sleep(Math.min(1200, Math.max(400, Math.floor(waitMs / 3))));

    if (typeof opts.onImageHealth === 'function') {
      try {
        opts.onImageHealth(await measureImageHealth(page));
      } catch (err) {
        console.warn(`  WARN: image health not measured for ${url}: ${err.message}`);
      }
    }
    const currentUrl = page.url();
    if (/\/search\b/i.test(currentUrl) && !/\/search\b/i.test(url)) {
      throw new Error(`Unexpected navigation away to ${currentUrl} while capturing ${url}`);
    }
    return await capturePageFullOrSliced(page);
  });
  writeFileAtomic(filePath, buffer);
  return buffer;
}

/** Bounded retry per page capture to absorb transient CDP/network timeouts. */
async function captureFullPageWithRetry(getBrowser, url, viewport, waitMs, filePath, opts = {}, maxAttempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const browser = typeof getBrowser === 'function' ? await getBrowser() : getBrowser;
      return await captureFullPage(browser, url, viewport, waitMs, filePath, opts);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        console.warn(`\n  WARN: capture failed for ${url} (attempt ${attempt}/${maxAttempts}): ${err.message}. Retrying in 2s...`);
        await sleep(2000);
      }
    }
  }
  throw lastError;
}

async function resizeCrop(arg1, arg2, arg3, arg4, arg5) {
  let sourceBuffer;
  let targetWidth;
  let targetHeight;
  let filePath;
  if (Buffer.isBuffer(arg1)) {
    sourceBuffer = arg1;
    filePath = arg2;
    targetWidth = arg3;
    targetHeight = arg4;
  } else {
    sourceBuffer = arg2;
    targetWidth = arg3;
    targetHeight = arg4;
    filePath = arg5;
  }
  let outBuffer;
  if (sharpLib) {
    outBuffer = await sharpLib(sourceBuffer)
      .resize({ width: targetWidth })
      .extract({ left: 0, top: 0, width: targetWidth, height: targetHeight })
      .png()
      .toBuffer();
  } else {
    const decoded = decodePngToRawRgba(sourceBuffer);
    const croppedRgba = resizeAndTopCropRawRgba(decoded, targetWidth, targetHeight);
    outBuffer = encodeRawRgbaToPng(targetWidth, targetHeight, croppedRgba);
  }
  if (filePath) {
    writeFileAtomic(filePath, outBuffer);
  }
  return outBuffer;
}

async function captureHomeShowcase(browser, opts, homePath, manifest) {
  const url = buildUrl(opts.base, homePath);
  const desktopRaw = path.join(opts.out, HOME_SHOWCASE_FILES.desktopRaw);
  const mobileRaw = path.join(opts.out, HOME_SHOWCASE_FILES.mobileRaw);
  const desktopFinal = path.join(opts.out, HOME_SHOWCASE_FILES.desktopCrop);
  const mobileFinal = path.join(opts.out, HOME_SHOWCASE_FILES.mobileCrop);

  const health = {};
  const desktopBuffer = await captureFullPageWithRetry(
    browser,
    url,
    { width: opts.desktopViewportWidth, height: opts.desktopViewportHeight },
    opts.waitMs,
    desktopRaw,
    { ...opts, onImageHealth: (record) => { health.desktop = record; } }
  );
  const desktopCropped = await resizeCrop(desktopBuffer, null, opts.desktopOutWidth, opts.desktopOutHeight);
  writeFileAtomic(desktopFinal, desktopCropped);

  const mobileBuffer = await captureFullPageWithRetry(
    browser,
    url,
    { width: opts.mobileViewportWidth, height: opts.mobileViewportHeight },
    opts.waitMs,
    mobileRaw,
    { ...opts, onImageHealth: (record) => { health.mobile = record; } }
  );
  const mobileCropped = await resizeCrop(mobileBuffer, null, opts.mobileOutWidth, opts.mobileOutHeight);
  writeFileAtomic(mobileFinal, mobileCropped);

  const imageHealth = combineImageHealth(health, ['desktop', 'mobile']);
  manifest.templates.home = {
    path: homePath,
    url,
    files: {
      desktopRaw: path.basename(desktopRaw),
      mobileRaw: path.basename(mobileRaw),
      desktopCrop: path.basename(desktopFinal),
      mobileCrop: path.basename(mobileFinal)
    },
    ...(imageHealth ? { imageHealth } : {})
  };

  return { url, desktopRaw, mobileRaw, desktopFinal, mobileFinal };
}

async function captureTemplatePage(browser, opts, key, pagePath, pagesDir, manifest, customLabel) {
  const url = buildUrl(opts.base, pagePath);
  const label = resolvePageLabel(key, pagePath, customLabel);
  const entry = { path: pagePath, url, label, files: {} };

  const desktopFile = path.join(pagesDir, pageShotFilename(key, 'desktop', pagePath, customLabel));
  const health = {};
  await captureFullPageWithRetry(
    browser,
    url,
    { width: opts.desktopViewportWidth, height: opts.desktopViewportHeight },
    opts.waitMs,
    desktopFile,
    { ...opts, onImageHealth: (record) => { health.desktop = record; } }
  );
  entry.files.desktop = path.relative(opts.out, desktopFile).replace(/\\/g, '/');

  if (opts.includeMobilePages) {
    const mobileFile = path.join(pagesDir, pageShotFilename(key, 'mobile', pagePath, customLabel));
    await captureFullPageWithRetry(
      browser,
      url,
      { width: opts.mobileViewportWidth, height: opts.mobileViewportHeight },
      opts.waitMs,
      mobileFile,
      { ...opts, onImageHealth: (record) => { health.mobile = record; } }
    );
    entry.files.mobile = path.relative(opts.out, mobileFile).replace(/\\/g, '/');
  }

  const imageHealth = combineImageHealth(health, opts.includeMobilePages ? ['desktop', 'mobile'] : ['desktop']);
  if (imageHealth) entry.imageHealth = imageHealth;
  manifest.templates[key] = entry;
  return entry;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    return 0;
  }
  if (!opts.base) {
    usage();
    console.error('\nERROR: --base is required.');
    return 1;
  }
  if (!opts.out) {
    usage();
    console.error('\nERROR: --out is required and must point to <theme-root>/final-showcase.');
    return 1;
  }

  const { map, labels, skipped } = resolveTemplateMap(opts);
  fs.mkdirSync(opts.out, { recursive: true });

  const multi = Object.keys(map).some((key) => key !== 'home');
  const pagesDir = path.join(opts.out, 'pages');
  if (multi) fs.mkdirSync(pagesDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    base: opts.base,
    themeId: opts.themeId || null,
    skippedEmptyPaths: skipped,
    templates: {}
  };

  const puppeteer = requirePuppeteer();
  const launchOptions = {
    headless: 'new',
    protocolTimeout: opts.protocolTimeout || 90000,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--allow-file-access-from-files']
  };
  let browser = await puppeteer.launch(launchOptions);
  const getBrowser = async () => {
    if (!browser.isConnected()) {
      console.warn('WARN: browser disconnected, relaunching new instance...');
      browser = await puppeteer.launch(launchOptions);
    }
    return browser;
  };

  try {
    const home = await captureHomeShowcase(getBrowser, opts, map.home, manifest);

    const extraKeys = Object.keys(map).filter((key) => key !== 'home').sort();
    for (const key of extraKeys) {
      process.stdout.write(`Capturing ${key} → ${map[key]} ... `);
      await captureTemplatePage(getBrowser, opts, key, map[key], pagesDir, manifest, labels ? labels[key] : undefined);
      console.log('ok');
    }

    const manifestPath = path.join(opts.out, 'CAPTURE_MANIFEST.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    // Seed CAPTURE_PATHS.json if missing so merchant can fill product/article handles next run
    const seedPath = path.join(opts.out, 'CAPTURE_PATHS.json');
    if (!fs.existsSync(seedPath)) {
      const seed = { ...DEFAULT_TEMPLATE_PATHS, ...Object.fromEntries(
        Object.entries(map).map(([k, v]) => [k, v.replace(/([?&])themeid=[^&]*/i, '').replace(/[?&]$/, '') || '/'])
      ) };
      fs.writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
    }

    console.log('# Final Showcase Capture');
    console.log(`Base: ${opts.base}`);
    console.log(`Home URL: ${home.url}`);
    console.log(`Desktop: ${home.desktopFinal}`);
    console.log(`Mobile: ${home.mobileFinal}`);
    console.log(`Raw desktop: ${home.desktopRaw}`);
    console.log(`Raw mobile: ${home.mobileRaw}`);
    if (extraKeys.length) {
      console.log(`Extra templates: ${extraKeys.join(', ')}`);
      console.log(`Pages dir: ${pagesDir}`);
    }
    if (skipped.length) {
      console.log(`WARNING: skipped empty paths (provide real handles): ${skipped.join(', ')}`);
    }
    console.log(`Manifest: ${manifestPath}`);
    console.log(`Home showcase files: ${Object.values(HOME_SHOWCASE_FILES).join(', ')}`);
    return 0;
  } finally {
    try {
      if (browser.isConnected()) await browser.close();
    } catch (_) {}
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  toAsciiSlug,
  sanitizeKey,
  resolvePageLabel,
  pageShotFilename,
  loadJsonObject,
  parsePathMap,
  resolveTemplateMap,
  dismissTransientOverlays,
  captureFullPage,
  measureImageHealth,
  combineImageHealth,
  captureFullPageWithRetry,
  resizeCrop,
  decodePngToRawRgba,
  encodeRawRgbaToPng,
  MAX_SAFE_FULLPAGE_HEIGHT,
  DEFAULT_HIDE_SELECTORS
};
