#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue, parseCsv, parseFiniteNumber } = require('./lib/cli-args');
const { buildUrl } = require('./lib/path-utils');
const { requirePuppeteer, navigateAndSettle, sleep } = require('./lib/puppeteer-utils');

function parseArgs(argv) {
  const args = {
    base: '',
    paths: ['/'],
    out: path.resolve(process.cwd(), '..', 'scratch', 'qa'),
    viewports: [320, 375, 768, 1024, 1440],
    flow: '',
    headed: false,
    noFlowReload: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--base') { args.base = readValue(argv, i, '--base'); i += 1; }
    else if (value === '--paths') { args.paths = parseCsv(readValue(argv, i, '--paths')); i += 1; }
    else if (value === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else if (value === '--viewports') { args.viewports = parseCsv(readValue(argv, i, '--viewports'), (item) => parseFiniteNumber(item, '--viewports')).filter(Boolean); i += 1; }
    else if (value === '--flow') { args.flow = path.resolve(readValue(argv, i, '--flow')); i += 1; }
    else if (value === '--headed') args.headed = true;
    else if (value === '--no-flow-reload') args.noFlowReload = true;
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node qa_restyle_check.js --base <preview-url> [--paths /,/collections/all] [--out ../scratch/qa]

Options:
  --base <url>         Required preview base URL.
  --paths <csv>        Paths to test. Default: /
  --viewports <csv>    Widths to test. Default: 320,375,768,1024,1440
  --flow <json>        Optional interaction flow.
  --out <dir>          Output directory. Default: ../scratch/qa
  --headed             Run browser headed.
  --no-flow-reload     Do not reload between multiple matching flows.
`);
}


function sanitizePath(pagePath) {
  if (pagePath === '/') return 'home';
  return pagePath.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'page';
}

function normalizePath(pathname) {
  if (!pathname) return '/';
  const withoutQuery = pathname.split('?')[0].split('#')[0];
  const collapsed = withoutQuery.replace(/\/+$/, '');
  return collapsed || '/';
}

function flowMatches(flowDef, pagePath, viewportWidth) {
  if (!flowDef) return false;
  const currentPath = normalizePath(pagePath);
  const flowPath = flowDef.path ? normalizePath(flowDef.path) : null;
  const pathMatches = !flowPath || flowPath === currentPath;
  const viewportMatches = !Array.isArray(flowDef.viewports) || flowDef.viewports.length === 0 || flowDef.viewports.includes(viewportWidth);
  return pathMatches && viewportMatches;
}

function normalizeFlowList(flowConfig, pagePath, viewportWidth) {
  if (!flowConfig) return [];
  if (Array.isArray(flowConfig.flows)) {
    return flowConfig.flows.filter((flowDef) => flowMatches(flowDef, pagePath, viewportWidth));
  }
  if (Array.isArray(flowConfig.steps)) {
    return [flowConfig];
  }
  return [];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveStepSpec(step, key) {
  const raw = step[key];
  if (isPlainObject(raw)) return raw;

  const spec = {};
  if (typeof raw === 'string') {
    if (key === 'press' || key === 'navigate') {
      spec.value = raw;
    } else if (key === 'waitMs') {
      spec.value = Number(raw);
    } else {
      spec.selector = raw;
    }
  }

  if (step.selector !== undefined && spec.selector === undefined) spec.selector = step.selector;
  if (step.value !== undefined && spec.value === undefined) spec.value = step.value;
  if (step.text !== undefined && spec.text === undefined) spec.text = step.text;
  if (step.state !== undefined && spec.state === undefined) spec.state = step.state;
  return spec;
}

function requireSelector(selector, action) {
  if (!selector) throw new Error(`${action} requires a selector.`);
  return selector;
}

async function waitForSelector(page, selector, options = {}) {
  const { timeout = 12000, state = 'visible' } = options;
  if (state === 'hidden' || state === 'detached') {
    await page.waitForFunction(
      (sel) => !document.querySelector(sel) || document.querySelector(sel).offsetParent === null,
      { timeout },
      selector
    );
  } else if (state === 'attached') {
    await page.waitForSelector(selector, { timeout });
  } else {
    await page.waitForSelector(selector, { timeout, visible: true });
  }
}

async function waitForText(page, text, options = {}) {
  const { timeout = 12000, state = 'visible' } = options;
  const xpath = `//*[contains(text(), "${text.replace(/"/g, '\\"')}")]`;
  if (state === 'hidden' || state === 'detached') {
    await page.waitForFunction(
      (t) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (walker.currentNode.textContent.includes(t)) {
            const el = walker.currentNode.parentElement;
            if (el && el.offsetParent !== null) return false;
          }
        }
        return true;
      },
      { timeout },
      text
    );
  } else {
    await page.waitForFunction(
      (t) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (walker.currentNode.textContent.includes(t)) {
            const el = walker.currentNode.parentElement;
            if (el && el.offsetParent !== null) return true;
          }
        }
        return false;
      },
      { timeout },
      text
    );
  }
}

