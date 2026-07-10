'use strict';

function requirePuppeteer() {
  try {
    return require('puppeteer');
  } catch (error) {
    console.error('Puppeteer is not installed. Run `npm install` inside RESTYLE_MASTER_KIT first.');
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function navigateAndSettle(page, url, options = {}) {
  const {
    waitUntil = 'domcontentloaded',
    navTimeout = 60000,
    networkIdleTimeout = 12000,
    waitMs = 0
  } = options;
  await page.goto(url, { waitUntil, timeout: navTimeout });
  try { await page.waitForNetworkIdle({ timeout: networkIdleTimeout }); } catch (_) {}
  if (waitMs > 0) await sleep(waitMs);
}

async function withPage(browser, config, callback) {
  const page = await browser.newPage();
  try {
    if (config?.viewport) await page.setViewport(config.viewport);
    if (typeof config?.beforeNavigate === 'function') await config.beforeNavigate(page);
    return await callback(page);
  } finally {
    await page.close();
  }
}

module.exports = {
  requirePuppeteer,
  sleep,
  navigateAndSettle,
  withPage
};
