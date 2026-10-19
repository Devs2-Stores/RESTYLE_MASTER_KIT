#!/usr/bin/env node
'use strict';
/**
 * Capture desktop feature-region screenshots for final:pptx.
 * Reads FEATURE_SHOTS.json (or --shots) and writes PNGs under final-showcase/features/.
 * Desktop only — no mobile captures.
 */
const fs = require('fs');
const path = require('path');
const { readValue, readEnum, parseCsv, parseFiniteNumber } = require('./lib/cli-args');
const { buildUrl } = require('./lib/path-utils');
const { requirePuppeteer, sleep, navigateAndSettle, withPage } = require('./lib/puppeteer-utils');

function parseArgs(argv) {
  const opts = {
    base: '',
    out: '',
    shots: '',
    themeId: '',
    waitMs: 2500,
    viewportWidth: 1440,
    viewportHeight: 1200,
    deviceScaleFactor: 1,
    only: [],
    navTimeoutMs: undefined,
    stage: 'none',
    help: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--base') { opts.base = readValue(argv, i, '--base'); i += 1; }
    else if (arg === '--out') { opts.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (arg === '--shots') { opts.shots = path.resolve(readValue(argv, i, '--shots')); i += 1; }
    else if (arg === '--theme-id') { opts.themeId = String(readValue(argv, i, '--theme-id')).trim(); i += 1; }
    else if (arg === '--wait') { opts.waitMs = parseFiniteNumber(readValue(argv, i, '--wait'), '--wait'); i += 1; }
    else if (arg === '--viewport') { opts.viewportWidth = parseFiniteNumber(readValue(argv, i, '--viewport'), '--viewport'); i += 1; }
    else if (arg === '--height') { opts.viewportHeight = parseFiniteNumber(readValue(argv, i, '--height'), '--height'); i += 1; }
    else if (arg === '--only') { opts.only = parseCsv(readValue(argv, i, '--only')); i += 1; }
    else if (arg === '--nav-timeout') { opts.navTimeoutMs = parseFiniteNumber(readValue(argv, i, '--nav-timeout'), '--nav-timeout'); i += 1; }
    else if (arg === '--stage') { opts.stage = readEnum(argv, i, '--stage', ['none', 'neutral']); i += 1; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function usage() {
  console.log(`Usage:
  node final_feature_capture.js --base <preview-url> --out <final-showcase> [--shots FEATURE_SHOTS.json]
    [--only <id,id>] [--nav-timeout <ms>] [--stage none|neutral]

Desktop-only feature region capture for PPTX slides.
Writes PNGs under <out>/features/ and FEATURE_SHOTS_MANIFEST.json.

Options:
  --only <id,id>     Capture only the listed shot ids (unknown ids are an error).
  --nav-timeout <ms> Navigation timeout per shot (default 60000).
  --stage neutral    Generic staging: unstick headers and hide other fixed/sticky chrome that does not
                     contain the shot target. none (default) only removes the Haravan preview bar.

No theme-specific selector is built in. Widgets to hide and storage flags to pre-set are theme-owned:

FEATURE_SHOTS.json shape:
{
  "kill": [".cookie-bar"],                              // optional: hidden/removed on every shot (default none)
  "primeStorage": { "localStorage": { "popup_closed": "true" }, "sessionStorage": {} },   // optional
  "shots": [
    {
      "id": "flash-sale",
      "path": "/",
      "selector": ".home-flash",
      "file": "features/flash-sale.png",
      "kill": [".chat-bubble"],     // optional: extra hide list for this shot
      "click": ".open-btn",          // optional: click before capture
      "hover": ".menu-item",         // optional: hover before capture
      "keepOverlays": false,         // true = do not auto-dismiss popups
      "fullPage": false,             // true = full page instead of clip
      "padding": 12,
      "waitMs": 1500
    }
  ]
}
`);
}

function toSelectorArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty selector strings`);
  }
  return value.map((item) => item.trim());
}

function selectShots(shots, only) {
  if (!only || !only.length) return shots;
  const known = new Set(shots.map((shot) => shot.id).filter(Boolean));
  const unknown = only.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`--only names unknown shot id(s): ${unknown.join(', ')} (known: ${[...known].join(', ') || 'none'})`);
  return shots.filter((shot) => only.includes(shot.id));
}

function withThemeId(pagePath, themeId) {
  if (!themeId) return pagePath;
  if (/[?&]themeid=/i.test(pagePath)) return pagePath;
  const join = pagePath.includes('?') ? '&' : '?';
  return `${pagePath}${join}themeid=${encodeURIComponent(themeId)}`;
}

function loadShots(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`FEATURE_SHOTS not found: ${filePath}\nCopy FEATURE_SHOTS.template.json → final-showcase/FEATURE_SHOTS.json`);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid FEATURE_SHOTS JSON: ${error.message}`);
  }
  const shots = Array.isArray(data) ? data : data.shots;
  if (!Array.isArray(shots) || !shots.length) {
    throw new Error('FEATURE_SHOTS.shots must be a non-empty array');
  }
  return { meta: Array.isArray(data) ? {} : data, shots };
}

function sanitizeFile(rel, id) {
  if (rel) {
    return String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
  }
  return `features/${String(id || 'shot').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.png`;
}

async function dismissTransientOverlays(page, killSelectors = []) {
  await page.evaluate((killList) => {
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

    for (const sel of killList) {
      for (const el of document.querySelectorAll(sel)) {
        el.classList.remove('active', 'is-open');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        try { el.remove(); } catch (_) {}
      }
    }
    document.body.classList.remove('modal-open');
  }, killSelectors);
  await sleep(400);
}

async function primeLazyAssets(page, waitMs) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.swiper, [class*="swiper"]')) {
      try {
        if (el.swiper) {
          if (el.swiper.autoplay && typeof el.swiper.autoplay.stop === 'function') el.swiper.autoplay.stop();
          if (typeof el.swiper.slideTo === 'function') el.swiper.slideTo(0, 0, false);
        }
      } catch (_) {}
    }
    for (const el of document.querySelectorAll('[data-autoplay], [data-carousel], [data-slider], .hero-slider, .tw-hero-slider')) {
      el.removeAttribute('data-autoplay');
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
      const current = img.getAttribute('src') || '';
      const isPlaceholder = !current || current.startsWith('data:') || /blank|placeholder|transparent/i.test(current);
      if (srcset && !img.getAttribute('srcset')) img.setAttribute('srcset', srcset);
      if (src && isPlaceholder) img.setAttribute('src', src);
    }
  });
  const viewport = await page.evaluate(() => ({ height: window.innerHeight }));
  const step = Math.max(320, Math.floor(viewport.height * 0.8));
  const pageHeight = await page.evaluate(() => Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  ));
  for (let y = 0; y <= pageHeight; y += step) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await sleep(120);
  }
  try {
    await page.waitForFunction(() => Array.from(document.images).every((img) => {
      const style = window.getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!src || src.startsWith('data:image/svg')) return true;
      return img.complete && img.naturalWidth > 0;
    }), { timeout: Math.max(3500, waitMs) });
  } catch (_) {}
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(Math.min(600, Math.max(200, Math.floor(waitMs / 4))));
}