async function runFlowStep(page, step) {
  const timeout = step.timeout || 12000;

  if (step.action === 'waitMs' || (step.waitMs && !step.action && !step.click && !step.fill && !step.press && !step.select && !step.waitFor && !step.expectVisible)) {
    await new Promise((resolve) => setTimeout(resolve, Number(step.waitMs || step.value || 0)));
    return;
  }

  if (step.action === 'waitFor' || step.waitFor) {
    const spec = resolveStepSpec(step, 'waitFor');
    const state = spec.state || 'visible';
    if (spec.selector) {
      await waitForSelector(page, spec.selector, { timeout, state });
    } else if (spec.text) {
      await waitForText(page, spec.text, { timeout, state });
    } else {
      throw new Error('waitFor requires a selector or text.');
    }
  } else if (step.action === 'click' || step.click) {
    const spec = resolveStepSpec(step, 'click');
    const selector = requireSelector(spec.selector, 'click');
    await page.waitForSelector(selector, { timeout, visible: true });
    await page.click(selector);
  } else if (step.action === 'fill' || step.fill) {
    const spec = resolveStepSpec(step, 'fill');
    const selector = requireSelector(spec.selector, 'fill');
    await page.waitForSelector(selector, { timeout, visible: true });
    await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, selector);
    await page.type(selector, String(spec.value || ''));
  } else if (step.action === 'press' || step.press) {
    const spec = resolveStepSpec(step, 'press');
    const key = spec.value || 'Enter';
    await page.keyboard.press(key);
  } else if (step.action === 'select' || step.select) {
    const spec = resolveStepSpec(step, 'select');
    const selector = requireSelector(spec.selector, 'select');
    await page.waitForSelector(selector, { timeout, visible: true });
    await page.select(selector, String(spec.value ?? ''));
  } else if (step.action === 'navigate' || step.navigate) {
    const spec = resolveStepSpec(step, 'navigate');
    const target = spec.value;
    if (!target) throw new Error('navigate requires a target URL.');
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else if (step.action === 'expectVisible' || step.expectVisible) {
    const spec = resolveStepSpec(step, 'expectVisible');
    const state = spec.state || 'visible';
    if (spec.selector) {
      await waitForSelector(page, spec.selector, { timeout, state: 'visible' });
    } else if (spec.text) {
      await waitForText(page, spec.text, { timeout, state });
    } else {
      throw new Error('expectVisible requires a selector or text.');
    }
  } else {
    throw new Error(`Unsupported action: ${step.action || Object.keys(step).join(',')}`);
  }
}

async function runFlow(page, flowConfig, pagePath, viewportWidth, url, noFlowReload) {
  const flows = normalizeFlowList(flowConfig, pagePath, viewportWidth);
  if (!flows.length) return [];
  const results = [];
  for (let flowIndex = 0; flowIndex < flows.length; flowIndex += 1) {
    const flow = flows[flowIndex];
    const flowName = flow.name || 'flow';
    let flowFailed = false;
    if (flowIndex > 0 && !noFlowReload) {
      await navigateAndSettle(page, url, { waitMs: 500 });
    }
    for (const step of flow.steps || []) {
      const name = step.name || `${step.action || Object.keys(step).join(',')}:${step.selector || step.click || step.fill || step.waitFor || step.text || ''}`;
      try {
        await runFlowStep(page, step);
        if (step.waitAfter || step.waitMs) await new Promise((resolve) => setTimeout(resolve, step.waitAfter || step.waitMs));
        results.push({ flow: flowName, name, status: 'pass' });
      } catch (error) {
        flowFailed = true;
        results.push({ flow: flowName, name, status: 'fail', error: error.message });
        break;
      }
    }
    if (flowFailed) break;
  }
  return results;
}

