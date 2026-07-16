#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue, parseFiniteNumber, parseCsv } = require('./lib/cli-args');
const { buildUrl } = require('./lib/path-utils');
const { requirePuppeteer, sleep, navigateAndSettle, withPage } = require('./lib/puppeteer-utils');

/** Default storefront templates for final handoff capture (paths may be overridden). */
const DEFAULT_TEMPLATE_PATHS = {
  home: '/',
  collection: '/collections/all',
  product: '',
  blog: '/blogs/news',
  article: '',
  'page-default': '/pages/about-us',
  'page-custom': '',
  login: '/account/login',
  register: '/account/register'
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

/** Resolve readable page title for screenshot filenames from key + URL path. */
function resolvePageLabel(key, pagePath) {
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
  const safe = String(key || 'trang').replace(/[-_]+/g, ' ').trim();
  return `Trang ${safe}`;
}

/**
 * Human-readable page screenshot filename.
 * Desktop (default): "Trang chi tiết sản phẩm.png"
 * Mobile (optional): "Trang chi tiết sản phẩm-mobile.png"
 */
function pageShotFilename(key, device, pagePath) {
  const label = resolvePageLabel(key, pagePath);
  // Windows-safe: keep Vietnamese letters/spaces; strip path separators only
  const safe = label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  if (device === 'mobile') return `${safe}-mobile.png`;
  return `${safe}.png`;
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
    out: path.resolve(process.cwd(), '..', 'final-showcase'),
    pathsFile: '',
    paths: null,
    allTemplates: false,
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
    else if (arg === '--theme-id') { opts.themeId = String(readValue(argv, i, '--theme-id')).trim(); i += 1; }
    else if (arg === '--no-mobile-pages') opts.includeMobilePages = false;
    else if (arg === '--mobile-pages') opts.includeMobilePages = true;
    else if (arg === '--desktop-viewport') { opts.desktopViewportWidth = parseFiniteNumber(readValue(argv, i, '--desktop-viewport'), '--desktop-viewport'); i += 1; }
    else if (arg === '--desktop-height') { opts.desktopViewportHeight = parseFiniteNumber(readValue(argv, i, '--desktop-height'), '--desktop-height'); i += 1; }
    else if (arg === '--mobile-viewport') { opts.mobileViewportWidth = parseFiniteNumber(readValue(argv, i, '--mobile-viewport'), '--mobile-viewport'); i += 1; }
    else if (arg === '--mobile-height') { opts.mobileViewportHeight = parseFiniteNumber(readValue(argv, i, '--mobile-height'), '--mobile-height'); i += 1; }
    else if (arg === '--wait') { opts.waitMs = parseFiniteNumber(readValue(argv, i, '--wait'), '--wait'); i += 1; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function usage() {
  console.log(`Usage:
  node final_showcase_capture.js --base <preview-url> [options]

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
  npm run final:capture -- --base https://shop.myharavan.com --all-templates --theme-id 1001501441 --paths-file final-showcase/CAPTURE_PATHS.json
`);
}

function parsePathMap(raw) {
  const map = {};
  // Support "key=path,key=path" and plain CSV paths (auto-keyed page-1..)
  const parts = parseCsv(raw);
  let anon = 0;
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const key = sanitizeKey(part.slice(0, eq));
      const value = part.slice(eq + 1).trim();
      if (!key) throw new Error(`Invalid --paths entry (empty key): ${part}`);
      map[key] = value;
    } else {
      anon += 1;
      map[anon === 1 ? 'home' : `page-${anon}`] = part;
    }
  }
  return map;
}

function sanitizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    if (typeof value === 'object' && value.path) {
      map[sanitizeKey(key)] = String(value.path).trim();
    } else {
      map[sanitizeKey(key)] = String(value).trim();
    }
  }
  return map;
}

function withThemeId(pagePath, themeId) {
  if (!themeId) return pagePath;
  if (/[?&]themeid=/i.test(pagePath)) return pagePath;
  const join = pagePath.includes('?') ? '&' : '?';
  return `${pagePath}${join}themeid=${encodeURIComponent(themeId)}`;
}

function resolveTemplateMap(opts) {
  const map = {};

  if (opts.allTemplates || opts.pathsFile || opts.paths) {
    Object.assign(map, DEFAULT_TEMPLATE_PATHS);
  }

  if (opts.pathsFile) {
    Object.assign(map, loadJsonObject(opts.pathsFile, '--paths-file'));
  }
  if (opts.paths) Object.assign(map, opts.paths);

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
    }
  }

  // Apply theme id
  for (const key of Object.keys(map)) {
    map[key] = withThemeId(map[key], opts.themeId);
  }

  return { map, skipped };
}

async function primeLazyAssets(page, waitMs) {
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
    await page.waitForFunction(() => Array.from(document.images).every((img) => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!src || src.startsWith('data:image/svg')) return true;
      return img.complete && img.naturalWidth > 0;
    }), { timeout: Math.max(3000, waitMs) });
  } catch (_) {}

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(Math.min(800, Math.max(300, Math.floor(waitMs / 4))));
}