async function handleStorefrontPassword(page) {
  const password = process.env.HARAVAN_STOREFRONT_PASSWORD || process.env.STOREFRONT_PASSWORD;
  if (!password) return;
  try {
    const hasPasswordInput = await page.$('input[type="password"], input[name="password"]');
    if (hasPasswordInput) {
      console.log('Detected storefront password gate, entering credentials...');
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
function firstSelectorPart(selectorList) {
  return String(selectorList || '').split(',').map((s) => s.trim()).filter(Boolean)[0] || null;
}

async function forceShowElements(page, selectorList) {
  if (!selectorList) return;
  await page.evaluate((raw) => {
    const parts = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of parts) {
      for (const el of document.querySelectorAll(sel)) {
        el.hidden = false;
        el.removeAttribute('hidden');
        const computed = getComputedStyle(el);
        // Only force display when currently hidden — keep flex/grid if already used
        if (computed.display === 'none') {
          el.style.setProperty('display', 'block', 'important');
        }
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('pointer-events', 'auto', 'important');
      }
    }
  }, selectorList === true ? '' : selectorList);
  await sleep(250);
}

async function runShotSteps(page, shot) {
  const steps = Array.isArray(shot.steps) ? shot.steps : [];
  // Legacy single-step fields still work after steps
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const type = String(step.type || step.action || '').toLowerCase();
    try {
      if (type === 'wait' || type === 'sleep') {
        await sleep(Number(step.ms || step.waitMs || 500));
      } else if (type === 'hover' && step.selector) {
        await page.hover(step.selector);
        await sleep(step.waitMs || shot.hoverWaitMs || 600);
      } else if (type === 'click' && step.selector) {
        await page.click(step.selector, { delay: 20 });
        await sleep(step.waitMs || shot.clickWaitMs || 800);
      } else if (type === 'eval' || type === 'evaluate') {
        await page.evaluate(step.code || step.script || 'void 0');
        await sleep(step.waitMs || 200);
      } else if (type === 'forceshow' && step.selector) {
        await forceShowElements(page, step.selector);
      } else if (type === 'waitfor' && step.selector) {
        await page.waitForSelector(step.selector, {
          visible: step.visible === false ? false : true,
          timeout: step.timeout || 5000
        });
      } else if (type === 'scroll' && step.selector) {
        await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
        }, step.selector);
        await sleep(step.waitMs || 250);
      }
    } catch (error) {
      console.warn(`  WARN step ${type} failed: ${error.message}`);
    }
  }

  if (shot.forceShow) {
    const target = shot.forceShow === true ? shot.selector : shot.forceShow;
    await forceShowElements(page, target);
  }

  if (shot.hover) {
    try {
      await page.hover(shot.hover);
      await sleep(shot.hoverWaitMs || 600);
    } catch (error) {
      console.warn(`  WARN hover failed (${shot.hover}): ${error.message}`);
    }
  }

  if (shot.click) {
    try {
      await page.click(shot.click, { delay: 20 });
      await sleep(shot.clickWaitMs || 800);
    } catch (error) {
      console.warn(`  WARN click failed (${shot.click}): ${error.message}`);
    }
  }

  if (shot.waitFor) {
    try {
      await page.waitForSelector(shot.waitFor, {
        visible: shot.waitForVisible === false ? false : true,
        timeout: shot.waitForTimeout || 5000
      });
    } catch (error) {
      console.warn(`  WARN waitFor failed (${shot.waitFor}): ${error.message}`);
    }
  }

  if (shot.evaluate) {
    try {
      await page.evaluate(shot.evaluate);
      await sleep(200);
    } catch (error) {
      console.warn(`  WARN evaluate failed: ${error.message}`);
    }
  }
}

