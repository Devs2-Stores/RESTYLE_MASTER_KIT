'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const preflight = require('../run_preflight');
const stitch = require('../stitch_generate');
const haravanLint = require('../haravan_lint');
const orphanSweep = require('../orphan_sweep');
const http = require('http');
const waitSync = require('../wait_theme_sync');
const claimScan = require('../claim_scan');
const residueScan = require('../residue_scan');
const remakeContractAudit = require('../remake_contract_audit');
let passed = 0;
let failed = 0;

function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

console.log('# Pipeline Unit Tests\n');

// ==========================================
// 1. run_preflight tests
// ==========================================
console.log('## 1. run_preflight');

// 1.1 Key detection from process.env
const envCheck1 = preflight.checkEnvKey('TEST_STITCH_KEY', { TEST_STITCH_KEY: 'secret-val' }, 'win32');
check('preflight: detects key present in process.env', envCheck1.status === 'present' && envCheck1.source === 'process.env');

// 1.2 Key missing from both
const envCheck2 = preflight.checkEnvKey('NON_EXISTENT_KEY_XYZ_123', {}, 'linux');
check('preflight: reports missing when key not in env', envCheck2.status === 'missing');

// 1.3 .haravan-cli_local.json check
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
const cliNoShopPath = path.join(tempDir, '.haravan-cli_local.json');
fs.writeFileSync(cliNoShopPath, JSON.stringify({ org_id: 'org1', theme_id: '12345' }), 'utf8');

const cliCheck1 = preflight.checkCliLocalConfig(tempDir);
check('preflight: identifies missing shop in .haravan-cli_local.json', cliCheck1.hasThemeId === true && cliCheck1.hasShop === false);

fs.writeFileSync(cliNoShopPath, JSON.stringify({ shop: 'test.myharavan.com', theme_id: '12345' }), 'utf8');
const cliCheck2 = preflight.checkCliLocalConfig(tempDir);
check('preflight: passes when shop and theme_id are present', cliCheck2.hasThemeId === true && cliCheck2.hasShop === true);

// 1.4 mojibake scan: uppercase Vietnamese is valid, double-decoded UTF-8 is not
const mojibakeRoot = path.join(tempDir, 'mojibake');
fs.mkdirSync(path.join(mojibakeRoot, 'snippets'), { recursive: true });
fs.writeFileSync(path.join(mojibakeRoot, 'snippets', 'clean.liquid'), '<span>MÃ ƯU ĐÃI ĐẶC QUYỀN</span><b>NGÃ BA, CÂN, TÂM</b>', 'utf8');
fs.writeFileSync(path.join(mojibakeRoot, 'snippets', 'broken.liquid'), Buffer.from('<p>Ưu đãi tiếng Việt</p>', 'utf8').toString('latin1'), 'utf8');
const mojibakeIssues = preflight.scanMojibake(mojibakeRoot).map((m) => path.basename(m.replace(/^Possible mojibake: /, '')));
check('preflight: uppercase Vietnamese (ĐÃI, MÃ, NGÃ) is not mojibake', !mojibakeIssues.includes('clean.liquid'));
check('preflight: UTF-8 decoded as latin-1 is flagged as mojibake', mojibakeIssues.includes('broken.liquid'));

// Clean tempDir
try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

// ==========================================
// 2. stitch_generate tests
// ==========================================
console.log('\n## 2. stitch_generate');

// 2.1 Prompt size and section estimation
const shortPrompt = '# Hero Section\nDesign a luxury wine hero.\n## Features\nShow 3 key features.\n';
const shortEst = stitch.estimatePrompt(shortPrompt);
check('stitch: estimates small prompt within bounds', shortEst.isOversized === false && shortEst.sectionCount <= 6);

const oversizedSectionsPrompt = `
# Section 1
Content 1
# Section 2
Content 2
# Section 3
Content 3
# Section 4
Content 4
# Section 5
Content 5
# Section 6
Content 6
# Section 7
Content 7
`;
const sectionGate = stitch.gatePrompt(oversizedSectionsPrompt, false);
check('stitch: rejects prompt exceeding 6 sections without force', sectionGate.ok === false);

const forcedSectionGate = stitch.gatePrompt(oversizedSectionsPrompt, true);
check('stitch: allows prompt exceeding 6 sections with --force', forcedSectionGate.ok === true);

const largeBytePrompt = '# Section 1\n' + 'long text '.repeat(300);
const byteGate = stitch.gatePrompt(largeBytePrompt, false);
check('stitch: rejects prompt exceeding 1.5KB without force', byteGate.ok === false);

// 2.2 Screen filtering (DESIGN vs IMAGE)
const stubRawResponse = {
  outputComponents: [
    {
      design: {
        screens: [
          {
            id: 'screen-img-1',
            title: 'Cellar Background',
            screenType: 'IMAGE',
            screenshot: { downloadUrl: 'https://example.com/cellar.png' }
          },
          {
            id: 'screen-des-1',
            title: 'Home Full Layout',
            screenType: 'DESIGN',
            htmlCode: '<!DOCTYPE html><html><body><h1>Wine Cellar</h1></body></html>'
          },
          {
            id: 'screen-des-2',
            title: 'Home Mobile Variant',
            screenType: 'DESIGN',
            htmlCode: { downloadUrl: 'https://example.com/mobile.html' }
          }
        ]
      }
    }
  ]
};

const extracted = stitch.extractScreens(stubRawResponse);
check('stitch: extracts all 3 screens from raw components', extracted.length === 3);

const categorized = stitch.categorizeScreens(extracted);
check('stitch: filters 2 DESIGN screens', categorized.designScreens.length === 2);
check('stitch: filters 1 IMAGE screen', categorized.imageScreens.length === 1);
check('stitch: isolates IMAGE screen id', categorized.imageScreens[0].id === 'screen-img-1');

// 2.3 saveScreens output structure
const tempStitchOut = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-save-test-'));
const savePromise = stitch.saveScreens(categorized, tempStitchOut, async (url) => `<html><body>Fetched from ${url}</body></html>`);

// Wait for saveScreens
savePromise.then((saveResults) => {
  check('stitch: saveScreens returns 2 designs and 1 asset', saveResults.designs.length === 2 && saveResults.assets.length === 1);
  check('stitch: design-1 directory exists', fs.existsSync(path.join(tempStitchOut, 'design-1', 'index.html')));
  check('stitch: design-1 metadata exists', fs.existsSync(path.join(tempStitchOut, 'design-1', 'metadata.json')));
  check('stitch: assets/ directory exists for IMAGE screens', fs.existsSync(path.join(tempStitchOut, 'assets', 'image-1.json')));
  try { fs.rmSync(tempStitchOut, { recursive: true, force: true }); } catch {}
});

// ==========================================
// 3. haravan_lint tests
// ==========================================
console.log('\n## 3. haravan_lint');

// 3.1 | json filter rule
const mockThemeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haravan-lint-test-'));
fs.mkdirSync(path.join(mockThemeDir, 'layout'), { recursive: true });
fs.mkdirSync(path.join(mockThemeDir, 'snippets'), { recursive: true });
fs.mkdirSync(path.join(mockThemeDir, 'templates'), { recursive: true });
fs.mkdirSync(path.join(mockThemeDir, 'assets'), { recursive: true });
fs.mkdirSync(path.join(mockThemeDir, 'config'), { recursive: true });

// Bad liquid file with Haravan-forbidden syntax
const badLiquid = `
<div class="product">{{ product.title | json }}</div>
{% continue %}
{% render 'product-card' %}
{% schema %}
{ "name": "forbidden" }
{% endschema %}
<img src="{{ image | image_url }}" />
{% if link.levels > 1 %}Submenu{% endif %}
<p>{{ settings.home_title | default: 'Hard Fallback' }}</p>
<p>{{ settings.cat | default: collections['all'] }}</p>
<div class="container custom-row">Content</div>
<span setting-id="logo" setting-type="image_picker">Logo</span>
{{ 'missing-photo.jpg' | asset_url }}
<div class="unclosed">
`;

fs.writeFileSync(path.join(mockThemeDir, 'layout', 'theme.liquid'), badLiquid, 'utf8');

// Good script application/json with | json (should NOT be flagged)
const goodSnippet = `
<script type="application/json" id="valid-json">
  {{ product | json }}
</script>
<script type="application/ld+json">
  {{ structured_data | json }}
</script>
`;
fs.writeFileSync(path.join(mockThemeDir, 'snippets', 'valid-json.liquid'), goodSnippet, 'utf8');

