'use strict';

const fs = require('fs');
const path = require('path');
const { requirePuppeteer, sleep } = require('./puppeteer-utils');

const BUNDLE_FILE = path.join(__dirname, 'registry-probes.browser.js');
const OVERLAY_SETTLE_MS = 500;
const CLOSE_SETTLE_MS = 350;
const SCROLL_SETTLE_MS = 80;
const DOC_WIDE_PROBES = ['min-font-size', 'control-height-band', 'wrapped-label', 'tap-target-hit-area', 'icon-stroke'];
const VIEWPORT_PROBES = ['invisible-click-blocker', 'timed-popup-occluder', 'sticky-released-occluder', 'text-overlap'];
const SCROLL_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function bundleSource() {
  return fs.readFileSync(BUNDLE_FILE, 'utf8');
}

async function launchBrowser(options = {}) {
  const puppeteer = requirePuppeteer();
  return puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'], ...options });
}

async function installProbes(page) {
  const result = await page.evaluate(bundleSource());
  if (!result || result.installed !== true) throw new Error('registry probe bundle did not install');
  return result;
}

function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const finding of findings) {
    const key = `${finding.slug}|${finding.selector}|${finding.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

async function runProbes(page, thresholds, probes) {
  return page.evaluate((t, names) => window.__registryProbes.run(t, { probes: names }), thresholds, probes);
}

async function scrollTo(page, y) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await sleep(SCROLL_SETTLE_MS);
}

/** Document-wide probes once, viewport-bound probes at scroll stops from top to bottom; page is returned to the top. */
async function runPageProbes(page, thresholds, options = {}) {
  const probes = options.probes || null;
  const docWide = probes ? DOC_WIDE_PROBES.filter((n) => probes.includes(n)) : DOC_WIDE_PROBES;
  const viewport = probes ? VIEWPORT_PROBES.filter((n) => probes.includes(n)) : VIEWPORT_PROBES;
  const findings = [];
  let popups = 0;
  if (docWide.length) findings.push(...(await runProbes(page, thresholds, docWide)).findings);
  if (viewport.length) {
    const maxScroll = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
    const stops = [...new Set(SCROLL_FRACTIONS.map((f) => Math.round(maxScroll * f)))];
    for (const y of stops) {
      await scrollTo(page, y);
      const result = await runProbes(page, thresholds, viewport);
      popups = Math.max(popups, result.popups);
      findings.push(...result.findings);
    }
    await scrollTo(page, 0);
  }
  return { findings: dedupeFindings(findings), popups };
}

async function visibleHandle(page, selector) {
  for (const handle of await page.$$(selector)) {
    const visible = await handle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
    if (visible) return handle;
    await handle.dispose();
  }
  return null;
}

async function panelStillOpen(page) {
  return (await page.evaluate(() => window.__registryProbes.overlayStillOpen())) > 0;
}

async function clickPoint(page, x, y) {
  await page.mouse.click(x, y);
  await sleep(CLOSE_SETTLE_MS);
}

/**
 * Escape is dispatched to the page (never a trusted key press) so a tab without OS focus cannot fake a failure.
 * The in-panel close control is tried before any full-viewport backdrop; the backdrop is its own method.
 */
async function gradeClose(page) {
  const attempts = { escape: false, closeButton: null, backdrop: null };
  await page.evaluate(() => window.__registryProbes.dispatchEscape());
  await sleep(CLOSE_SETTLE_MS);
  if (!(await panelStillOpen(page))) {
    attempts.escape = true;
    return { method: 'escape', attempts };
  }
  const controls = await page.evaluate(() => window.__registryProbes.findCloseControls());
  const inPanel = controls.filter((c) => !c.fullViewport);
  const backdrops = controls.filter((c) => c.fullViewport);
  if (inPanel.length) {
    attempts.closeButton = false;
    for (const control of inPanel) {
      await clickPoint(page, control.x, control.y);
      if (!(await panelStillOpen(page))) {
        attempts.closeButton = true;
        return { method: 'close-button', attempts };
      }
    }
  }
  if (backdrops.length) {
    attempts.backdrop = false;
    const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    await clickPoint(page, 4, size.height - 4);
    if (!(await panelStillOpen(page))) {
      attempts.backdrop = true;
      return { method: 'backdrop', attempts };
    }
  }
  return { method: null, attempts };
}

function closeFinding(grade, hook) {
  if (grade.method === 'escape' || grade.method === 'close-button') return null;
  const detail = grade.method === 'backdrop'
    ? `overlay ${hook} closes only through its full-viewport backdrop; Escape and an in-panel close control did not close it`
    : `overlay ${hook} stays open after Escape, every close control and the backdrop`;
  return { slug: 'overlay-close-failed', selector: hook, detail };
}

/**
 * Opens one overlay by its data-action trigger, runs fit and scoped probes on the new panel, grades the close.
 * present=false means the trigger is not on this page/width (not a defect); opened=false means the click opened nothing.
 */
async function runOverlayState(page, thresholds, hook) {
  const selector = `[data-action="${hook}"]`;
  const trigger = await visibleHandle(page, selector);
  if (!trigger) return { hook, present: false, opened: false, findings: [] };
  await trigger.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await sleep(OVERLAY_SETTLE_MS);
  await page.evaluate(() => {
    window.__registryProbes.hidePreviewChrome();
    window.__registryProbes.markOverlayBaseline();
  });
  try {
    await trigger.click();
  } catch (error) {
    return { hook, present: true, opened: false, error: error.message, findings: [] };
  } finally {
    await trigger.dispose();
  }
  await sleep(OVERLAY_SETTLE_MS);
  if (!(await page.evaluate(() => !!window.__registryProbes))) throw new Error(`overlay trigger ${hook} navigated the page to ${page.url()}`);
  const fit = await page.evaluate(() => window.__registryProbes.overlayFit());
  if (!fit.panels) return { hook, present: true, opened: false, findings: [] };
  const scoped = await page.evaluate((t) => window.__registryProbes.overlayScopedRun(t), thresholds);
  const grade = await gradeClose(page);
  const findings = [...fit.findings, ...scoped.findings];
  const close = closeFinding(grade, hook);
  if (close) findings.push(close);
  const stillOpen = await panelStillOpen(page);
  return { hook, present: true, opened: true, panels: fit.panels, close: grade, stillOpen, findings: dedupeFindings(findings) };
}

module.exports = {
  BUNDLE_FILE,
  DOC_WIDE_PROBES,
  VIEWPORT_PROBES,
  bundleSource,
  launchBrowser,
  installProbes,
  runPageProbes,
  runOverlayState,
  gradeClose,
  dedupeFindings
};