async function hideChromeNoise(page, options = {}) {
  // Keep this light — never walk body * (causes protocol timeouts on large pages)
  await page.evaluate((extraKill, stage, keepSelectorList) => {
    const kill = [
      '#preview-bar-iframe',
      '.preview-bar',
      '[class*="preview-bar"]',
      'iframe[src*="preview_bar"]',
      'iframe[src*="preview-bar"]',
      '#PBarNextFrameWrapper',
      '#PBarNextFrame',
      '.hrv-theme-preview',
      '[id*="PreviewBar"]',
      '[class*="PreviewBar"]',
      '#haravan-notification',
      ...extraKill
    ];
    for (const sel of kill) {
      for (const el of document.querySelectorAll(sel)) {
        el.classList.remove('active', 'is-open');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        try { el.remove(); } catch (_) {}
      }
    }
    const keepParts = String(keepSelectorList || '').split(',').map((s) => s.trim()).filter(Boolean);
    const holdsTarget = (el) => keepParts.some((sel) => {
      try { return el.matches(sel) || Boolean(el.querySelector(sel)); } catch (_) { return false; }
    });
    // Fixed bottom preview strip (Haravan/Shopify) — only check a few fixed/sticky nodes
    const candidates = document.querySelectorAll(stage === 'neutral' ? 'header, nav, div, section, aside, footer, a, button' : 'div, section, aside, footer');
    let checked = 0;
    for (const el of candidates) {
      if (checked > 80) break;
      const style = window.getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      checked += 1;
      const t = (el.textContent || '').trim().slice(0, 120);
      if (/currently previewing the theme|đang xem trước|Minimize|Remove preview|bỏ xem trước|AI hỗ trợ/i.test(t)) {
        el.style.setProperty('display', 'none', 'important');
      } else if (stage === 'neutral' && !holdsTarget(el)) {
        if (el.matches('header, [role="banner"]')) {
          el.style.setProperty('position', 'relative', 'important');
          el.style.setProperty('top', 'auto', 'important');
        } else {
          el.style.setProperty('display', 'none', 'important');
        }
      }
    }
  }, options.kill || [], options.stage || 'none', options.keepSelector || '');
}