// Executable script: | json is a warn needing a live probe; markup after </script> is a blocker again
const scriptJsonSnippet = `<script>
  window.themeConfig = { money: {{ shop.money_format | json }} };
</script>
<p data-title="{{ product.title | json }}"></p>
<script type="application/json">{{ product | json }}</script><script>var x = {{ cart | json }};</script>
`;
fs.writeFileSync(path.join(mockThemeDir, 'snippets', 'script-json.liquid'), scriptJsonSnippet, 'utf8');

// Bad CSS file
const badCss = `
html {
  scroll-behavior: smooth;
}
html:focus-within {
  scroll-behavior: smooth;
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none; }
}
body.lux input {
  border: 1px solid #ccc;
}
.container.grid-row {
  display: flex;
}
`;
fs.writeFileSync(path.join(mockThemeDir, 'assets', 'theme.css'), badCss, 'utf8');

// Settings schema with entity in default
const badSchema = [
  {
    name: "General",
    settings: [
      { id: "logo", type: "image_picker" },
      { id: "home_bullet", type: "text", default: "&bull; Free Shipping" }
    ]
  }
];
fs.writeFileSync(path.join(mockThemeDir, 'config', 'settings_schema.json'), JSON.stringify(badSchema, null, 2), 'utf8');

const lintFindings = haravanLint.runHaravanLint(mockThemeDir);
const ruleMap = {};
for (const f of lintFindings) {
  ruleMap[f.rule] = (ruleMap[f.rule] || 0) + 1;
}

check('lint: flags HARAVAN_FORBIDDEN_JSON_FILTER in HTML markup', (ruleMap['HARAVAN_FORBIDDEN_JSON_FILTER'] || 0) >= 1);
check('lint: does not flag | json inside application/json scripts', !lintFindings.some(f => f.location.includes('valid-json.liquid') && f.rule === 'HARAVAN_FORBIDDEN_JSON_FILTER'));
const scriptJsonFindings = lintFindings.filter(f => f.location.includes('script-json.liquid'));
check('lint: | json in executable <script> is a warn, not a blocker', scriptJsonFindings.some(f => f.location.endsWith(':2') && f.rule === 'HARAVAN_JSON_IN_SCRIPT' && f.severity === 'warn'));
check('lint: | json in markup after </script> is a blocker again', scriptJsonFindings.some(f => f.location.endsWith(':4') && f.rule === 'HARAVAN_FORBIDDEN_JSON_FILTER' && f.severity === 'blocker'));
check('lint: same-line JSON script then code script uses the code script kind', scriptJsonFindings.filter(f => f.location.endsWith(':5')).map(f => f.rule).join(',') === 'HARAVAN_JSON_IN_SCRIPT');