async function checkPage(browser, base, pagePath, viewportWidth, outDir, flow, noFlowReload) {
  const page = await browser.newPage();
  await page.setViewport({
    width: viewportWidth,
    height: viewportWidth <= 480 ? 844 : 1200,
    deviceScaleFactor: 1,
    isMobile: viewportWidth <= 480,
    hasTouch: viewportWidth <= 480
  });

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const url = buildUrl(base, pagePath);
  const result = {
    path: pagePath,
    viewport: viewportWidth,
    url,
    title: '',
    screenshot: '',
    consoleErrors,
    pageErrors,
    overflow: null,
    a11y: [],
    flow: [],
    status: 'pass'
  };

  try {
    await navigateAndSettle(page, url, { waitMs: 800 });
    result.title = await page.title();
    result.overflow = await page.evaluate(() => {
      const docW = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
      const winW = window.innerWidth;
      return docW > winW ? { docWidth: docW, winWidth: winW } : null;
    });
    result.a11y = await page.evaluate((isMobile) => {
      const issues = [];
      // Missing alt on img
      for (const img of document.querySelectorAll('img')) {
        if (!img.hasAttribute('alt')) {
          const src = (img.getAttribute('src') || '').split('/').pop().slice(0, 40);
          issues.push({ rule: 'MISSING_ALT', detail: src || 'unknown' });
        }
      }
      // Tap target < 44x44 on mobile
      if (isMobile) {
        const interactive = 'a, button, [role="button"], input, select, textarea, [tabindex]';
        for (const el of document.querySelectorAll(interactive)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
            const label = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30);
            issues.push({ rule: 'SMALL_TAP_TARGET', detail: label + ' (' + Math.round(r.width) + 'x' + Math.round(r.height) + 'px)' });
          }
        }
      }
      return issues;
    }, viewportWidth <= 480);
    result.flow = await runFlow(page, flow, pagePath, viewportWidth, url, noFlowReload);
    const fileName = `${sanitizePath(pagePath)}-${viewportWidth}.png`;
    const screenshotPath = path.join(outDir, fileName);
    await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
    result.screenshot = fileName;
    const flowFailed = result.flow.some((item) => item.status === 'fail');
    if (pageErrors.length || flowFailed) {
      result.status = 'fail';
    } else if (consoleErrors.length || result.overflow || result.a11y?.length) {
      result.status = 'warn';
    }
  } catch (error) {
    result.status = 'fail';
    result.error = error.message;
  } finally {
    await page.close();
  }
  return result;
}

function writeReport(outDir, results) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'qa-results.json'), JSON.stringify(results, null, 2));
  const lines = ['# QA Results', '', '| Path | Viewport | Status | Screenshot | Notes |', '|---|---:|---|---|---|'];
  const a11yLines = [];
  for (const result of results) {
    const notes = [
      result.error,
      result.overflow ? `overflow ${result.overflow.docWidth}px > ${result.overflow.winWidth}px` : '',
      result.a11y?.length ? `${result.a11y.length} a11y issue(s)` : '',
      result.consoleErrors?.length ? `${result.consoleErrors.length} console errors` : '',
      result.pageErrors?.length ? `${result.pageErrors.length} page errors` : '',
      result.flow?.some((item) => item.status === 'fail') ? 'flow failed' : ''
    ].filter(Boolean).join('; ');
    lines.push(`| ${result.path} | ${result.viewport} | ${result.status} | ${result.screenshot || ''} | ${notes} |`);
  }
  // Append a11y detail block
  for (const result of results) {
    if (result.a11y && result.a11y.length) {
      a11yLines.push('');
      a11yLines.push(`### A11y: ${result.path} @ ${result.viewport}px`);
      for (const issue of result.a11y) {
        a11yLines.push(`- [${issue.rule}] ${issue.detail}`);
      }
    }
  }
  if (a11yLines.length) {
    lines.push('', '## A11y Detail');
    lines.push(...a11yLines);
  }
  fs.writeFileSync(path.join(outDir, 'qa-results.md'), `${lines.join('\n')}\n`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.base) {
    usage();
    return args.help ? 0 : 1;
  }
  fs.mkdirSync(args.out, { recursive: true });
  const flow = args.flow ? JSON.parse(fs.readFileSync(args.flow, 'utf8')) : null;
  const puppeteer = requirePuppeteer();
  const browser = await puppeteer.launch({ headless: args.headed ? false : 'new' });

  try {
    const results = [];
    for (const pagePath of args.paths) {
      for (const viewport of args.viewports) {
        results.push(await checkPage(browser, args.base, pagePath, viewport, args.out, flow, args.noFlowReload));
      }
    }
    writeReport(args.out, results);
    const failed = results.some((result) => result.status === 'fail');
    console.log(`# QA Restyle Check\nOutput: ${args.out}\nResults: ${results.length}`);
    return failed ? 1 : 0;
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