async function resolveMatchedSelector(page, selectorList) {
  return page.evaluate((raw) => {
    const parts = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of parts) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (rect.width < 2 || rect.height < 2) continue;
      return sel;
    }
    for (const sel of parts) {
      if (document.querySelector(sel)) return sel;
    }
    return null;
  }, selectorList);
}

async function clipUnion(page, selectorList, padding, maxHeight) {
  return page.evaluate((raw, pad, maxH) => {
    const parts = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    for (const sel of parts) {
      for (const el of document.querySelectorAll(sel)) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        found = true;
        minX = Math.min(minX, rect.left + scrollX);
        minY = Math.min(minY, rect.top + scrollY);
        maxX = Math.max(maxX, rect.right + scrollX);
        maxY = Math.max(maxY, rect.bottom + scrollY);
      }
    }
    if (!found) return null;
    let x = Math.max(0, Math.floor(minX - pad));
    let y = Math.max(0, Math.floor(minY - pad));
    let w = Math.ceil(maxX - minX + pad * 2);
    let h = Math.ceil(maxY - minY + pad * 2);
    if (Number.isFinite(maxH) && maxH > 0 && h > maxH) h = maxH;
    if (w < 2 || h < 2) return null;
    return { x, y, width: w, height: h };
  }, selectorList, padding || 0, maxHeight || 0);
}

