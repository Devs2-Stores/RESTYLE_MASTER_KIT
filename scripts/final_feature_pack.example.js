'use strict';
/**
 * Showcase recapture v2 — follows haravan-preview-screenshot rules:
 * - kill newsletter modal (#shop-modal-contact)
 * - floating widgets = tight crop + #f3f4f6 pad, not full homepage
 * - sections/pages = clean full-page after lazy load
 * - home mobile 276x480
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('C:/Users/Admin/Desktop/RESTYLE_MASTER_KIT/node_modules/puppeteer');

const ROOT = path.resolve(__dirname, '..', 'final-showcase');
const OUT = path.join(ROOT, 'features');
const THEME = '1001501589';
const BASE = 'https://f1genz-genz.myharavan.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (p) => `${BASE}${p}${p.includes('?') ? '&' : '?'}themeid=${THEME}`;

function cropFile(src, dest, x, y, w, h) {
  const py = `
from PIL import Image
im=Image.open(r'''${src}''')
x,y,w,h=${Math.floor(x)},${Math.floor(y)},${Math.floor(w)},${Math.floor(h)}
x=max(0,min(x,im.width-2)); y=max(0,min(y,im.height-2))
w=max(2,min(w,im.width-x)); h=max(2,min(h,im.height-y))
im.crop((x,y,x+w,y+h)).save(r'''${dest}''')
print('crop', w, h, r'''${path.basename(dest)}''')
`;
  const s = path.join(ROOT, '_crop_once.py');
  fs.writeFileSync(s, py);
  execFileSync('python', [s], { stdio: 'inherit' });
}

async function killChrome(page) {
  await page.evaluate(() => {
    const kill = [
      '#shop-modal-contact',
      '.f1genz-genz-modal-contact',
      '.modal-backdrop',
      '#haravan-notification',
      '#preview-bar-iframe',
      '#PBarNextFrameWrapper',
      '#PBarNextFrame',
      '.back-to-top'
    ];
    for (const sel of kill) {
      document.querySelectorAll(sel).forEach((el) => {
        try {
          el.remove();
        } catch (_) {
          el.style.setProperty('display', 'none', 'important');
        }
      });
    }
    document.body.classList.remove('modal-open', 'open-overplay');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    let n = 0;
    for (const el of document.querySelectorAll('div, section, iframe, aside')) {
      if (n > 60) break;
      const st = getComputedStyle(el);
      if (st.position !== 'fixed' && st.position !== 'sticky') continue;
      n += 1;
      const t = (el.textContent || '').slice(0, 80);
      if (/currently previewing|Minimize|Remove preview|AI hỗ trợ/i.test(t)) {
        el.style.setProperty('display', 'none', 'important');
      }
    }
  });
  try {
    await page.keyboard.press('Escape');
  } catch (_) {}
}

async function lazyPrime(page) {
  await page.evaluate(async () => {
    for (const img of document.images) {
      img.loading = 'eager';
      const s = img.getAttribute('data-src') || img.getAttribute('data-original');
      if (s && (!img.src || img.src.startsWith('data:'))) img.src = s;
    }
    const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < Math.min(h, 10000); y += 450) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await sleep(600);
}

async function waitImages(page, rootSel) {
  await page.evaluate(async (sel) => {
    const root = sel ? document.querySelector(sel) : document;
    if (!root) return;
    const imgs = [...root.querySelectorAll('img')];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 5000);
          })
      )
    );
  }, rootSel || null);
}

/** Stage floating widget on neutral canvas, clip with 20px pad */
async function captureWidget(page, { openFn, panelSel, file, hideTriggers }) {
  await page.goto(url('/'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('body');
  await sleep(1500);
  await killChrome(page);
  await sleep(5200); // past newsletter timer
  await killChrome(page);

  await page.evaluate(
    ({ openFnSrc, panelSel, hideTriggers }) => {
      // Hide everything except we rebuild stage
      const stage = document.createElement('div');
      stage.id = 'f1genz-preview-stage';
      stage.style.cssText =
        'position:fixed;inset:0;z-index:2147483000;background:#f3f4f6;display:flex;align-items:flex-start;justify-content:flex-start;padding:40px;';

      // Run open logic in page first to materialize widget HTML
      // eslint-disable-next-line no-eval
      eval(openFnSrc);

      const panel = document.querySelector(panelSel);
      if (!panel) {
        stage.textContent = 'MISSING ' + panelSel;
        document.body.appendChild(stage);
        return;
      }

      // Clone panel tree into stage
      const wrap = document.createElement('div');
      wrap.id = 'f1genz-widget-wrap';
      wrap.style.cssText = 'position:relative;display:inline-block;';
      const clone = panel.cloneNode(true);
      clone.style.setProperty('position', 'relative', 'important');
      clone.style.setProperty('left', 'auto', 'important');
      clone.style.setProperty('right', 'auto', 'important');
      clone.style.setProperty('top', 'auto', 'important');
      clone.style.setProperty('bottom', 'auto', 'important');
      clone.style.setProperty('display', 'block', 'important');
      clone.style.setProperty('visibility', 'visible', 'important');
      clone.style.setProperty('opacity', '1', 'important');
      clone.style.setProperty('transform', 'none', 'important');
      clone.style.setProperty('z-index', '1', 'important');
      wrap.appendChild(clone);

      // Optionally include open trigger state chrome? skill says hide closed/open triggers for panel-only
      if (!hideTriggers) {
        /* keep as-is */
      }

      // Hide all body children, show stage only
      [...document.body.children].forEach((ch) => {
        if (ch.id !== 'f1genz-preview-stage') ch.style.setProperty('display', 'none', 'important');
      });
      stage.innerHTML = '';
      stage.appendChild(wrap);
      document.body.appendChild(stage);
    },
    { openFnSrc: openFn, panelSel, hideTriggers: !!hideTriggers }
  );

  await sleep(400);

  const clip = await page.evaluate(() => {
    const wrap = document.getElementById('f1genz-widget-wrap');
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    const pad = 20;
    return {
      x: Math.max(0, Math.floor(r.left - pad)),
      y: Math.max(0, Math.floor(r.top - pad)),
      width: Math.ceil(r.width + pad * 2),
      height: Math.ceil(r.height + pad * 2)
    };
  });

  if (!clip || clip.width < 40) {
    console.warn('widget clip failed', file, clip);
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  } else {
    await page.screenshot({ path: path.join(OUT, file), clip });
  }
  console.log('widget', file, clip);
}

async function captureSection(page, { path: pagePath, selector, file, maxH, scrollBlock }) {
  await page.goto(url(pagePath), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('body');
  await sleep(1800);
  await killChrome(page);
  await lazyPrime(page);
  await killChrome(page);
  await sleep(5200);
  await killChrome(page);

  // Unstick header for clean fullpage crops
  await page.evaluate(() => {
    document.querySelectorAll('header, .f1genz-genz-header, .header').forEach((el) => {
      el.style.setProperty('position', 'relative', 'important');
      el.style.setProperty('top', 'auto', 'important');
    });
  });

  await page.evaluate((sel, block) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ block: block || 'start', inline: 'nearest' });
  }, selector, scrollBlock || 'start');
  await sleep(400);
  await waitImages(page, selector);

  // Prefer element box via fullpage crop for accuracy
  const tmp = path.join(ROOT, `_tmp_${file}`);
  await page.screenshot({ path: tmp, fullPage: true, type: 'png' });
  const box = await page.evaluate((sel, maxH) => {
    const el = document.querySelector(sel) || document.querySelector('main');
    const r = el.getBoundingClientRect();
    const y = r.top + window.scrollY;
    const h = Math.min(r.height + 24, maxH || 1200);
    return { x: 0, y: Math.max(0, y), w: 1440, h };
  }, selector, maxH || 1200);
  cropFile(tmp, path.join(OUT, file), box.x, box.y, box.w, box.h);
  console.log('section', file, box);
}