// 3.x Haravan reCAPTCHA let collision across forms
const recaptchaFixture = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haravan-lint-recaptcha-'));
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(dir, name.includes('/') ? name : `snippets/${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, 'utf8');
  }
  const found = haravanLint.runHaravanLint(dir).filter((f) => f.rule === 'HARAVAN_RECAPTCHA_DUPLICATE_LET');
  fs.rmSync(dir, { recursive: true, force: true });
  return found;
};
const renamedForm = "{%- capture booking_form -%}\n{% form 'contact' %}<button>Send</button>{% endform %}\n{%- endcapture -%}\n{{ booking_form | replace: 'recaptchaElm', 'bookingRecaptchaElm' | replace: 'recaptchaForm', 'bookingRecaptchaForm' }}\n";
const neutralizedForm = "{%- capture login_markup -%}{%- form 'customer_login' -%}<input>{%- endform -%}{%- endcapture -%}\n{{ login_markup | replace: '<script', '<noscript' | replace: '</script', '</noscript' }}\n";
const plainCapture = "{%- capture plain -%}{% form 'customer' %}<input>{% endform %}{%- endcapture -%}{{ plain }}\n";
const collisions = recaptchaFixture({
  'footer.liquid': "<div>\n{%- form 'customer', class: 'news' -%}<input>{%- endform -%}\n</div>\n",
  'comment.liquid': plainCapture,
  'booking.liquid': renamedForm,
  'login.liquid': neutralizedForm,
});
check('lint: two forms keeping the default reCAPTCHA names are blockers at their own lines',
  collisions.length === 2 && collisions.every((f) => f.severity === 'blocker')
  && collisions.some((f) => f.location.endsWith(`footer.liquid:2`)) && collisions.some((f) => f.location.endsWith(`comment.liquid:1`)));
check('lint: a single default-named form beside renamed and neutralized forms is not a collision',
  recaptchaFixture({ 'footer.liquid': "{% form 'customer' %}<input>{% endform %}\n", 'booking.liquid': renamedForm, 'login.liquid': neutralizedForm }).length === 0);
check('lint: single default-named forms in different templates never render together',
  recaptchaFixture({ 'templates/customers[register].liquid': "{% form 'create_customer' %}<input>{% endform %}\n", 'templates/customers[reset_password].liquid': "{% form 'reset_customer_password' %}<input>{% endform %}\n", 'booking.liquid': renamedForm }).length === 0);
const sameTemplate = recaptchaFixture({ 'templates/customers[login].liquid': "{% form 'customer_login' %}<input>{% endform %}\n{% form 'recover_customer_password' %}<input>{% endform %}\n" });
check('lint: two default-named forms in one template collide', sameTemplate.length === 2);
const loopForms = recaptchaFixture({ 'templates/customers[addresses].liquid': "{% for address in customer.addresses %}\n{%- capture edit_form -%}{% form 'customer_address', address %}<input>{% endform %}{%- endcapture -%}\n{{ edit_form | replace: 'recaptchaElm', 'editRecaptchaElm' }}\n{% endfor %}\n{% for address in customer.addresses %}\n{%- capture rc -%}addr{{ address.id }}RecaptchaElm{%- endcapture -%}{%- capture ok_form -%}{% form 'customer_address', address %}<input>{% endform %}{%- endcapture -%}\n{{ ok_form | replace: 'recaptchaElm', rc }}\n{% endfor %}\n" });
check('lint: a fixed rename inside a loop still collides, a per-item name does not',
  loopForms.length === 1 && loopForms[0].location.endsWith(':2') && /loop/.test(loopForms[0].message));
check('lint: flags HARAVAN_FORBIDDEN_CONTINUE', (ruleMap['HARAVAN_FORBIDDEN_CONTINUE'] || 0) >= 1);
check('lint: flags HARAVAN_FORBIDDEN_RENDER', (ruleMap['HARAVAN_FORBIDDEN_RENDER'] || 0) >= 1);
check('lint: flags HARAVAN_FORBIDDEN_SCHEMA', (ruleMap['HARAVAN_FORBIDDEN_SCHEMA'] || 0) >= 1);
check('lint: flags HARAVAN_FORBIDDEN_IMAGE_URL', (ruleMap['HARAVAN_FORBIDDEN_IMAGE_URL'] || 0) >= 1);
check('lint: flags HARAVAN_FORBIDDEN_LINK_LEVELS', (ruleMap['HARAVAN_FORBIDDEN_LINK_LEVELS'] || 0) >= 1);
check('lint: flags liquid-hardcoded-fallback', (ruleMap['liquid-hardcoded-fallback'] || 0) >= 1);
check('lint: flags liquid-hardcoded-handle', (ruleMap['liquid-hardcoded-handle'] || 0) >= 1);
check('lint: flags CONTAINER_INVARIANT_VIOLATION in HTML and CSS', (ruleMap['CONTAINER_INVARIANT_VIOLATION'] || 0) >= 2);
check('lint: flags editor-attribute (image_picker in markup)', (ruleMap['editor-attribute'] || 0) >= 1);
check('lint: flags MISSING_ASSET_FILE for missing assets', (ruleMap['MISSING_ASSET_FILE'] || 0) >= 1);
check('lint: flags HTML_TAG_BALANCE_ERROR for unclosed tags', (ruleMap['HTML_TAG_BALANCE_ERROR'] || 0) >= 1);
check('lint: flags HARAVAN_GLOBAL_SMOOTH_SCROLL on html while allowing focus-within', (ruleMap['HARAVAN_GLOBAL_SMOOTH_SCROLL'] || 0) >= 1);
check('lint: flags FORBIDDEN_REDUCED_MOTION in CSS', (ruleMap['FORBIDDEN_REDUCED_MOTION'] || 0) >= 1);
check('lint: flags HARAVAN_BARE_BODY_FORM_SELECTOR in CSS', (ruleMap['HARAVAN_BARE_BODY_FORM_SELECTOR'] || 0) >= 1);
check('lint: flags SCHEMA_HTML_ENTITY_IN_DEFAULT for &bull;', (ruleMap['SCHEMA_HTML_ENTITY_IN_DEFAULT'] || 0) >= 1);

// 3.2 Dynamic capture settings expansion test
const dynamicLiquid = `
{% capture slide_img %}hero_slide_{{ i }}{% endcapture %}
{{ settings[slide_img] }}
`;
const schemaWithDynamic = {
  schemaKeys: new Set(['hero_slide_1', 'hero_slide_2']),
  schemaMap: new Map(),
  dynamicPrefixes: new Set(['hero_slide_'])
};
const dynFindings = [];
haravanLint.checkLiquidFile(
  path.join(mockThemeDir, 'layout', 'theme.liquid'),
  mockThemeDir,
  dynFindings,
  schemaWithDynamic,
  new Set()
);
const falseDeadKeys = dynFindings.filter(f => f.rule === 'missing-setting' && f.message.includes('hero_slide_'));
check('lint: dynamic capture prefixes do not trigger false positive dead settings keys', falseDeadKeys.length === 0);

// Clean mockThemeDir
try { fs.rmSync(mockThemeDir, { recursive: true, force: true }); } catch {}

// ==========================================
// 4. orphan_sweep protected utilities test
// ==========================================
console.log('\n## 4. orphan_sweep protected utilities');

check('orphan_sweep: defines PROTECTED_UTILITIES', Array.isArray(orphanSweep.PROTECTED_UTILITIES) && orphanSweep.PROTECTED_UTILITIES.length >= 5);
check('orphan_sweep: protects .hidden', orphanSweep.isProtectedUtility('.hidden') === true);
check('orphan_sweep: protects [hidden]', orphanSweep.isProtectedUtility('[hidden]') === true);
check('orphan_sweep: protects .sr-only', orphanSweep.isProtectedUtility('.sr-only') === true);
check('orphan_sweep: protects .visually-hidden', orphanSweep.isProtectedUtility('.visually-hidden') === true);
check('orphan_sweep: protects .button-content', orphanSweep.isProtectedUtility('.button-content') === true);
check('orphan_sweep: does not protect regular classes', orphanSweep.isProtectedUtility('.my-custom-box') === false);

async function runNewSections() {
  await savePromise;

  // ==========================================
  // 5. wait_theme_sync tests
  // ==========================================
  console.log('\n## 5. wait_theme_sync');

  check('sync:wait: normalizeText normalizes CRLF and trailing whitespace',
    waitSync.normalizeText('line 1  \r\nline 2   \r\n') === 'line 1\nline 2');

  const syncThemeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-theme-test-'));
  fs.mkdirSync(path.join(syncThemeDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(syncThemeDir, 'assets', 'theme.css'), '/* synced-css */\r\n', 'utf8');

  let serverHitCount = 0;
  const syncServer = http.createServer((req, res) => {
    serverHitCount += 1;
    const parsed = new URL(req.url, 'http://127.0.0.1');
    if (parsed.pathname === '/' || parsed.pathname === '') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><head><link rel="stylesheet" href="http://127.0.0.1:${syncServer.address().port}/themes/1001522013/10001/14/theme.css?v=1"></head></html>`);
    } else if (parsed.pathname === '/themes/1001522013/10001/14/theme.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('/* synced-css */\n');
    } else if (parsed.pathname === '/pages/marker-test') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><div id="liquid-marker">MARKER_SYNC_VERIFIED_OK</div></body></html>');
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });

  await new Promise((resolve) => syncServer.listen(0, '127.0.0.1', resolve));
  const serverPort = syncServer.address().port;
  const localShopUrl = `http://127.0.0.1:${serverPort}`;

  // 5.1 Test synced asset
  const syncResultOk = await waitSync.runWaitThemeSync({
    shop: localShopUrl,
    root: syncThemeDir,
    asset: 'theme.css',
    interval: 0.05,
    timeout: 2
  });
  check('sync:wait: succeeds when remote asset matches local bytes',
    syncResultOk.ok === true && syncResultOk.assets[0].synced === true);

  // 5.2 Test marker verification
  const syncResultMarker = await waitSync.runWaitThemeSync({
    shop: localShopUrl,
    root: syncThemeDir,
    marker: 'MARKER_SYNC_VERIFIED_OK',
    path: '/pages/marker-test',
    interval: 0.05,
    timeout: 2
  });
  check('sync:wait: succeeds when rendered HTML contains marker text',
    syncResultMarker.ok === true && syncResultMarker.markers[0].synced === true);

  // 5.3 Test timeout when asset does not match
  fs.writeFileSync(path.join(syncThemeDir, 'assets', 'theme.css'), '/* mismatching-local-css */\n', 'utf8');
  const syncResultTimeout = await waitSync.runWaitThemeSync({
    shop: localShopUrl,
    root: syncThemeDir,
    asset: 'theme.css',
    interval: 0.05,
    timeout: 0.2
  });
  check('sync:wait: reports timeout when remote asset does not match local within deadline',
    syncResultTimeout.ok === false && syncResultTimeout.timeout === true);

  syncServer.close();
  try { fs.rmSync(syncThemeDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 6. claim_scan tests
  // ==========================================
  console.log('\n## 6. claim_scan');

  const cleanClaimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-clean-'));
  fs.mkdirSync(path.join(cleanClaimDir, 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(cleanClaimDir, 'snippets', 'clean.liquid'), '<header><h1>Cửa hàng xe đạp</h1></header>', 'utf8');
  const cleanFindings = claimScan.scanTheme(cleanClaimDir);
  check('claim_scan: passes clean theme with 0 findings', cleanFindings.length === 0);

  const dirtyClaimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-dirty-'));
  fs.mkdirSync(path.join(dirtyClaimDir, 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(dirtyClaimDir, 'snippets', 'dirty.liquid'), `
    <p>Sản phẩm chính hãng 100%, trả góp 0%, chứng nhận UCI Approved.</p>
    <p>Khung carbon Toray T1000, hệ số khí động học CdA 0.218.</p>
    <p>Cam kết hoàn tiền trong 7 ngày, hỗ trợ đổi trả 30 ngày.</p>
  `, 'utf8');
  const dirtyFindings = claimScan.scanTheme(dirtyClaimDir);
  check('claim_scan: detects fabricated commercial claims', dirtyFindings.length >= 6);
  check('claim_scan: flags chính hãng 100%', dirtyFindings.some(f => f.match.toLowerCase().includes('chính hãng 100')));
  check('claim_scan: flags trả góp 0%', dirtyFindings.some(f => f.match.toLowerCase().includes('trả góp 0%')));
  check('claim_scan: flags UCI Approved', dirtyFindings.some(f => f.match.toLowerCase().includes('uci approved')));
  check('claim_scan: flags Toray T1000', dirtyFindings.some(f => f.match.toLowerCase().includes('toray t1000')));
  check('claim_scan: flags CdA spec', dirtyFindings.some(f => f.match.toLowerCase().includes('cda 0.218')));
  check('claim_scan: flags cam kết hoàn tiền', dirtyFindings.some(f => f.match.toLowerCase().includes('cam kết hoàn tiền')));

  try { fs.rmSync(cleanClaimDir, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(dirtyClaimDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 7. haravan_lint new rules
  // ==========================================
  console.log('\n## 7. haravan_lint new rules');

  // 7.1 MISSING_HIDDEN_ATTRIBUTE_OVERRIDE
  const hiddenFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-hidden-'));
  fs.mkdirSync(path.join(hiddenFixtureDir, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(hiddenFixtureDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(hiddenFixtureDir, 'layout', 'theme.liquid'), '<div class="btn-toggle" hidden>Text</div>', 'utf8');
  fs.writeFileSync(path.join(hiddenFixtureDir, 'assets', 'theme.css'), '.btn-toggle { display: inline-flex; }', 'utf8');
  const hiddenFindings = haravanLint.runHaravanLint(hiddenFixtureDir);
  check('lint: flags MISSING_HIDDEN_ATTRIBUTE_OVERRIDE when class sets display and is used with hidden',
    hiddenFindings.some(f => f.rule === 'MISSING_HIDDEN_ATTRIBUTE_OVERRIDE'));
  try { fs.rmSync(hiddenFixtureDir, { recursive: true, force: true }); } catch {}

  // 7.2 MISSING_HIDDEN_CLASS_IN_CSS
  const hiddenClassDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-hidden-class-'));
  fs.mkdirSync(path.join(hiddenClassDir, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(hiddenClassDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(hiddenClassDir, 'layout', 'theme.liquid'), '<div class="hidden">Hidden text</div>', 'utf8');
  fs.writeFileSync(path.join(hiddenClassDir, 'assets', 'theme.css'), '.btn { color: red; }', 'utf8');
  const hiddenClassFindings = haravanLint.runHaravanLint(hiddenClassDir);
  check('lint: flags MISSING_HIDDEN_CLASS_IN_CSS when class="hidden" used but .hidden missing in CSS',
    hiddenClassFindings.some(f => f.rule === 'MISSING_HIDDEN_CLASS_IN_CSS'));
  try { fs.rmSync(hiddenClassDir, { recursive: true, force: true }); } catch {}

  // 7.3 UNREFERENCED_STYLESHEET
  const unrefCssDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-unref-css-'));
  fs.mkdirSync(path.join(unrefCssDir, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(unrefCssDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(unrefCssDir, 'layout', 'theme.liquid'), '<html><head>{{ "theme.css" | asset_url | stylesheet_tag }}</head></html>', 'utf8');
  fs.writeFileSync(path.join(unrefCssDir, 'assets', 'theme.css'), 'body{}', 'utf8');
  fs.writeFileSync(path.join(unrefCssDir, 'assets', 'unreferenced.css'), 'body{}', 'utf8');
  const unrefCssFindings = haravanLint.runHaravanLint(unrefCssDir);
  check('lint: flags UNREFERENCED_STYLESHEET for unreferenced CSS in assets/',
    unrefCssFindings.some(f => f.rule === 'UNREFERENCED_STYLESHEET' && f.message.includes('unreferenced.css')));
  try { fs.rmSync(unrefCssDir, { recursive: true, force: true }); } catch {}

  // 7.4 UNREFERENCED_TEMPLATE_STYLESHEET
  const unrefTemplateCssDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-unref-template-css-'));
  fs.mkdirSync(path.join(unrefTemplateCssDir, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(unrefTemplateCssDir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(unrefTemplateCssDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(unrefTemplateCssDir, 'layout', 'theme.liquid'), '<html><head>{{ "theme.css" | asset_url | stylesheet_tag }}</head></html>', 'utf8');
  fs.writeFileSync(path.join(unrefTemplateCssDir, 'templates', 'page.faq.liquid'), '<main>FAQ</main>', 'utf8');
  fs.writeFileSync(path.join(unrefTemplateCssDir, 'assets', 'theme.css'), 'body{}', 'utf8');
  fs.writeFileSync(path.join(unrefTemplateCssDir, 'assets', 'page-faq.css'), '/* page-faq */', 'utf8');
  const unrefTemplateFindings = haravanLint.runHaravanLint(unrefTemplateCssDir);
  check('lint: flags UNREFERENCED_TEMPLATE_STYLESHEET when page.faq stylesheet branch is missing in head',
    unrefTemplateFindings.some(f => f.rule === 'UNREFERENCED_TEMPLATE_STYLESHEET' && f.message.includes('page.faq')));
  try { fs.rmSync(unrefTemplateCssDir, { recursive: true, force: true }); } catch {}

  // 7.5 UNDEFINED_THEME_UTIL_FUNCTION
  const undefinedUtilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-undef-util-'));
  fs.mkdirSync(path.join(undefinedUtilDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(undefinedUtilDir, 'assets', 'app.js'), 'ThemeUtils.nonExistentFn(); window.MyTheme.ghostFn();', 'utf8');
  const undefUtilFindings = haravanLint.runHaravanLint(undefinedUtilDir);
  check('lint: flags UNDEFINED_THEME_UTIL_FUNCTION when called method is not defined in assets',
    undefUtilFindings.some(f => f.rule === 'UNDEFINED_THEME_UTIL_FUNCTION' && f.message.includes('nonExistentFn')));
  try { fs.rmSync(undefinedUtilDir, { recursive: true, force: true }); } catch {}

  // 7.6 DUPLICATE_GLOBAL_SNIPPET_INCLUDE
  const dupSnippetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-dup-snippet-'));
  fs.mkdirSync(path.join(dupSnippetDir, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(dupSnippetDir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(dupSnippetDir, 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(dupSnippetDir, 'layout', 'theme.liquid'), "{% include 'booking-modal' %}", 'utf8');
  fs.writeFileSync(path.join(dupSnippetDir, 'templates', 'page.liquid'), "{% include 'booking-modal' %}", 'utf8');
  fs.writeFileSync(path.join(dupSnippetDir, 'snippets', 'booking-modal.liquid'), "<div>Booking</div>", 'utf8');
  const dupSnippetFindings = haravanLint.runHaravanLint(dupSnippetDir);
  check('lint: flags DUPLICATE_GLOBAL_SNIPPET_INCLUDE when theme.liquid snippet re-included in template',
    dupSnippetFindings.some(f => f.rule === 'DUPLICATE_GLOBAL_SNIPPET_INCLUDE' && f.message.includes('booking-modal')));
  try { fs.rmSync(dupSnippetDir, { recursive: true, force: true }); } catch {}

  // 7.7 HARAVAN_DROP_JSON_FILTER
  const dropJsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-drop-json-'));
  fs.mkdirSync(path.join(dropJsonDir, 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(dropJsonDir, 'snippets', 'test.liquid'), '<p>{{ product | json }}</p><p>{{ variant | json }}</p>', 'utf8');
  const dropJsonFindings = haravanLint.runHaravanLint(dropJsonDir);
  check('lint: flags HARAVAN_DROP_JSON_FILTER on product | json in HTML',
    dropJsonFindings.some(f => f.rule === 'HARAVAN_DROP_JSON_FILTER'));
  try { fs.rmSync(dropJsonDir, { recursive: true, force: true }); } catch {}

  // 7.8 HARAVAN_CART_ADD_ITEMS_ARRAY
  const cartAddDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-cart-add-'));
  fs.mkdirSync(path.join(cartAddDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(cartAddDir, 'assets', 'cart.js'), "fetch('/cart/add.js', { method: 'POST', body: JSON.stringify({ items: items }) });", 'utf8');
  const cartAddFindings = haravanLint.runHaravanLint(cartAddDir);
  check('lint: flags HARAVAN_CART_ADD_ITEMS_ARRAY when /cart/add.js sent with items array',
    cartAddFindings.some(f => f.rule === 'HARAVAN_CART_ADD_ITEMS_ARRAY'));
  try { fs.rmSync(cartAddDir, { recursive: true, force: true }); } catch {}

  // 7.9 HARAVAN_DOTLIQUID_NIL_SIZE
  const nilSizeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-nil-size-'));
  fs.mkdirSync(path.join(nilSizeDir, 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(nilSizeDir, 'snippets', 'test.liquid'), '{% if product.tags.size > 0 %}Tags{% endif %}', 'utf8');
  const nilSizeFindings = haravanLint.runHaravanLint(nilSizeDir);
  check('lint: flags HARAVAN_DOTLIQUID_NIL_SIZE as warning without blank guard',
    nilSizeFindings.some(f => f.rule === 'HARAVAN_DOTLIQUID_NIL_SIZE' && f.severity === 'warn'));
  try { fs.rmSync(nilSizeDir, { recursive: true, force: true }); } catch {}

  // 7.10 BOT_DETECTION_LOCATION_RELOAD
  const botReloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-bot-reload-'));
  fs.mkdirSync(path.join(botReloadDir, 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(botReloadDir, 'snippets', 'nops.liquid'), '<script>if (!window.noPS) { location.reload(); }</script>', 'utf8');
  const botReloadFindings = haravanLint.runHaravanLint(botReloadDir);
  check('lint: flags BOT_DETECTION_LOCATION_RELOAD when location.reload used in bot detection',
    botReloadFindings.some(f => f.rule === 'BOT_DETECTION_LOCATION_RELOAD'));
  try { fs.rmSync(botReloadDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 8. residue_scan multi-brand
  // ==========================================
  console.log('\n## 8. residue_scan multi-brand');

  const parsedArgs = residueScan.parseArgs(['node', 'residue_scan.js', '--brands', 'Lux Wine,S2 Bed,S2 Spa']);
  check('residue_scan: parses comma-separated --brands flag',
    Array.isArray(parsedArgs.brands) && parsedArgs.brands.length === 3 && parsedArgs.brands[0] === 'Lux Wine');

  const derived = residueScan.deriveResidueVariants(['Lux Wine', 'S2 Bed', 'S2 Spa']);
  const derivedValues = derived.map(d => (typeof d === 'string' ? d : d.value).toLowerCase());
  check('residue_scan: derives wine_ prefix from Lux Wine', derivedValues.includes('wine_'));
  check('residue_scan: derives lux- prefix from Lux Wine', derivedValues.includes('lux-'));
  check('residue_scan: derives bed_ prefix from S2 Bed', derivedValues.includes('bed_'));
  check('residue_scan: derives s2bed variant from S2 Bed', derivedValues.includes('s2bed'));
  check('residue_scan: derives spa_ prefix from S2 Spa', derivedValues.includes('spa_'));
  check('residue_scan: retains base variants with empty brands', residueScan.deriveResidueVariants([]).length >= 5);

  // ==========================================
  // 9. remake_contract_audit allowlist reason
  // ==========================================
  console.log('\n## 9. remake_contract_audit');

  const contractAuditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remake-audit-'));
  fs.mkdirSync(path.join(contractAuditDir, 'deliverables'), { recursive: true });
  const sampleContract = {
    contract: {
      features: {
        'cart-drawer': {
          status: 'passed'
        }
      }
    },
    allowlists: {
      theme_important: [
        { path: 'snippets/cart.liquid', reason: 'Shared Haravan core template' }
      ]
    }
  };
  fs.writeFileSync(path.join(contractAuditDir, 'deliverables', 'FULL_REMAKE_CONTRACT.json'), JSON.stringify(sampleContract), 'utf8');
  let contractAuditOutput = '';
  const originalLog = console.log;
  console.log = (...args) => { contractAuditOutput += args.join(' ') + '\n'; };
  try {
    remakeContractAudit.main(contractAuditDir);
  } finally {
    console.log = originalLog;
  }
  check('remake_contract_audit: prints allowlist entries with reason',
    contractAuditOutput.includes('Shared Haravan core template'));
  try { fs.rmSync(contractAuditDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 10. stitch_generate missing project ID
  // ==========================================
  console.log('\n## 10. stitch_generate');

  const oldStitchEnv = process.env.STITCH_PROJECT_ID;
  delete process.env.STITCH_PROJECT_ID;
  let stitchErr = null;
  try {
    stitch.resolveProjectId({});
  } catch (err) {
    stitchErr = err;
  } finally {
    if (oldStitchEnv) process.env.STITCH_PROJECT_ID = oldStitchEnv;
  }
  check('stitch_generate: throws error when STITCH_PROJECT_ID and --project are missing',
    stitchErr !== null && /Missing Stitch project ID/.test(stitchErr.message));

  // ==========================================
  // 11. run_preflight dev watchers and theme role
  // ==========================================
  console.log('\n## 11. run_preflight');

  const publishedId = preflight.probePublishedThemeId('<html><script>var Haravan = { theme: { id: 1001522013 } };</script></html>');
  check('preflight: probes published theme ID from storefront HTML', publishedId === '1001522013');

  const devWatchers = preflight.detectDevWatchers('win32');
  check('preflight: detectDevWatchers returns array with pid and command',
    Array.isArray(devWatchers) && (devWatchers.length === 0 || (devWatchers[0].pid && typeof devWatchers[0].command === 'string')));
  // ==========================================
  // 12. T3-A01: run_preflight org_id + main role blocker
  // ==========================================
  console.log('\n## 12. T3-A01 run_preflight org_id & main role blocker');
  const pfRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-t3a01-'));
  fs.mkdirSync(path.join(pfRoot, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(pfRoot, 'config'), { recursive: true });
  fs.mkdirSync(path.join(pfRoot, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(pfRoot, 'snippets'), { recursive: true });
  fs.mkdirSync(path.join(pfRoot, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(pfRoot, 'layout', 'theme.liquid'), '{{ content_for_layout }}', 'utf8');
  fs.writeFileSync(path.join(pfRoot, 'config', 'settings_schema.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(pfRoot, '.haravan-cli_local.json'), JSON.stringify({
    org_id: '200001223532',
    theme_id: '1001522013',
    theme_name: 'Main Theme',
    role: 'main'
  }), 'utf8');
  const cliCfg = preflight.checkCliLocalConfig(pfRoot);
  check('T3-A01: checkCliLocalConfig accepts org_id + theme_id without shop', cliCfg.hasOrgId && cliCfg.hasThemeId && !cliCfg.hasShop);
  const pfBlocked = preflight.runPreflight(pfRoot, {});
  check('T3-A01: missing shop is downgraded to warn when org_id + theme_id exist',
    pfBlocked.warns.some((w) => w.includes('missing field: shop')) && !pfBlocked.blockers.some((b) => b.includes('shop')));
  check('T3-A01: role==="main" is a blocker without --allow-main-theme',
    pfBlocked.pass === false && pfBlocked.blockers.some((b) => b.includes("has role 'main'")));
  const pfAllowed = preflight.runPreflight(pfRoot, { allowMainTheme: true });
  check('T3-A01: --allow-main-theme downgrades role==="main" to warn and passes',
    pfAllowed.pass === true && pfAllowed.warns.some((w) => w.includes("has role 'main'")));
  try { fs.rmSync(pfRoot, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 13. T3-A02: theme_package F1GENZ settings_schema.json & atomic zip
  // ==========================================
  console.log('\n## 13. T3-A02 theme_package F1GENZ & settings_boundary_audit');
  const { spawnSync } = require('child_process');
  const scratchOutDir = 'E:/Work/scratch/maintenance-261015';
  fs.mkdirSync(scratchOutDir, { recursive: true });
  const timerWatchRoot = 'E:/Work/themes/devs2/Haravan/S2 Timer Watch';
  if (fs.existsSync(timerWatchRoot)) {
    const twZipPath = path.join(scratchOutDir, 'timer-watch-preview.zip');
    const pkgRes = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'theme_package.js'),
      '--root', timerWatchRoot,
      '--out', scratchOutDir,
      '--file', 'timer-watch-preview.zip'
    ], { encoding: 'utf8' });
    check('T3-A02: theme_package packages S2 Timer Watch without settings.html', pkgRes.status === 0 && fs.existsSync(twZipPath));
    const { listZipEntries } = require('../lib/zip');
    const entries = listZipEntries(twZipPath);
    check('T3-A02: S2 Timer Watch zip contains config/settings_schema.json', entries.includes('config/settings_schema.json') && entries.includes('layout/theme.liquid'));
    const pkgOverwriteRes = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'theme_package.js'),
      '--root', timerWatchRoot,
      '--out', scratchOutDir,
      '--file', 'timer-watch-preview.zip'
    ], { encoding: 'utf8' });
    check('T3-A02: theme_package atomic overwrite succeeds when zip already exists', pkgOverwriteRes.status === 0);
  }

  // ==========================================
  // 14. T3-A03: wait_theme_sync default assets & CDN hash verification
  // ==========================================
  console.log('\n## 14. T3-A03 wait_theme_sync default target & CDN fallback');
  const syncCdnDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-cdn-test-'));
  fs.mkdirSync(path.join(syncCdnDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(syncCdnDir, 'assets', 'modals.css'), '.tw-modal { display: flex; }\n', 'utf8');
  const extractedCdn = waitSync.extractCdnThemeBase(
    '<html><head><link href="//cdn.hstatic.net/themes/200001223532/1001522239/14/theme.css?v=99" rel="stylesheet"></head></html>',
    'https://timer-watch.myharavan.com',
    '1001522239',
    syncCdnDir
  );
  check('T3-A03: extractCdnThemeBase extracts versioned hstatic CDN base from HTML',
    extractedCdn === 'https://cdn.hstatic.net/themes/200001223532/1001522239/14/');
  const staleFirstHtml = '<html><head><meta content="//cdn.hstatic.net/themes/200000123934/1001522541/14/logo.png">' +
    '<link href="//cdn.hstatic.net/themes/200001223532/1001522239/14/theme.css?v=99" rel="stylesheet"></head></html>';
  check('T3-A03: extractCdnThemeBase skips a CDN base that belongs to another theme id',
    waitSync.extractCdnThemeBase(staleFirstHtml, 'https://timer-watch.myharavan.com', '1001522239', syncCdnDir) ===
      'https://cdn.hstatic.net/themes/200001223532/1001522239/14/');
  const staleAssetHtml = '<img src="//cdn.hstatic.net/themes/200000123934/1001522541/14/theme.css?v=1">' +
    '<link href="//cdn.hstatic.net/themes/200001223532/1001522239/14/theme.css?v=99">';
  check('T3-A03: resolveAssetUrl skips an asset URL from another theme id',
    waitSync.resolveAssetUrl(staleAssetHtml, 'theme.css', 'https://timer-watch.myharavan.com', '1001522239') ===
      'https://cdn.hstatic.net/themes/200001223532/1001522239/14/theme.css?v=99');
  const cdnServer = http.createServer((req, res) => {
    if (req.url.startsWith('/?themeid=')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      // Note: modals.css is NOT linked in HTML, only theme.css is linked, so wait_theme_sync must use extracted CDN base!
      res.end(`<html><head><link rel="stylesheet" href="http://127.0.0.1:${cdnServer.address().port}/themes/200001/1001/14/theme.css"></head></html>`);
    } else if (req.url.startsWith('/themes/200001/1001/14/modals.css')) {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('.tw-modal { display: flex; }\n');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise((resolve) => cdnServer.listen(0, '127.0.0.1', resolve));
  const cdnPort = cdnServer.address().port;
  const defaultSyncRes = await waitSync.runWaitThemeSync({
    base: `http://127.0.0.1:${cdnPort}`,
    themeId: '1001',
    root: syncCdnDir,
    assets: [],
    markers: [],
    timeout: 2,
    interval: 0.05
  });
  check('T3-A03: wait_theme_sync auto-selects recent asset when no --asset/--marker given and verifies via CDN base',
    defaultSyncRes.ok === true && defaultSyncRes.assets.some((a) => a.path.endsWith('modals.css') && a.synced));
  await new Promise((resolve) => cdnServer.close(resolve));
  try { fs.rmSync(syncCdnDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 15. T3-A04 + DesignDefaults: remake-contract & residue word-boundary
  // ==========================================
  console.log('\n## 15. T3-A04 remake-contract word-boundary, hosted-auth & designDefaults');
  const remakeLib = require('../lib/remake-contract');
  const defaultVariants = remakeLib.deriveResidueVariants('hrv-hot-reload');
  check('T3-A04: deriveResidueVariants does not derive hot_ or hot- from hrv-hot-reload',
    !defaultVariants.includes('hot_') && !defaultVariants.includes('hot-') && defaultVariants.includes('hrv-hot-reload'));
  const rogHitsFalsePositive = remakeLib.scanResidueInText(
    '<div class="progress-bar hot-products">In progress</div>',
    'templates/index.liquid',
    [{ value: 'hrv-hot-reload', finalOnly: false }, { value: 'ROG', finalOnly: false }],
    true
  );
  check('T3-A04: word-boundary regex does not flag "progress" for "rog" or "hot-products" for "hrv-hot-reload"',
    rogHitsFalsePositive.length === 0);
  const rogHitsTruePositive = remakeLib.scanResidueInText(
    '<div class="rog-hero">{{ settings.rog_banner }}</div>',
    'templates/index.liquid',
    [{ value: 'ROG', finalOnly: false }],
    true
  );
  check('T3-A04: word-boundary regex flags "rog-hero" and "rog_banner" for brand "ROG"',
    rogHitsTruePositive.length >= 1);

  const authThemeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-auth-contract-'));
  fs.mkdirSync(path.join(authThemeDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(authThemeDir, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(authThemeDir, 'assets', 'theme.css'), ':root { --tw-color-price: #C8102E; --tw-gutter: 16px; font-size: 14px; } .hidden { display: none !important; }', 'utf8');
  fs.writeFileSync(path.join(authThemeDir, 'templates', 'customers[login].liquid'), '<div>{{ customer.name }}</div>', 'utf8');
  const authContractFindings = remakeLib.validateRemakeContract(authThemeDir, {
    version: 1,
    policy: { merchantData: 'settings-only' },
    preview: { status: 'passed', baseUrl: 'https://example.myharavan.com' },
    designDefaults: {
      canvasColor: '#FFFFFF',
      mobileRootFontPx: 14,
      priceColor: '#C8102E',
      sectionSpace: 'clamp(2.5rem, 6vw, 4.5rem)',
      gutterToken: '--tw-gutter',
      homeSectionOrder: ['hero']
    },
    screens: [{
      name: 'account-login',
      status: 'verified-static-hosted-auth',
      hostedAuthRedirect: true,
      landmarks: [{ name: 'login-form', source: 'stitch:login', target: 'templates/customers[login].liquid', status: 'matched' }],
      evidence: { desktop: '', mobile: '' }
    }],
    features: [{
      name: 'customer-login',
      status: 'preserved',
      sourceHooks: ['templates/customers[login].liquid'],
      targetHooks: ['templates/customers[login].liquid::customer.name'],
      evidence: ['static-template']
    }],
    sharedPrimitives: [],
    cssOwnership: [],
    allowlists: { merchantDefaults: [], themeImportant: [{ file: 'assets/theme.css', contains: '.hidden' }], vendorCss: [] },
    residueMarkers: []
  }, { final: true });
  check('T3-A04: verified-static-hosted-auth passes on account-login without desktop/mobile screenshot evidence',
    authContractFindings.length === 0);

  const badDesignDefaultsFindings = remakeLib.validateDesignDefaults(authThemeDir, { version: 1 });
  check('Item 9: validateDesignDefaults flags missing designDefaults block',
    badDesignDefaultsFindings.some((f) => f.includes('DESIGN_DEFAULTS_MISSING')));
  try { fs.rmSync(authThemeDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 16. T3-A05: final_showcase_capture resizeCrop & fullpage slice stitching
  // ==========================================
  console.log('\n## 16. T3-A05 final_showcase_capture resizeCrop & slice stitching');
  const showcaseCapture = require('../final_showcase_capture');
  const cropTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-crop-test-'));
  const srcPng = showcaseCapture.encodeRawRgbaToPng(1200, 1600, Buffer.alloc(1200 * 1600 * 4, 240));
  const cropDest = path.join(cropTmpDir, 'Trang chủ.png');
  await showcaseCapture.resizeCrop(srcPng, cropDest, 876, 600);
  const cropMeta = showcaseCapture.decodePngToRawRgba(fs.readFileSync(cropDest));
  check('T3-A05: resizeCrop writes 876x600 PNG atomically from buffer',
    cropMeta.width === 876 && cropMeta.height === 600);

  // Mock page with 16000px scrollHeight (> MAX_SAFE_FULLPAGE_HEIGHT 14000) to test slice stitching
  let sliceCount = 0;
  const mockTallPage = {
    evaluate: async (fn) => {
      const src = fn.toString();
      if (src.includes('scrollHeight')) {
        return { docWidth: 400, docHeight: 16000, viewportWidth: 400, viewportHeight: 800 };
      }
      return undefined;
    },
    screenshot: async (opts) => {
      sliceCount += 1;
      const h = opts.clip ? opts.clip.height : 16000;
      const w = opts.clip ? opts.clip.width : 400;
      return showcaseCapture.encodeRawRgbaToPng(w, h, Buffer.alloc(w * h * 4, 200));
    }
  };
  const tallDest = path.join(cropTmpDir, 'tall-fullpage.png');
  await showcaseCapture.captureFullPage(mockTallPage, tallDest);
  const tallMeta = showcaseCapture.decodePngToRawRgba(fs.readFileSync(tallDest));
  check('T3-A05: captureFullPage slices pages > 14000px and stitches into full height PNG',
    sliceCount === 2 && tallMeta.width === 400 && tallMeta.height === 16000);
  try { fs.rmSync(cropTmpDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 17. T3-A06: settings_merge.js CLI, layer order, bare image_picker & dry-run mtime
  // ==========================================
  console.log('\n## 17. T3-A06 settings_merge.js');
  const settingsMerge = require('../settings_merge');
  const noManifestRes = spawnSync(process.execPath, [path.join(__dirname, '..', 'settings_merge.js')], { encoding: 'utf8' });
  check('T3-A06: settings_merge without --manifest exits with code 2', noManifestRes.status === 2);
  const globManifestRes = spawnSync(process.execPath, [path.join(__dirname, '..', 'settings_merge.js'), '--manifest', 'patches/*.json'], { encoding: 'utf8' });
  check('T3-A06: settings_merge with wildcard glob exits with code 2', globManifestRes.status === 2);

  const mergeFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-merge-test-'));
  fs.mkdirSync(path.join(mergeFixtureDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(mergeFixtureDir, 'layout'), { recursive: true });
  const mergeSchemaPath = path.join(mergeFixtureDir, 'config', 'settings_schema.json');
  const mergeDataPath = path.join(mergeFixtureDir, 'config', 'settings_data.json');
  fs.writeFileSync(mergeSchemaPath, JSON.stringify([
    {
      name: '1. Đầu trang',
      settings: [
        { type: 'text', id: 'tw_header_title', label: 'Tiêu đề', default: 'Đồng hồ Thụy Sĩ' }
      ]
    }
  ], null, 2), 'utf8');
  fs.writeFileSync(mergeDataPath, '{"current":{"tw_header_title":"\\u0110\\u1ED3ng h\\u1ED3 Th\\u1EE5y S\\u0129"}}', 'utf8');
  fs.writeFileSync(path.join(mergeFixtureDir, 'layout', 'theme.liquid'), `
    {% if settings.tw_header_title != blank %}<h1 setting-id="tw_header_title" setting-type="text">{{ settings.tw_header_title }}</h1>{% endif %}
    {% if settings.tw_hero_img != blank %}<img setting-id="tw_hero_img" setting-type="image" src="{{ settings.tw_hero_img }}">{% endif %}
  `, 'utf8');

  // Flat schema_add entry must fail with index
  const flatManifestPath = path.join(mergeFixtureDir, 'flat-manifest.json');
  fs.writeFileSync(flatManifestPath, JSON.stringify({
    patches: [
      {
        layer: 'slice:S1',
        schema_add: [
          { type: 'text', id: 'flat_bad', label: 'Flat entry without group' }
        ]
      }
    ]
  }), 'utf8');
  let flatErr = null;
  try {
    await settingsMerge.runSettingsMerge({ root: mergeFixtureDir, manifest: flatManifestPath, dryRun: true });
  } catch (e) {
    flatErr = e;
  }
  check('T3-A06: settings_merge rejects flat schema_add entry with index location',
    flatErr !== null && /schema_add\[0\]/.test(flatErr.message));

  // Out-of-order layer (S1 after D1) must fail
  const orderManifestPath = path.join(mergeFixtureDir, 'order-manifest.json');
  fs.writeFileSync(orderManifestPath, JSON.stringify({
    patches: [
      { layer: 'data-cleanup:D1', data_set: { tw_header_title: 'Mới' } },
      { layer: 'slice:G0', data_set: { tw_header_title: 'Đè ngược' } }
    ]
  }), 'utf8');
  let orderErr = null;
  try {
    await settingsMerge.runSettingsMerge({ root: mergeFixtureDir, manifest: orderManifestPath, dryRun: true });
  } catch (e) {
    orderErr = e;
  }
  check('T3-A06: settings_merge rejects out-of-order patch layer (G0 after D1)',
    orderErr !== null && /Out-of-order patch layer/.test(orderErr.message));

  // Bare image_picker filename without --asset-cdn-base must fail
  const validManifestPath = path.join(mergeFixtureDir, 'valid-manifest.json');
  fs.writeFileSync(validManifestPath, JSON.stringify({
    patches: [
      {
        layer: 'slice:S1',
        schema_add: [
          {
            group: '1. Đầu trang',
            settings: [
              { type: 'image_picker', id: 'tw_hero_img', label: 'Ảnh hero', default: 'hero_banner.jpg' }
            ]
          }
        ],
        data_set: {
          tw_hero_img: 'hero_banner.jpg',
          tw_header_title: 'Đồng hồ Cao cấp'
        }
      }
    ]
  }), 'utf8');
  let bareImgErr = null;
  try {
    await settingsMerge.runSettingsMerge({ root: mergeFixtureDir, manifest: validManifestPath, dryRun: true });
  } catch (e) {
    bareImgErr = e;
  }
  check('T3-A06: settings_merge fails on bare image_picker filename without --asset-cdn-base',
    bareImgErr !== null && /Bare image_picker filename/.test(bareImgErr.message));

  // Dry-run with --asset-cdn-base must not change mtime of settings_data.json
  const oldTime = new Date(Date.now() - 60000);
  fs.utimesSync(mergeDataPath, oldTime, oldTime);
  const mtimeBefore = fs.statSync(mergeDataPath).mtimeMs;
  const dryMergeRes = await settingsMerge.runSettingsMerge({
    root: mergeFixtureDir,
    manifest: validManifestPath,
    assetCdnBase: 'https://cdn.hstatic.net/themes/200001/1001/14/',
    dryRun: true
  });
  const mtimeAfter = fs.statSync(mergeDataPath).mtimeMs;
  check('T3-A06: settings_merge --dry-run does not modify mtime of settings_data.json',
    dryMergeRes.ok === true && mtimeBefore === mtimeAfter);

  // Write mode resolves bare image_picker to full CDN URL and preserves single-line uppercase \uXXXX format
  const writeMergeRes = await settingsMerge.runSettingsMerge({
    root: mergeFixtureDir,
    manifest: validManifestPath,
    assetCdnBase: 'https://cdn.hstatic.net/themes/200001/1001/14/',
    writeSchema: true,
    writeData: true
  });
  const writtenDataRaw = fs.readFileSync(mergeDataPath, 'utf8');
  const writtenDataObj = JSON.parse(writtenDataRaw);
  check('T3-A06: settings_merge resolves bare image_picker to full hstatic URL and preserves single-line \\uXXXX format',
    writeMergeRes.ok === true
    && !writtenDataRaw.includes('\n')
    && /\\u0110\\u1ED3ng/.test(writtenDataRaw)
    && writtenDataObj.current.tw_hero_img === 'https://cdn.hstatic.net/themes/200001/1001/14/hero_banner.jpg');
  try { fs.rmSync(mergeFixtureDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 18. T3-A07 + T5-05: haravan_lint on test/mock-theme-bad & residue_scan --domain-words
  // ==========================================
  console.log('\n## 18. T3-A07 + T5-05 haravan_lint rules & residue_scan --domain-words');
  const badThemeFindings = haravanLint.runHaravanLint(path.join(__dirname, 'mock-theme-bad'));
  const badRuleSet = new Set(badThemeFindings.map((f) => f.rule));
  for (const expectedRule of [
    'CROSS_TEMPLATE_CSS_MISSING',
    'UNSTYLED_CLASS',
    'ICON_MISSING_FROM_SPRITE',
    'CUSTOM_ELEMENT_INLINE_ROOT',
    'HARAVAN_INVALID_IMG_URL_SIZE',
    'CONTAINER_GUTTER_OVERRIDE',
    'VIEWPORT_UNIT_ALIGNMENT',
    'UNBALANCED_LIQUID_TAG',
    'MEDIA_QUERY_OVERRIDDEN_BY_BASE',
    'INLINE_STATIC_TOKEN_OVERRIDE',
    'image-picker-bare-default',
    'image-picker-default-missing',
    'image-picker-bare-value',
    'select-default-invalid',
    'select-value-invalid',
    'liquid-hardcoded-fallback',
    'liquid-hardcoded-handle',
    'dead-setting'
  ]) {
    check(`T3-A07: mock-theme-bad triggers rule ${expectedRule}`, badRuleSet.has(expectedRule));
  }
  const unstyledFinding = badThemeFindings.find((f) => f.rule === 'UNSTYLED_CLASS');
  check('T3-A07: UNSTYLED_CLASS is severity warn (not blocker)', unstyledFinding && unstyledFinding.severity === 'warn');

  const customElDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-custom-el-'));
  fs.mkdirSync(path.join(customElDir, 'layout'), { recursive: true });
  fs.mkdirSync(path.join(customElDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(customElDir, 'layout', 'theme.liquid'), [
    '<html><body>',
    '<cart-drawer class="drawer"><div class="drawer__panel">Cart</div></cart-drawer>',
    '<wish-manager></wish-manager>',
    '<promo-strip class="promo">Deal</promo-strip>',
    '</body></html>'
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(customElDir, 'assets', 'theme.css'),
    '.drawer { position: fixed; inset: 0; padding: 1rem; }\n.promo { margin: 1rem 0; border-top: 1px solid #000000; }\npromo-strip .promo__line { display: flex; }\n.promo.is-closed { display: none; }\n', 'utf8');
  const customElRules = haravanLint.runHaravanLint(customElDir)
    .filter((f) => f.rule === 'CUSTOM_ELEMENT_INLINE_ROOT')
    .map((f) => f.message);
  check('CUSTOM_ELEMENT_INLINE_ROOT skips position:fixed (blockified) and unstyled behavior-only elements',
    !customElRules.some((msg) => msg.includes('<cart-drawer>') || msg.includes('<wish-manager>')));
  check('CUSTOM_ELEMENT_INLINE_ROOT flags a box-styled custom element without display',
    customElRules.some((msg) => msg.includes('<promo-strip>')));
  try { fs.rmSync(customElDir, { recursive: true, force: true }); } catch {}

  const domWordsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'residue-domain-words-'));
  fs.mkdirSync(path.join(domWordsDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(domWordsDir, 'snippets'), { recursive: true });
  fs.writeFileSync(path.join(domWordsDir, 'config', 'settings_schema.json'), JSON.stringify([
    { name: 'Rượu vang', settings: [{ type: 'text', id: 'wine_note', label: 'Niên vụ sommelier', default: 'Château Margaux' }] }
  ]), 'utf8');
  fs.writeFileSync(path.join(domWordsDir, 'config', 'settings_data.json'), '{"current":{"wine_note":"R\\u01B0\\u1EE3u vang \\u0111\\u1ECF"}}', 'utf8');
  fs.writeFileSync(path.join(domWordsDir, 'snippets', 'head-script.liquid'), '<script>window.themeConfig = { category: "sommelier" };</script>', 'utf8');
  const domFindings = residueScan.scanDomainWordsInRoot(domWordsDir, ['sommelier', 'rượu vang']);
  check('T3-A07: residue_scan --domain-words catches donor vocabulary in schema, unicode-escaped settings_data, and window.themeConfig',
    domFindings.some((f) => f.includes('settings_schema.json'))
    && domFindings.some((f) => f.includes('settings_data.json'))
    && domFindings.some((f) => f.includes('window.themeConfig')));
  try { fs.rmSync(domWordsDir, { recursive: true, force: true }); } catch {}

  // ==========================================
  // 19. T3-A08: stitch_consume multi-screen & no truncation
  // ==========================================
  console.log('\n## 19. T3-A08 stitch_consume multi-screen & no truncation');
  const stitchConsume = require('../stitch_consume');
  const multiInDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-multi-in-'));
  const multiOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-multi-out-'));
  fs.mkdirSync(path.join(multiInDir, '01a-home-top'), { recursive: true });
  fs.mkdirSync(path.join(multiInDir, '01b-pdp-main'), { recursive: true });
  const manyHeadings = Array.from({ length: 15 }, (_, idx) => `<h2>Heading Section ${idx + 1}</h2>`).join('\n');
  const manyParas = Array.from({ length: 45 }, (_, idx) => `<p>Paragraph copy block number ${idx + 1} with unique text.</p>`).join('\n');
  fs.writeFileSync(path.join(multiInDir, '01a-home-top', 'design.html'), `<html><style>.a{color:#112233}</style><body>${manyHeadings}${manyParas}</body></html>`, 'utf8');
  fs.writeFileSync(path.join(multiInDir, '01b-pdp-main', 'design.html'), `<html><style>.b{color:#445566}</style><body><section id="pdp-hero"><h1>PDP Title</h1></section></body></html>`, 'utf8');
  const consumeRes = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'stitch_consume.js'),
    '--in', multiInDir,
    '--out', multiOutDir
  ], { encoding: 'utf8' });
  check('T3-A08: stitch_consume multi-screen exits 0 and writes stitch-index.json',
    consumeRes.status === 0 && fs.existsSync(path.join(multiOutDir, 'stitch-index.json')));
  const stitchIndex = JSON.parse(fs.readFileSync(path.join(multiOutDir, 'stitch-index.json'), 'utf8'));
  const screen1Fidelity = JSON.parse(fs.readFileSync(path.join(multiOutDir, 'screens', '01a-home-top', 'stitch-fidelity.json'), 'utf8'));
  check('T3-A08: stitch_consume indexes all screen subdirectories',
    stitchIndex.screenCount === 2 && fs.existsSync(path.join(multiOutDir, 'screens', '01b-pdp-main', 'cleaned.html')));
  check('T3-A08: stitch_consume does not truncate >12 sections or >40 copyBlocks',
    screen1Fidelity.sections.length === 15 && screen1Fidelity.copyBlocks.length === 60);
  try {
    fs.rmSync(multiInDir, { recursive: true, force: true });
    fs.rmSync(multiOutDir, { recursive: true, force: true });
  } catch {}
  // ==========================================
  // 20. Fail-closed HARAVAN_SETTINGS_AUDIT tests (missing script & non-JSON stub)
  // ==========================================
  console.log('\n## 20. Fail-closed HARAVAN_SETTINGS_AUDIT');
  const fcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fail-closed-audit-'));
  fs.mkdirSync(path.join(fcDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(fcDir, 'layout'), { recursive: true });
  fs.writeFileSync(path.join(fcDir, 'config', 'settings_schema.json'), JSON.stringify([
    { name: '1. Đầu trang', settings: [{ type: 'text', id: 'tw_title', label: 'Tiêu đề', default: 'OK' }] }
  ]), 'utf8');
  fs.writeFileSync(path.join(fcDir, 'config', 'settings_data.json'), '{"current":{"tw_title":"OK"}}', 'utf8');
  fs.writeFileSync(path.join(fcDir, 'layout', 'theme.liquid'), '<h1 setting-id="tw_title" setting-type="text">{{ settings.tw_title }}</h1>', 'utf8');
  const fcManifest = path.join(fcDir, 'manifest.json');
  fs.writeFileSync(fcManifest, JSON.stringify({
    patches: [{ layer: 'slice:S1', data_set: { tw_title: 'Updated' } }]
  }), 'utf8');
  const nonJsonStub = path.join(fcDir, 'bad-audit-stub.js');
  fs.writeFileSync(nonJsonStub, 'console.log("NOT_VALID_JSON"); console.error("STUB_STDERR_MSG"); process.exit(0);\n', 'utf8');
  const missingScriptPath = path.join(fcDir, 'does-not-exist-audit.mjs');

  const lintMissingRes = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'haravan_lint.js'),
    '--root', fcDir
  ], {
    encoding: 'utf8',
    env: { ...process.env, HARAVAN_SETTINGS_AUDIT: missingScriptPath }
  });
  check('Fail-closed: haravan_lint exits non-zero when HARAVAN_SETTINGS_AUDIT points to missing script',
    lintMissingRes.status !== 0 && /HARAVAN_SETTINGS_AUDIT/.test(lintMissingRes.stderr));

  const lintNonJsonRes = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'haravan_lint.js'),
    '--root', fcDir
  ], {
    encoding: 'utf8',
    env: { ...process.env, HARAVAN_SETTINGS_AUDIT: nonJsonStub }
  });
  check('Fail-closed: haravan_lint exits non-zero when HARAVAN_SETTINGS_AUDIT outputs non-JSON',
    lintNonJsonRes.status !== 0 && /unparsable JSON/.test(lintNonJsonRes.stderr));

  const mergeMissingRes = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'settings_merge.js'),
    '--root', fcDir,
    '--manifest', fcManifest,
    '--dry-run'
  ], {
    encoding: 'utf8',
    env: { ...process.env, HARAVAN_SETTINGS_AUDIT: missingScriptPath }
  });
  check('Fail-closed: settings_merge exits non-zero when HARAVAN_SETTINGS_AUDIT points to missing script',
    mergeMissingRes.status !== 0 && /HARAVAN_SETTINGS_AUDIT/.test(mergeMissingRes.stderr));

  const mergeNonJsonRes = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'settings_merge.js'),
    '--root', fcDir,
    '--manifest', fcManifest,
    '--dry-run'
  ], {
    encoding: 'utf8',
    env: { ...process.env, HARAVAN_SETTINGS_AUDIT: nonJsonStub }
  });
  check('Fail-closed: settings_merge exits non-zero when HARAVAN_SETTINGS_AUDIT outputs non-JSON',
    mergeNonJsonRes.status !== 0 && /unparsable JSON/.test(mergeNonJsonRes.stderr));

  try { fs.rmSync(fcDir, { recursive: true, force: true }); } catch {}

  console.log('\n==========================================');
  console.log(`${passed} passed, ${failed} failed`);
  console.log('==========================================');
  if (failed > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

runNewSections();