async function captureShot(browser, opts, shot, outDir) {
  const id = shot.id || path.basename(shot.file || 'shot', '.png');
  const pagePath = withThemeId(shot.path || '/', opts.themeId || shot.themeId || '');
  const url = buildUrl(opts.base, pagePath);
  const relFile = sanitizeFile(shot.file, id);
  const killSelectors = [...(opts.kill || []), ...toSelectorArray(shot.kill, `shot ${id} kill`)];
  const filePath = path.join(outDir, relFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const waitMs = Number.isFinite(shot.waitMs) ? shot.waitMs : opts.waitMs;
  const padding = Number.isFinite(shot.padding) ? shot.padding : 12;
  const keepOverlays = Boolean(shot.keepOverlays);
  const fullPage = Boolean(shot.fullPage);
  const maxClipHeight = Number.isFinite(shot.maxClipHeight) ? shot.maxClipHeight : 0;
  const viewport = {
    width: shot.viewportWidth || opts.viewportWidth,
    height: shot.viewportHeight || opts.viewportHeight,
    deviceScaleFactor: shot.deviceScaleFactor || opts.deviceScaleFactor
  };

  const isMobileViewport = viewport.width <= 480;
  return await withPage(browser, {
    viewport: {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: isMobileViewport,
      hasTouch: isMobileViewport
    },
    beforeNavigate: async (page) => {
      await page.evaluateOnNewDocument((keep, storage) => {
        if (keep) return;
        try {
          for (const [key, value] of Object.entries(storage.localStorage || {})) window.localStorage.setItem(key, String(value));
          for (const [key, value] of Object.entries(storage.sessionStorage || {})) window.sessionStorage.setItem(key, String(value));
        } catch (_) {}
      }, keepOverlays, opts.primeStorage || {});
    }
  }, async (page) => {
    await navigateAndSettle(page, url, { waitMs: 0, navTimeout: opts.navTimeoutMs });
    await handleStorefrontPassword(page);
    await primeLazyAssets(page, waitMs);
    if (!keepOverlays) await dismissTransientOverlays(page, killSelectors);
    await hideChromeNoise(page, { kill: killSelectors, stage: opts.stage, keepSelector: shot.selector || shot.unionSelectors || '' });
    if (waitMs > 0) await sleep(waitMs);

    await runShotSteps(page, shot);
    await hideChromeNoise(page, { kill: killSelectors, stage: opts.stage, keepSelector: shot.selector || shot.unionSelectors || '' });

    if (fullPage || (!shot.selector && !shot.unionSelectors)) {
      await page.screenshot({ path: filePath, fullPage: true, type: 'png' });
      return { id, file: relFile, url, mode: 'fullPage' };
    }

    // Union clip: header + mega panel, social trigger + panel, etc.
    if (shot.unionSelectors) {
      const scrollSel = firstSelectorPart(shot.unionSelectors) || firstSelectorPart(shot.selector);
      if (scrollSel) {
        await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (el) el.scrollIntoView({ block: 'start', inline: 'nearest' });
        }, scrollSel);
        await sleep(250);
        // re-run hover/click after scroll for sticky menus
        if (shot.hover) {
          try { await page.hover(shot.hover); await sleep(shot.hoverWaitMs || 500); } catch (_) {}
        }
      }
      const clip = await clipUnion(page, shot.unionSelectors, padding, maxClipHeight);
      if (clip) {
        await page.screenshot({ path: filePath, type: 'png', clip, captureBeyondViewport: true });
        return { id, file: relFile, url, mode: 'union-clip', selector: shot.unionSelectors, clip };
      }
      console.warn(`  WARN unionSelectors empty — falling back to selector/element`);
    }

    const matchedSelector = await resolveMatchedSelector(page, shot.selector);
    if (!matchedSelector) {
      console.warn(`  WARN selector not found (${shot.selector}) — falling back to viewport screenshot`);
      await page.screenshot({ path: filePath, fullPage: false, type: 'png' });
      return { id, file: relFile, url, mode: 'viewport-fallback', selector: shot.selector };
    }

    await page.evaluate((selector, block) => {
      const el = document.querySelector(selector);
      if (el) el.scrollIntoView({ block: block || 'center', inline: 'nearest' });
    }, matchedSelector, shot.scrollBlock || 'center');
    await sleep(250);

    // Optional fixed-height viewport crop around element (better PPTX framing)
    if (shot.clipMode === 'viewport' || maxClipHeight > 0 || shot.clipMode === 'region') {
      const clip = await clipUnion(page, matchedSelector, padding, maxClipHeight || shot.clipHeight || 0);
      if (clip) {
        // Expand width to full viewport for section shots when requested
        if (shot.fullWidth) {
          clip.x = 0;
          clip.width = viewport.width;
        }
        await page.screenshot({ path: filePath, type: 'png', clip, captureBeyondViewport: true });
        return { id, file: relFile, url, mode: 'region-clip', selector: matchedSelector, clip };
      }
    }

    const handle = await page.$(matchedSelector);
    if (!handle) {
      await page.screenshot({ path: filePath, fullPage: false, type: 'png' });
      return { id, file: relFile, url, mode: 'viewport-fallback', selector: matchedSelector };
    }

    // Element screenshot preserves aspect without squash
    if (padding > 0) {
      await page.evaluate((selector, pad) => {
        const el = document.querySelector(selector);
        if (!el) return;
        el.setAttribute('data-feature-capture-pad', '1');
        el.style.outline = `${pad}px solid transparent`;
        el.style.outlineOffset = '0px';
      }, matchedSelector, Math.min(padding, 24));
    }

    await handle.screenshot({ path: filePath, type: 'png' });
    await handle.dispose();
    return { id, file: relFile, url, mode: 'element', selector: matchedSelector };
  });
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

  const shotsPath = opts.shots || path.join(opts.out, 'FEATURE_SHOTS.json');
  const { meta, shots } = loadShots(shotsPath);
  const selectedShots = selectShots(shots, opts.only);
  opts.kill = toSelectorArray(meta.kill, 'FEATURE_SHOTS.kill');
  opts.primeStorage = meta.primeStorage && typeof meta.primeStorage === 'object' ? meta.primeStorage : {};
  fs.mkdirSync(opts.out, { recursive: true });
  fs.mkdirSync(path.join(opts.out, 'features'), { recursive: true });

  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 120000,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });
  const results = [];

  try {
    for (const shot of selectedShots) {
      const id = shot.id || shot.file || 'shot';
      process.stdout.write(`Capturing feature ${id} ... `);
      try {
        const result = await captureShot(browser, opts, shot, opts.out);
        results.push({ ...result, ok: true });
        console.log(`ok → ${result.file}`);
      } catch (error) {
        results.push({ id, ok: false, error: error.message });
        console.log(`FAIL: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    base: opts.base,
    themeId: opts.themeId || meta.themeId || null,
    shotsFile: shotsPath,
    desktopOnly: true,
    stage: opts.stage,
    only: opts.only,
    results
  };
  const manifestPath = path.join(opts.out, 'FEATURE_SHOTS_MANIFEST.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const failed = results.filter((r) => !r.ok);
  console.log('# Final Feature Capture');
  console.log(`Base: ${opts.base}`);
  console.log(`Shots: ${results.length} (failed: ${failed.length})`);
  console.log(`Out: ${path.join(opts.out, 'features')}`);
  console.log(`Manifest: ${manifestPath}`);
  return failed.length ? 1 : 0;
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
  dismissTransientOverlays,
  clipUnion,
  captureShot,
  parseArgs,
  selectShots,
  toSelectorArray
};
