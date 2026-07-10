#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue, parseFiniteNumber } = require('./lib/cli-args');
const { buildUrl } = require('./lib/path-utils');
const { requirePuppeteer, sleep, navigateAndSettle, withPage } = require('./lib/puppeteer-utils');

function parseArgs(argv) {
  const opts = {
    base: '',
    pagePath: '/',
    out: path.resolve(process.cwd(), '..', 'final-showcase'),
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
  node final_showcase_capture.js --base <preview-url> [--path /] [--out ../final-showcase]

Output:
  desktop-876x2000.png
  mobile-276x480.png
  desktop-fullpage-raw.png
  mobile-fullpage-raw.png
`);
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

  fs.mkdirSync(opts.out, { recursive: true });
  const url = buildUrl(opts.base, opts.pagePath);
  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const desktopRaw = path.join(opts.out, 'desktop-fullpage-raw.png');
    const mobileRaw = path.join(opts.out, 'mobile-fullpage-raw.png');
    const desktopFinal = path.join(opts.out, 'desktop-876x2000.png');
    const mobileFinal = path.join(opts.out, 'mobile-276x480.png');

    const desktopBuffer = await captureFullPage(browser, url, { width: opts.desktopViewportWidth, height: opts.desktopViewportHeight }, opts.waitMs, desktopRaw);
    await resizeCrop(browser, desktopBuffer, opts.desktopOutWidth, opts.desktopOutHeight, desktopFinal);

    const mobileBuffer = await captureFullPage(browser, url, { width: opts.mobileViewportWidth, height: opts.mobileViewportHeight }, opts.waitMs, mobileRaw);
    await resizeCrop(browser, mobileBuffer, opts.mobileOutWidth, opts.mobileOutHeight, mobileFinal);

    console.log('# Final Showcase Capture');
    console.log(`URL: ${url}`);
    console.log(`Desktop: ${desktopFinal}`);
    console.log(`Mobile: ${mobileFinal}`);
    console.log(`Raw desktop: ${desktopRaw}`);
    console.log(`Raw mobile: ${mobileRaw}`);
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