async function captureFullPage(page, { path: pagePath, file, maxH }) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url(pagePath), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('body');
  await sleep(1800);
  await killChrome(page);
  await lazyPrime(page);
  await killChrome(page);
  await sleep(5200);
  await killChrome(page);
  await page.evaluate(() => {
    document.querySelectorAll('header, .f1genz-genz-header, .header').forEach((el) => {
      el.style.setProperty('position', 'relative', 'important');
    });
    document.querySelectorAll('.f1zs-livechatchannels, .f1genz-genz-popnoti, .popup-noti, .f1genz-genz-pop-sale, .pop-sale, .back-to-top').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  });
  await waitImages(page, 'main');
  const tmp = path.join(ROOT, `_tmp_${file}`);
  await page.screenshot({ path: tmp, fullPage: true, type: 'png' });
  // Full page with modest top/bottom pad — capture main+header band for PPTX readability
  const box = await page.evaluate((maxH) => {
    const main = document.querySelector('main') || document.body;
    const header = document.querySelector('header, .f1genz-genz-header');
    const top = header ? header.getBoundingClientRect().top + window.scrollY : 0;
    const bottom = main.getBoundingClientRect().bottom + window.scrollY;
    const y = Math.max(0, top);
    const h = Math.min(bottom - y + 16, maxH || 1600);
    return { x: 0, y, w: 1440, h: Math.max(600, h) };
  }, maxH || 1600);
  cropFile(tmp, path.join(OUT, file), box.x, box.y, box.w, box.h);
  console.log('fullpage', file, box);
}