async function dismissTransientOverlays(page) {
  await page.evaluate(() => {
    const overlaySelectors = [
      '[role="dialog"]',
      '.modal',
      '.popup',
      '.newsletter',
      '.newsletter-popup',
      '[class*="popup"]',
      '[class*="modal"]'
    ];
    const closeSelectors = 'button, [role="button"], .close, [aria-label*="close" i], [title*="close" i], [class*="close"]';

    for (const selector of overlaySelectors) {
      for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) continue;
        const closeButton = el.querySelector(closeSelectors);
        if (closeButton) closeButton.click();
      }
    }

    for (const el of document.querySelectorAll('[class*="overlay"], .modal-backdrop, .popup-overlay, .newsletter-overlay')) {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    }
  });
  await sleep(600);
}

async function captureFullPage(browser, url, viewport, waitMs, filePath) {
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
    await primeLazyAssets(page, waitMs);
    await dismissTransientOverlays(page);
    if (waitMs > 0) await sleep(waitMs);
    await dismissTransientOverlays(page);
    return await page.screenshot({ fullPage: true, type: 'png' });
  });
  fs.writeFileSync(filePath, buffer);
  return buffer;
}

async function resizeCrop(browser, sourceBuffer, targetWidth, targetHeight, filePath) {
  const tmpFile = filePath + '.tmp.png';
  fs.writeFileSync(tmpFile, sourceBuffer);
  const fileUrl = 'file:///' + tmpFile.replace(/\\/g, '/').replace(/^\/+/, '');

  try {
    const outputBase64 = await withPage(browser, { viewport: { width: targetWidth, height: targetHeight } }, async (page) => {
      await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });
      return await page.evaluate(({ w, h }) => {
        const img = document.querySelector('img');
        if (!img) return null;
        const scale = w / img.naturalWidth;
        const scaledH = Math.ceil(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, scaledH);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { w: targetWidth, h: targetHeight });
    });
    if (!outputBase64) throw new Error('resizeCrop: canvas returned null - check source PNG');
    fs.writeFileSync(filePath, Buffer.from(outputBase64, 'base64'));
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

async function captureHomeShowcase(browser, opts, homePath, manifest) {
  const url = buildUrl(opts.base, homePath);
  const desktopRaw = path.join(opts.out, HOME_SHOWCASE_FILES.desktopRaw);
  const mobileRaw = path.join(opts.out, HOME_SHOWCASE_FILES.mobileRaw);
  const desktopFinal = path.join(opts.out, HOME_SHOWCASE_FILES.desktopCrop);
  const mobileFinal = path.join(opts.out, HOME_SHOWCASE_FILES.mobileCrop);

  const desktopBuffer = await captureFullPage(
    browser,
    url,
    { width: opts.desktopViewportWidth, height: opts.desktopViewportHeight },
    opts.waitMs,
    desktopRaw
  );
  await resizeCrop(browser, desktopBuffer, opts.desktopOutWidth, opts.desktopOutHeight, desktopFinal);

  const mobileBuffer = await captureFullPage(
    browser,
    url,
    { width: opts.mobileViewportWidth, height: opts.mobileViewportHeight },
    opts.waitMs,
    mobileRaw
  );
  await resizeCrop(browser, mobileBuffer, opts.mobileOutWidth, opts.mobileOutHeight, mobileFinal);

  manifest.templates.home = {
    path: homePath,
    url,
    files: {
      desktopRaw: path.basename(desktopRaw),
      mobileRaw: path.basename(mobileRaw),
      desktopCrop: path.basename(desktopFinal),
      mobileCrop: path.basename(mobileFinal)
    }
  };

  return { url, desktopRaw, mobileRaw, desktopFinal, mobileFinal };
}

async function captureTemplatePage(browser, opts, key, pagePath, pagesDir, manifest) {
  const url = buildUrl(opts.base, pagePath);
  const label = resolvePageLabel(key, pagePath);
  const entry = { path: pagePath, url, label, files: {} };

  const desktopFile = path.join(pagesDir, pageShotFilename(key, 'desktop', pagePath));
  await captureFullPage(
    browser,
    url,
    { width: opts.desktopViewportWidth, height: opts.desktopViewportHeight },
    opts.waitMs,
    desktopFile
  );
  entry.files.desktop = path.relative(opts.out, desktopFile).replace(/\\/g, '/');

  if (opts.includeMobilePages) {
    const mobileFile = path.join(pagesDir, pageShotFilename(key, 'mobile', pagePath));
    await captureFullPage(
      browser,
      url,
      { width: opts.mobileViewportWidth, height: opts.mobileViewportHeight },
      opts.waitMs,
      mobileFile
    );
    entry.files.mobile = path.relative(opts.out, mobileFile).replace(/\\/g, '/');
  }

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

  const { map, skipped } = resolveTemplateMap(opts);
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
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const home = await captureHomeShowcase(browser, opts, map.home, manifest);

    const extraKeys = Object.keys(map).filter((key) => key !== 'home').sort();
    for (const key of extraKeys) {
      process.stdout.write(`Capturing ${key} → ${map[key]} ... `);
      await captureTemplatePage(browser, opts, key, map[key], pagesDir, manifest);
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
    await browser.close();
  }
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