async function captureProductCard(page) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url('/collections/all'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(2000);
  await killChrome(page);
  await lazyPrime(page);
  await killChrome(page);
  await page.evaluate(() => {
    document.querySelectorAll('#shop-modal-contact, .f1genz-genz-modal-contact, .modal-backdrop, .f1zs-livechatchannels, .f1genz-genz-popnoti, .pop-sale').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
    const card = document.querySelector('.f1genz-genz-product-card, .product-item');
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await sleep(500);
  await waitImages(page, '.f1genz-genz-product-card, .product-item');

  // Stage card on neutral canvas
  await page.evaluate(() => {
    const card = document.querySelector('.f1genz-genz-product-card, .product-item');
    if (!card) return;
    const stage = document.createElement('div');
    stage.id = 'f1genz-preview-stage';
    stage.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#f3f4f6;display:flex;align-items:center;justify-content:center;padding:40px;';
    const wrap = document.createElement('div');
    wrap.id = 'f1genz-widget-wrap';
    wrap.style.cssText = 'width:min(360px,90vw);background:#fff;';
    const clone = card.cloneNode(true);
    clone.style.setProperty('margin', '0', 'important');
    clone.style.setProperty('width', '100%', 'important');
    wrap.appendChild(clone);
    [...document.body.children].forEach((ch) => ch.style.setProperty('display', 'none', 'important'));
    stage.appendChild(wrap);
    document.body.appendChild(stage);
  });
  await sleep(300);
  const clip = await page.evaluate(() => {
    const wrap = document.getElementById('f1genz-widget-wrap');
    const r = wrap.getBoundingClientRect();
    const pad = 20;
    return {
      x: Math.max(0, Math.floor(r.left - pad)),
      y: Math.max(0, Math.floor(r.top - pad)),
      width: Math.ceil(r.width + pad * 2),
      height: Math.ceil(r.height + pad * 2)
    };
  });
  await page.screenshot({ path: path.join(OUT, 'product-card.png'), clip });
  console.log('product-card', clip);
}

async function captureHomeMobile(page) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(url('/'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(2000);
  await killChrome(page);
  await lazyPrime(page);
  await killChrome(page);
  await sleep(5200);
  await killChrome(page);
  await page.evaluate(() => {
    document.querySelectorAll('#shop-modal-contact, .f1genz-genz-modal-contact, .modal-backdrop, .f1zs-livechatchannels, .f1genz-genz-popnoti, .pop-sale').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  });
  // Raw mobile full-ish top then resize to 276x480
  const raw = path.join(ROOT, 'Trang chủ-mobile-fullpage.png');
  await page.screenshot({ path: raw, fullPage: false, type: 'png' });
  // Crop top portion and scale to 276x480 via PIL
  const py = `
from PIL import Image
im=Image.open(r'''${raw}''')
# take top viewport, center-crop to 276/480 aspect then resize
target_w, target_h = 276, 480
ar = target_w / target_h
# use full viewport image
w,h = im.size
crop_h = h
crop_w = int(crop_h * ar)
if crop_w > w:
  crop_w = w
  crop_h = int(crop_w / ar)
x = (w - crop_w)//2
y = 0
im2 = im.crop((x,y,x+crop_w,y+crop_h)).resize((target_w,target_h), Image.LANCZOS)
out=r'''${path.join(ROOT, 'Trang chủ-mobile.png')}'''
im2.save(out, optimize=True)
print('mobile', im2.size)
`;
  const s = path.join(ROOT, '_crop_mobile.py');
  fs.writeFileSync(s, py);
  execFileSync('python', [s], { stdio: 'inherit' });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('newsletter_popup_closed_v2', 'true');
      sessionStorage.setItem('newsletter_popup_closed_v2', 'true');
    } catch (_) {}
  });

  // ===== WIDGETS (tight) =====
  console.log('=== widgets ===');
  await captureWidget(page, {
    file: 'pop-sale.png',
    panelSel: '.f1genz-genz-pop-sale, .pop-sale',
    hideTriggers: true,
    openFn: `(() => {
      let el = document.querySelector('.f1genz-genz-pop-sale') || document.querySelector('.pop-sale');
      if (!el) {
        el = document.createElement('div');
        el.className = 'f1genz-genz-pop-sale pop-sale';
        document.body.appendChild(el);
      }
      el.hidden = false;
      el.removeAttribute('hidden');
      el.innerHTML = '<div style="display:flex;gap:12px;align-items:center;padding:12px;background:#111;border:2px solid #111;box-shadow:6px 6px 0 #D4FF00;width:360px;color:#fff;font-family:Arial,sans-serif;box-sizing:border-box">'
        + '<div style="width:88px;height:88px;border:2px solid #D4FF00;position:relative;flex:0 0 auto;background:#222">'
        + '<img src="/assets/f1genz-genz-product-hero.jpg" style="width:100%;height:100%;object-fit:cover" alt="">'
        + '<span style="position:absolute;left:4px;top:4px;background:#D4FF00;color:#111;font:700 9px Arial;padding:3px 5px">LIVE</span></div>'
        + '<div style="min-width:0"><div style="font:700 11px Arial;color:#D4FF00">● Vừa mua · F1GENZ</div>'
        + '<div style="font:700 14px/1.3 Arial;margin:5px 0">Áo gile utility dáng mềm F1GENZ 18</div>'
        + '<div style="font:12px Arial;color:#bbb"><b style="color:#fff">Minh A.</b> vừa mua cách đây <b style="color:#D4FF00">3</b> phút</div>'
        + '<div style="margin-top:8px"><span style="background:#D4FF00;color:#111;font:700 11px Arial;padding:7px 10px">MUA NGAY →</span></div></div></div>';
      el.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;position:static!important;';
    })()`
  });

  await captureWidget(page, {
    file: 'popnoti.png',
    panelSel: '.f1genz-genz-popnoti, .popup-noti',
    hideTriggers: false,
    openFn: `(() => {
      document.querySelectorAll('.f1genz-genz-popnoti, .popup-noti').forEach(el => {
        el.classList.add('active');
        el.style.setProperty('display','block','important');
        el.style.setProperty('visibility','visible','important');
        el.style.setProperty('opacity','1','important');
        el.style.setProperty('position','static','important');
        el.style.setProperty('width','auto','important');
        el.style.setProperty('height','auto','important');
      });
      const panel = document.querySelector('.f1genz-genz-popnoti__panel, .popup-noti .content');
      if (panel) {
        panel.style.setProperty('display','block','important');
        panel.style.setProperty('opacity','1','important');
        panel.style.setProperty('visibility','visible','important');
        panel.style.setProperty('transform','none','important');
        panel.style.setProperty('position','relative','important');
        panel.style.setProperty('left','auto','important');
        panel.style.setProperty('bottom','auto','important');
      }
    })()`
  });

  await captureWidget(page, {
    file: 'social-sidebar.png',
    panelSel: '.f1zs-livechatchannelswidget__content',
    hideTriggers: true,
    openFn: `(() => {
      const c = document.querySelector('.f1zs-livechatchannelswidget__content');
      if (c) {
        c.classList.add('f1zs-livechatchannels--fade-in');
        c.style.setProperty('display','block','important');
        c.style.setProperty('visibility','visible','important');
        c.style.setProperty('opacity','1','important');
        c.style.setProperty('position','relative','important');
        c.style.setProperty('left','auto','important');
        c.style.setProperty('right','auto','important');
        c.style.setProperty('bottom','auto','important');
      }
    })()`
  });

  // Search panel as widget-like card
  await captureWidget(page, {
    file: 'search.png',
    panelSel: '.f1genz-genz-smart-search__panel',
    hideTriggers: true,
    openFn: `(() => {
      const root = document.querySelector('.f1genz-genz-smart-search');
      if (!root) return;
      root.hidden = false;
      root.removeAttribute('hidden');
      root.style.setProperty('display','block','important');
      const panel = root.querySelector('.f1genz-genz-smart-search__panel');
      if (panel) {
        panel.style.setProperty('display','block','important');
        panel.style.setProperty('opacity','1','important');
        panel.style.setProperty('visibility','visible','important');
        panel.style.setProperty('transform','none','important');
        panel.style.setProperty('position','relative','important');
        panel.style.setProperty('margin','0','important');
        panel.style.setProperty('max-width','720px','important');
        panel.style.setProperty('background','#fff','important');
      }
    })()`
  });

  // ===== SECTIONS =====
  console.log('=== sections ===');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await captureSection(page, {
    path: '/',
    selector: '.f1genz-genz-home__hero',
    file: 'hero.png',
    maxH: 700,
    scrollBlock: 'start'
  });
  await captureSection(page, {
    path: '/',
    selector: '.f1genz-genz-home__flash',
    file: 'flash-sale.png',
    maxH: 1100
  });
  await captureSection(page, {
    path: '/',
    selector: '.f1genz-genz-home__bento, .f1genz-genz-home__gear',
    file: 'bento.png',
    maxH: 600
  });
  await captureSection(page, {
    path: '/',
    selector: '.f1genz-genz-home__drops',
    file: 'drops.png',
    maxH: 950
  });
  await captureSection(page, {
    path: '/',
    selector: '.f1genz-genz-home__video',
    file: 'video.png',
    maxH: 700
  });
  await captureSection(page, {
    path: '/',
    selector: '.f1genz-genz-home__journal',
    file: 'journal.png',
    maxH: 950
  });
  await captureSection(page, {
    path: '/',
    selector: '.f1genz-genz-marquee, .f1genz-genz-home__marquee',
    file: 'marquee.png',
    maxH: 160
  });

  // Header mega
  await page.goto(url('/'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(1800);
  await killChrome(page);
  await sleep(5200);
  await killChrome(page);
  await page.evaluate(() => {
    document.querySelectorAll('#shop-modal-contact,.f1genz-genz-modal-contact,.modal-backdrop,.f1genz-genz-popnoti,.pop-sale,.f1zs-livechatchannels').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  });
  try {
    await page.hover('li.hasChild.isMega > a');
  } catch (_) {}
  await sleep(900);
  await page.evaluate(() => {
    const box = document.querySelector('li.hasChild.isMega > .mega-box');
    if (!box) return;
    box.style.setProperty('opacity', '1', 'important');
    box.style.setProperty('visibility', 'visible', 'important');
    box.style.setProperty('transform', 'none', 'important');
    box.querySelectorAll('.mega-box-left, .mega-box-right > ul.menu1 > li').forEach((n) => {
      n.style.setProperty('opacity', '1', 'important');
      n.style.setProperty('transform', 'none', 'important');
    });
  });
  await sleep(300);
  const megaClip = await page.evaluate(() => {
    const header = document.querySelector('.f1genz-genz-header, header.header');
    const box = document.querySelector('li.hasChild.isMega > .mega-box');
    const hr = header.getBoundingClientRect();
    const br = box ? box.getBoundingClientRect() : hr;
    const pad = 8;
    return {
      x: 0,
      y: Math.max(0, Math.floor(Math.min(hr.top, br.top) - pad)),
      width: 1440,
      height: Math.min(900, Math.ceil(Math.max(hr.bottom, br.bottom) - Math.min(hr.top, br.top) + pad * 2))
    };
  });
  await page.screenshot({ path: path.join(OUT, 'header-mega.png'), clip: megaClip });
  console.log('header-mega', megaClip);

  // Product card
  await captureProductCard(page);

  // Collection
  await captureSection(page, {
    path: '/collections/all',
    selector: '.f1genz-genz-collection__layout, .main-collection, main',
    file: 'collection-filter.png',
    maxH: 1100
  });

  // Cart
  await page.goto(url('/products/ao-gile-utility-dang-mem-f1genz-18'), {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });
  await sleep(2000);
  await killChrome(page);
  try {
    await page.click('button[data-type="main-product-add"]');
  } catch (_) {}
  await sleep(2000);
  await page.evaluate(async () => {
    const sel = document.querySelector('#main-product-select, select[name="id"], input[name="id"]');
    const id = sel ? Number(sel.value) : null;
    if (!id) return;
    try {
      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ quantity: 1, id })
      });
    } catch (_) {}
  });
  await page.goto(url('/'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(1500);
  await killChrome(page);
  await sleep(5200);
  await killChrome(page);
  try {
    await page.click('button[data-type="shop-cart-header"]');
  } catch (_) {}
  await sleep(900);
  await page.evaluate(() => {
    document.body.classList.add('open-cart', 'open-overplay', 'open-noscroll', 'f1genz-genz');
    document.querySelectorAll('#shop-modal-contact,.modal-backdrop,.f1zs-livechatchannels,.back-to-top').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
  });
  // Stage cart drawer on neutral canvas (widget style)
  await page.evaluate(() => {
    const drawer = document.querySelector('.shop-cart-sidebar');
    if (!drawer) return;
    const stage = document.createElement('div');
    stage.id = 'f1genz-preview-stage';
    stage.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#f3f4f6;display:flex;align-items:stretch;justify-content:flex-end;';
    const wrap = document.createElement('div');
    wrap.id = 'f1genz-widget-wrap';
    wrap.style.cssText = 'width:440px;height:100%;background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,.12);';
    const clone = drawer.cloneNode(true);
    clone.style.setProperty('position', 'relative', 'important');
    clone.style.setProperty('transform', 'none', 'important');
    clone.style.setProperty('opacity', '1', 'important');
    clone.style.setProperty('visibility', 'visible', 'important');
    clone.style.setProperty('right', 'auto', 'important');
    clone.style.setProperty('top', 'auto', 'important');
    clone.style.setProperty('height', '100%', 'important');
    clone.style.setProperty('width', '100%', 'important');
    wrap.appendChild(clone);
    [...document.body.children].forEach((ch) => ch.style.setProperty('display', 'none', 'important'));
    stage.appendChild(wrap);
    document.body.appendChild(stage);
  });
  await sleep(300);
  const cartClip = await page.evaluate(() => {
    const wrap = document.getElementById('f1genz-widget-wrap');
    const r = wrap.getBoundingClientRect();
    const pad = 16;
    return {
      x: Math.max(0, Math.floor(r.left - pad)),
      y: Math.max(0, Math.floor(r.top - pad)),
      width: Math.ceil(r.width + pad * 2),
      height: Math.ceil(Math.min(r.height, 860) + pad * 2)
    };
  });
  await page.screenshot({ path: path.join(OUT, 'cart-drawer.png'), clip: cartClip });
  console.log('cart', cartClip);

  // ===== FULL PAGES (all page.* customs) =====
  console.log('=== pages ===');
  const pages = [
    ['about.png', '/pages/about-us', 1500],
    ['stores.png', '/pages/he-thong-cua-hang', 1600],
    ['contact.png', '/pages/lien-he', 1500],
    ['faq.png', '/pages/cau-hoi-thuong-gap', 1500],
    ['gallery.png', '/pages/gallery', 1400],
    ['product-detail.png', '/products/ao-gile-utility-dang-mem-f1genz-18', 1400],
    ['account-login.png', '/account/login', 1000]
  ];
  for (const [file, pth, maxH] of pages) {
    await captureFullPage(page, { path: pth, file, maxH });
  }

  // Home mobile 276x480
  console.log('=== home mobile ===');
  await captureHomeMobile(page);

  await browser.close();
  console.log('DONE showcase-recapture-v2');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
