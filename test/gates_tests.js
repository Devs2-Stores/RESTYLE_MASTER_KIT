'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createZip } = require('../lib/zip');
const remake = require('../lib/remake-contract');
const { renderLiquidStub } = require('../asset_syntax_check');
const { runAssertions } = require('../skills_routes_lint');

const KIT_ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'gates');
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-gates-'));
const HOME_DIR = os.homedir();
let passed = 0;
let failed = 0;
let skipped = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`PASS ${label}`);
    passed += 1;
  } else {
    console.error(`FAIL ${label}${detail ? ` (${detail})` : ''}`);
    failed += 1;
  }
}

function skip(label, reason) {
  console.log(`SKIP ${label} (${reason})`);
  skipped += 1;
}

function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function writeJson(file, value) {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runKit(script, args) {
  const nodeBin = /^node(?:\.exe)?$/i.test(path.basename(process.execPath || '')) ? process.execPath : 'node';
  const res = spawnSync(nodeBin, [path.join(KIT_ROOT, script), ...args], { encoding: 'utf8', timeout: 120000 });
  return { status: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

function makeTheme(root) {
  writeText(path.join(root, 'layout', 'theme.liquid'), '<!doctype html><html><head></head><body>{{ content_for_layout }}</body></html>\n');
  writeText(path.join(root, 'config', 'settings_schema.json'), '[]\n');
  writeText(path.join(root, 'templates', 'index.liquid'), '<main>Trang chủ</main>\n');
  writeText(path.join(root, 'assets', 'theme.css'), ':root { --t-color-price: #C8102E; }\n@media (max-width: 767px) { html { font-size: 14px; } }\n');
}

const HOME_ORDER = ['hero', 'trust', 'featured-products', 'categories', 'spotlight', 'brands', 'blog', 'newsletter'];

function designDefaults(overrides = {}) {
  return {
    canvasColor: '#FFFFFF',
    mobileRootFontPx: 14,
    priceColor: '#C8102E',
    sectionSpace: '3rem',
    gutterToken: '--t-gutter',
    homeSectionOrder: HOME_ORDER,
    typeScale: { minTextPx: 12 },
    spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
    radius: { sm: '4px', md: '8px', lg: '16px' },
    controlHeight: { mobile: 36, desktop: 40 },
    iconStroke: 1.5,
    cardDensity: 'comfortable',
    homeSectionBudget: { min: 6, max: 10 },
    ...overrides
  };
}

function addReferences(root, count = 2) {
  for (let i = 0; i < count; i += 1) writeJson(path.join(root, 'deliverables', 'reference', `ref-${i}.json`), { sections: [] });
}

function freshTheme(name) {
  const root = path.join(TMP_ROOT, name);
  makeTheme(root);
  return root;
}

function findings(root, dd, options = {}) {
  return remake.validateDesignDefaults(root, { version: 1, designDefaults: dd }, options);
}

function has(list, code) {
  return list.some((finding) => finding.startsWith(code));
}

function contractOf(dd) {
  return {
    version: 1,
    preview: { status: 'pending', baseUrl: 'https://example.myharavan.com' },
    designDefaults: dd,
    qaGate: { widths: [375], coverageFloor: 1 },
    screens: [{ name: 'home', path: '/', status: 'implemented-static', landmarks: [{ name: 'hero', source: 'approved-design:hero', target: 'templates/index.liquid', status: 'pending' }], evidence: { desktop: '', mobile: '' } }],
    features: []
  };
}

function section(index, selector, heading, y, group = 'main-content') {
  return { index, tag: 'section', selector, y, height: 600, group, heading };
}

// 1. Design gate tokens, home budget, references
console.log('## 1. Design gate');
{
  const root = freshTheme('design-gate');
  addReferences(root);
  check('design gate: a complete token set, 8 home sections and 2 references is clear', findings(root, designDefaults()).length === 0, findings(root, designDefaults()).join(' | '));

  const tooMany = findings(root, designDefaults({ homeSectionOrder: Array.from({ length: 14 }, (_, i) => `section-${i}`) }));
  check('design gate: a 14-section home order reports HOME_SECTION_BUDGET', has(tooMany, 'HOME_SECTION_BUDGET') && /14 section/.test(tooMany.join('\n')) && /6-10/.test(tooMany.join('\n')));
  const tenPlusFooter = [...Array.from({ length: 10 }, (_, i) => `section-${i}`), 'footer'];
  check('design gate: the footer is not counted against the 6-10 budget', findings(root, designDefaults({ homeSectionOrder: tenPlusFooter })).length === 0, findings(root, designDefaults({ homeSectionOrder: tenPlusFooter })).join(' | '));
  const tooFew = findings(root, designDefaults({ homeSectionOrder: ['hero', 'blog', 'newsletter'] }));
  check('design gate: a 3-section order under the gate reports HOME_SECTION_BUDGET', has(tooFew, 'HOME_SECTION_BUDGET'));
  const narrowed = findings(root, designDefaults({ homeSectionBudget: { min: 7, max: 9 }, homeSectionOrder: Array.from({ length: 10 }, (_, i) => `s${i}`) }));
  check('design gate: a contract budget may narrow the registry budget', has(narrowed, 'HOME_SECTION_BUDGET') && /7-9/.test(narrowed.join('\n')));
  const widened = findings(root, designDefaults({ homeSectionBudget: { min: 2, max: 14 } }));
  check('design gate: a contract budget cannot widen the registry budget', has(widened, 'DESIGN_TOKEN_INVALID') && /outside the registry budget 6-10/.test(widened.join('\n')));

  const legacyRoot = freshTheme('design-gate-legacy');
  const legacy = { canvasColor: '#FFFFFF', mobileRootFontPx: 14, priceColor: '#C8102E', sectionSpace: '3rem', gutterToken: '--t-gutter', homeSectionOrder: ['hero'], typeScale: { minTextPx: 12 } };
  check('design gate: a legacy contract without gate tokens is not forced into the gate', findings(legacyRoot, legacy).length === 0, findings(legacyRoot, legacy).join(' | '));
  check('design gate: the same legacy contract fails when the gate is requested', has(findings(legacyRoot, legacy, { designGate: true }), 'DESIGN_TOKEN_MISSING') && has(findings(legacyRoot, legacy, { designGate: true }), 'DESIGN_GATE_MISSING'));
  check('design gate: a legacy contract over the budget still fails without the gate', has(findings(legacyRoot, { ...legacy, homeSectionOrder: Array.from({ length: 12 }, (_, i) => `s${i}`) }), 'HOME_SECTION_BUDGET'));

  const noRefs = freshTheme('design-gate-no-refs');
  const missingRefs = findings(noRefs, designDefaults());
  check('design gate: no deliverables/reference directory reports DESIGN_GATE_MISSING', has(missingRefs, 'DESIGN_GATE_MISSING') && /found|has 0/.test(missingRefs.join('\n')));
  const oneRef = freshTheme('design-gate-one-ref');
  addReferences(oneRef, 1);
  check('design gate: a single reference capture is not enough', has(findings(oneRef, designDefaults()), 'DESIGN_GATE_MISSING'));
  const badRef = freshTheme('design-gate-bad-ref');
  addReferences(badRef, 2);
  writeText(path.join(badRef, 'deliverables', 'reference', 'broken.json'), '{ not json');
  check('design gate: an unparseable reference capture is reported', has(findings(badRef, designDefaults()), 'DESIGN_GATE_REFERENCE_INVALID'));

  for (const key of ['typeScale', ...remake.DESIGN_TOKEN_KEYS]) {
    const dd = designDefaults();
    delete dd[key];
    // Removing a token from a contract that still carries other tokens must be caught.
    check(`design gate: missing designDefaults.${key} reports DESIGN_TOKEN_MISSING`, findings(root, dd).some((f) => f === `DESIGN_TOKEN_MISSING designDefaults.${key}`));
  }
  const bad = [
    ['spacingScale', [8, 4, 12, 16], /strictly ascending/],
    ['spacingScale', [4, 8], /at least 4/],
    ['radius', {}, /named radii/],
    ['controlHeight', { mobile: 0, desktop: 40 }, /positive px number/],
    ['controlHeight', 'tall', /positive px number/],
    ['iconStroke', 9, /\(0, 4\]/],
    ['cardDensity', 'huge', /compact, comfortable, spacious/]
  ];
  for (const [key, value, why] of bad) {
    const result = findings(root, designDefaults({ [key]: value }));
    check(`design gate: designDefaults.${key}=${JSON.stringify(value)} is DESIGN_TOKEN_INVALID`, result.some((f) => f.startsWith(`DESIGN_TOKEN_INVALID designDefaults.${key}=`) && why.test(f)), result.join(' | '));
  }
  check('design gate: a compact touch control height below 44px is valid', findings(root, designDefaults({ controlHeight: 32 })).length === 0);
}

// 2. Template
console.log('\n## 2. Contract template');
{
  const template = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'FULL_REMAKE_CONTRACT.template.json'), 'utf8'));
  const tokens = remake.validateDesignTokens(template.designDefaults, true);
  check('template: carries every design token key and each passes validation', remake.DESIGN_TOKEN_KEYS.every((key) => template.designDefaults[key] !== undefined) && tokens.length === 0, tokens.join(' | '));
  check('template: homeSectionBudget equals the registry budget', JSON.stringify(template.designDefaults.homeSectionBudget) === JSON.stringify(remake.loadHomeStructure().budget));
  const root = freshTheme('template-root');
  const result = findings(root, template.designDefaults);
  check('template: an unlocked (empty) homeSectionOrder fails the gate until Phase 0 fills it', has(result, 'HOME_SECTION_BUDGET') && has(result, 'DESIGN_GATE_MISSING'));
}

// 3. Home capture order
console.log('\n## 3. Live home order');
{
  const structure = remake.loadHomeStructure();
  const inventory = {
    scrollHeight: 6000,
    viewportHeight: 900,
    sections: [
      { index: 0, tag: 'header', selector: 'header.site', y: 0, height: 80, group: 'header-group' },
      section(1, '#shopify-section-hero', 'Bộ sưu tập mới', 80),
      section(2, '#shopify-section-featured-products', 'Sản phẩm nổi bật', 700),
      section(3, 'section.home-blog', 'Tin tức', 1500),
      { index: 4, tag: 'footer', selector: 'footer.site', y: 2200, height: 400, group: 'footer-group', heading: 'Đăng ký nhận tin' }
    ]
  };
  check('home order: hero, featured-products, blog in live order is clear', remake.compareHomeCapture(['hero', 'featured-products', 'blog'], inventory, structure).length === 0);
  const swapped = remake.compareHomeCapture(['blog', 'featured-products', 'hero'], inventory, structure);
  check('home order: a contract order the live page contradicts reports HOME_ORDER_MISMATCH', has(swapped, 'HOME_ORDER_MISMATCH') && /renders at position/.test(swapped.join('\n')), swapped.join(' | '));
  const missing = remake.compareHomeCapture(['hero', 'lookbook'], inventory, structure);
  check('home order: a declared section absent from the page reports HOME_ORDER_MISMATCH not found', missing.length === 1 && /"lookbook" not found/.test(missing[0]));
  check('home order: diacritic headings match their folded role keyword (đăng ký -> newsletter)', remake.compareHomeCapture(['blog', 'newsletter'], inventory, structure).length === 0);

  const root = freshTheme('home-capture');
  addReferences(root);
  const contractFile = path.join(root, 'deliverables', 'FULL_REMAKE_CONTRACT.json');
  writeJson(contractFile, contractOf(designDefaults({ homeSectionOrder: ['blog', 'featured-products', 'hero', 'brands', 'usp', 'testimonial'] })));
  const captureFile = path.join(TMP_ROOT, 'inventory.json');
  writeJson(captureFile, { inventory });
  const cli = runKit('remake_contract_audit.js', ['--root', root, '--contract', contractFile, '--home-capture', captureFile]);
  check('home order: remake_contract_audit --home-capture exits 1 and prints HOME_ORDER_MISMATCH', cli.status === 1 && /HOME_ORDER_MISMATCH/.test(cli.out), cli.out.slice(-400));
  const unreadable = runKit('remake_contract_audit.js', ['--root', root, '--contract', contractFile, '--home-capture', path.join(TMP_ROOT, 'absent.json')]);
  check('home order: an unreadable capture is a finding, never a silent pass', unreadable.status === 1 && /HOME_CAPTURE_UNREADABLE/.test(unreadable.out));

  const wide = path.join(root, 'deliverables', 'WIDE.json');
  writeJson(wide, contractOf(designDefaults({ homeSectionOrder: Array.from({ length: 14 }, (_, i) => `section-${i}`) })));
  const budgetCli = runKit('remake_contract_audit.js', ['--root', root, '--contract', wide]);
  check('design gate: remake_contract_audit on a 14-section contract exits 1 with HOME_SECTION_BUDGET', budgetCli.status === 1 && /HOME_SECTION_BUDGET/.test(budgetCli.out), budgetCli.out.slice(-300));

  const noRefs = freshTheme('design-gate-cli');
  const noRefsContract = path.join(noRefs, 'deliverables', 'FULL_REMAKE_CONTRACT.json');
  writeJson(noRefsContract, contractOf(designDefaults()));
  const refCli = runKit('remake_contract_audit.js', ['--root', noRefs, '--contract', noRefsContract]);
  check('design gate: remake_contract_audit without deliverables/reference exits 1 with DESIGN_GATE_MISSING', refCli.status === 1 && /DESIGN_GATE_MISSING/.test(refCli.out), refCli.out.slice(-300));
}

// 4. Home structure registry parity with the AntiFan probe defaults
console.log('\n## 4. Home structure registry');
{
  const structure = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'registry', 'home-structure.json'), 'utf8'));
  check('registry: home structure budget is 6-10', structure.budget.min === 6 && structure.budget.max === 10);
  check('registry: every role keyword key is a declared role', Object.keys(structure.roleKeywords).every((role) => structure.roles.includes(role)));
  const candidates = [
    path.resolve(KIT_ROOT, '..', '..', 'apps', 'AntiFan-toolchain-wt', 'src', 'main', 'qa', 'probes', 'home-structure-rules.ts'),
    path.resolve(KIT_ROOT, '..', '..', 'apps', 'AntiFan', 'src', 'main', 'qa', 'probes', 'home-structure-rules.ts')
  ];
  const source = candidates.find((file) => fs.existsSync(file));
  if (!source) {
    skip('registry: AntiFan home-structure-rules.ts mirrors the kit registry', `no AntiFan checkout beside the kit (${candidates.join(', ')})`);
  } else {
    const text = fs.readFileSync(source, 'utf8');
    const read = (key) => {
      const match = new RegExp(`\\b${key}:\\s*(\\d+)`).exec(text);
      return match ? Number(match[1]) : null;
    };
    check('registry: AntiFan minSections/maxSections equal the kit budget', read('minSections') === structure.budget.min && read('maxSections') === structure.budget.max);
    check('registry: AntiFan consecutive-banner, first-product-rail and page-height limits equal the kit rules',
      read('maxConsecutiveBanners') === structure.rules.maxConsecutiveBanners
      && read('firstProductRailWithinViewports') === structure.rules.firstProductRailWithinViewports
      && read('maxPageHeightViewports') === structure.rules.mobilePageHeightMaxViewports);
  }
}

// 5. Asset syntax gate
console.log('\n## 5. Asset syntax gate');
{
  const asset = (name, args = []) => runKit('asset_syntax_check.js', ['--root', path.join(FIXTURES, 'asset-syntax', name), ...args]);
  const clean = asset('clean');
  check('asset gate: clean .js and .js.liquid (first branch kept, comments and captures dropped) exit 0', clean.status === 0 && /Assets checked: 2/.test(clean.out), clean.out.slice(-300));
  const broken = asset('broken');
  check('asset gate: a .js.liquid that renders to invalid JavaScript exits 1 with file and line', broken.status === 1 && /assets\/product\.js\.liquid:4 SyntaxError/.test(broken.out), broken.out.slice(-300));
  const unbalanced = asset('unbalanced');
  check('asset gate: an unclosed {% if %} exits 1 pointing at the opening tag', unbalanced.status === 1 && /assets\/menu\.js\.liquid:2 Liquid structure: \{% if %\} is never closed/.test(unbalanced.out), unbalanced.out.slice(-300));
  const scss = asset('scss');
  let sassInstalled = true;
  try { require.resolve('sass', { paths: [KIT_ROOT, path.join(FIXTURES, 'asset-syntax', 'scss')] }); } catch (_) { sassInstalled = false; }
  check('asset gate: a .scss.liquid file reports UNMEASURED (exit 2) when sass is not installed, never a pass', sassInstalled ? scss.status === 0 : scss.status === 2 && /UNMEASURED assets\/theme\.scss\.liquid/.test(scss.out), scss.out.slice(-300));
  const only = asset('broken', ['--files', 'assets/product.js.liquid']);
  check('asset gate: --files limits the run to the named asset', only.status === 1 && /Assets checked: 1/.test(only.out));
  const missing = asset('clean', ['--files', 'assets/absent.js']);
  check('asset gate: a requested file that does not exist fails instead of being skipped', missing.status === 1 && /file not found/.test(missing.out));

  const stub = renderLiquidStub('a\n{% if x %}\nfirst\n{% elsif y %}\nsecond\n{% else %}\nthird\n{% endif %}\nb', 'js');
  check('asset gate: the stub keeps only the first conditional branch and preserves line numbers', /first/.test(stub.text) && !/second|third/.test(stub.text) && stub.text.split('\n').length === 9 && stub.problems.length === 0);
  const inString = renderLiquidStub('var a = "{{ shop.name }}"; var b = {{ settings.n }};', 'js').text;
  check('asset gate: output tags become text inside a string and a number in code', inString === 'var a = "x"; var b = 0;', inString);
  const mismatch = renderLiquidStub('{% if a %}{% endfor %}', 'js');
  check('asset gate: a mismatched end tag is a structural problem', mismatch.problems.some((p) => /does not match the open \{% if %\}/.test(p.message)));
}

// 6. Pre-showcase gate
console.log('\n## 6. Pre-showcase gate');

function gateRoot(name) {
  const root = freshTheme(name);
  writeJson(path.join(root, 'deliverables', 'FULL_REMAKE_CONTRACT.json'), contractOf(designDefaults()));
  return root;
}

function writeReceipt(root, name, overrides = {}, ageSeconds = -5) {
  const file = path.join(root, '.antifan', 'qa-receipts', name);
  writeJson(file, {
    receiptVersion: '1.3',
    workspaceRoot: root,
    observedUrl: 'https://shop.example.com/',
    viewport: { width: 375 },
    verdict: 'QA_PASSED',
    passed: true,
    execution: 'COMPLETED',
    errorCode: null,
    certification: 'CERTIFIED',
    ...overrides
  });
  const when = new Date(Date.now() - ageSeconds * 1000);
  fs.utimesSync(file, when, when);
}

function gate(root, only, extra = []) {
  return runKit('pre_showcase_gate.js', ['--root', root, ...(only ? ['--only', only] : []), ...extra]);
}

{
  const certified = gateRoot('gate-certified');
  writeReceipt(certified, 'r1.json');
  const ok = gate(certified, 'qa-gate');
  check('pre-showcase: a fresh CERTIFIED receipt covering every cell passes qa-gate (exit 0)', ok.status === 0 && /PASS qa-gate/.test(ok.out), ok.out.slice(-300));

  const structural = gateRoot('gate-structural');
  writeReceipt(structural, 'r1.json', { certification: 'STRUCTURAL' });
  const sOut = gate(structural, 'qa-gate');
  check('pre-showcase: a STRUCTURAL pass is not enough (exit 1, names the cell)', sOut.status === 1 && /FAIL qa-gate/.test(sOut.out) && /not CERTIFIED/.test(sOut.out) && /home@375/.test(sOut.out), sOut.out.slice(-300));

  const legacyReceipt = gateRoot('gate-no-certification');
  writeReceipt(legacyReceipt, 'r1.json', { certification: undefined });
  check('pre-showcase: a passing receipt without a certification field fails', gate(legacyReceipt, 'qa-gate').status === 1);

  const stale = gateRoot('gate-stale');
  writeReceipt(stale, 'r1.json', {}, 3600);
  const staleOut = gate(stale, 'qa-gate');
  check('pre-showcase: a receipt older than the newest theme file fails as stale', staleOut.status === 1 && /RECEIPT_STALE/.test(staleOut.out), staleOut.out.slice(-300));

  const otherRoot = gateRoot('gate-wrong-root');
  writeReceipt(otherRoot, 'r1.json', { workspaceRoot: path.join(TMP_ROOT, 'someone-else') });
  check('pre-showcase: a CERTIFIED receipt for another workspace root fails', gate(otherRoot, 'qa-gate').status === 1);

  const none = gateRoot('gate-no-receipts');
  const noneOut = gate(none, 'qa-gate');
  check('pre-showcase: no receipts is UNMEASURED (exit 2), never a pass', noneOut.status === 2 && /UNMEASURED qa-gate/.test(noneOut.out), noneOut.out.slice(-300));

  const claim = gateRoot('gate-failing-claim');
  writeReceipt(claim, 'r1.json');
  writeText(path.join(claim, 'snippets', 'usp.liquid'), '<p>Sản phẩm chính hãng 100% giao trong ngày</p>\n');
  const mixed = gate(claim, 'qa-gate,claim-scan');
  check('pre-showcase: one failing sub-check makes the gate exit non-zero while the passing one is still reported',
    mixed.status === 1 && /PASS qa-gate/.test(mixed.out) && /FAIL claim-scan/.test(mixed.out) && /FAIL: pre-showcase gate blocked/.test(mixed.out), mixed.out.slice(-400));
  const cleanClaim = gate(certified, 'claim-scan');
  check('pre-showcase: claim-scan passes on a clean theme', cleanClaim.status === 0 && /PASS claim-scan/.test(cleanClaim.out), cleanClaim.out.slice(-200));

  const residue = gate(certified, 'residue-scan');
  check('pre-showcase: residue-scan passes on a clean theme', residue.status === 0 && /PASS residue-scan/.test(residue.out), residue.out.slice(-300));
  const residueBrand = gateRoot('gate-residue');
  writeText(path.join(residueBrand, 'templates', 'index.liquid'), '<main>Welcome to Oldbrand Boutique</main>\n');
  const residueOut = gate(residueBrand, 'residue-scan', ['--brand', 'Oldbrand Boutique']);
  check('pre-showcase: leftover brand text fails residue-scan', residueOut.status === 1 && /FAIL residue-scan/.test(residueOut.out), residueOut.out.slice(-300));

  const out = path.join(certified, 'final-showcase');
  const manifest = path.join(out, 'CAPTURE_MANIFEST.json');
  writeJson(manifest, { templates: { home: { imageHealth: { total: 24, broken: [] } }, product: { imageHealth: { total: 12, broken: ['https://cdn.hstatic.net/files/x/missing.jpg'] } } } });
  const imgFail = gate(certified, 'image-health');
  check('pre-showcase: an image with naturalWidth 0 in the capture manifest fails image-health', imgFail.status === 1 && /missing\.jpg/.test(imgFail.out), imgFail.out.slice(-300));
  writeJson(manifest, { templates: { home: { imageHealth: { total: 24, broken: [] } } } });
  check('pre-showcase: a manifest with 0 broken images passes image-health', gate(certified, 'image-health').status === 0);
  writeJson(manifest, { templates: { home: { files: {} } } });
  const imgUnmeasured = gate(certified, 'image-health');
  check('pre-showcase: a manifest that never measured images is UNMEASURED (exit 2)', imgUnmeasured.status === 2 && /no imageHealth record/.test(imgUnmeasured.out));

  const desc = path.join(out, 'THEME_DESCRIPTION.html');
  writeText(desc, '<p>x &amp; y</p>');
  const descFail = gate(certified, 'description-check');
  check('pre-showcase: an invalid THEME_DESCRIPTION.html fails description-check', descFail.status === 1 && /FAIL description-check/.test(descFail.out), descFail.out.slice(-300));
  fs.rmSync(desc);
  check('pre-showcase: a missing THEME_DESCRIPTION.html is UNMEASURED', gate(certified, 'description-check').status === 2);

  const zipRoot = gateRoot('gate-zip');
  const zipPath = path.join(zipRoot, 'final-showcase', 'theme.zip');
  const entryOf = (name) => ({ name, data: fs.readFileSync(path.join(zipRoot, ...name.split('/'))) });
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  createZip(['layout/theme.liquid', 'templates/index.liquid', 'assets/theme.css', 'config/settings_schema.json'].map(entryOf), zipPath);
  const zipOk = gate(zipRoot, 'zip-freshness');
  check('pre-showcase: a zip identical to the theme on disk passes zip-freshness', zipOk.status === 0 && /4 theme file/.test(zipOk.out), zipOk.out.slice(-300));
  writeText(path.join(zipRoot, 'templates', 'index.liquid'), '<main>Đã sửa sau khi đóng gói</main>\n');
  const zipStale = gate(zipRoot, 'zip-freshness');
  check('pre-showcase: a theme file edited after the zip was built fails zip-freshness', zipStale.status === 1 && /templates\/index\.liquid/.test(zipStale.out), zipStale.out.slice(-300));
  check('pre-showcase: no export zip is UNMEASURED', gate(certified, 'zip-freshness').status === 2);

  const unready = gate(certified, 'readiness');
  check('pre-showcase: readiness without --config/--base/--theme-id is UNMEASURED and says what is missing', unready.status === 2 && /missing --config, --base, --theme-id/.test(unready.out), unready.out.slice(-300));
  const kit = path.join(TMP_ROOT, 'demo-kit');
  const cfg = path.join(TMP_ROOT, 'demo.json');
  writeJson(cfg, {});
  const readinessArgs = ['--config', cfg, '--base', 'https://shop.example.com', '--theme-id', '1', '--demo-kit', kit];
  check('pre-showcase: a missing HaravanDemoKit CLI is UNMEASURED', gate(certified, 'readiness', readinessArgs).status === 2);
  writeText(path.join(kit, 'src', 'cli.js'), 'process.exit(Number(require("fs").readFileSync(require("path").join(__dirname, "exit-code.txt"), "utf8")));\n');
  const exitWith = (code) => writeText(path.join(kit, 'src', 'exit-code.txt'), String(code));
  exitWith(0);
  check('pre-showcase: readiness exit 0 passes', gate(certified, 'readiness', readinessArgs).status === 0);
  exitWith(1);
  check('pre-showcase: readiness exit 1 fails', gate(certified, 'readiness', readinessArgs).status === 1);
  exitWith(2);
  check('pre-showcase: readiness exit 2 (token or endpoint absent) is UNMEASURED, not a pass', gate(certified, 'readiness', readinessArgs).status === 2);

  const navKit = path.join(TMP_ROOT, 'demo-kit-nav');
  const navCfg = path.join(TMP_ROOT, 'demo-nav.json');
  const navArgsFile = path.join(navKit, 'src', 'argv.json');
  writeJson(navCfg, { project_key: 'proj-x' });
  writeText(path.join(navKit, 'src', 'cli.js'), 'require("fs").writeFileSync(require("path").join(__dirname, "argv.json"), JSON.stringify(process.argv.slice(2)));\n');
  const navReadinessArgs = ['--config', navCfg, '--base', 'https://shop.example.com', '--theme-id', '1', '--demo-kit', navKit];
  const recordedArgs = () => JSON.parse(fs.readFileSync(navArgsFile, 'utf8'));
  gate(certified, 'readiness', navReadinessArgs);
  check('pre-showcase: readiness runs without --navigations when none is given and no project output exists', !recordedArgs().includes('--navigations'));
  const autoNav = path.join(navKit, 'output', 'proj-x', 'navigations.json');
  writeJson(autoNav, {});
  const autoRun = gate(certified, 'readiness', navReadinessArgs);
  const autoArgs = recordedArgs();
  check('pre-showcase: <demo-kit>/output/<project_key>/navigations.json is auto-forwarded to readiness', autoRun.status === 0 && autoArgs[autoArgs.indexOf('--navigations') + 1] === autoNav, JSON.stringify(autoArgs));
  const explicitNav = path.join(TMP_ROOT, 'explicit-navigations.json');
  writeJson(explicitNav, {});
  gate(certified, 'readiness', [...navReadinessArgs, '--navigations', explicitNav]);
  const explicitArgs = recordedArgs();
  check('pre-showcase: an explicit --navigations wins over the auto-detected file', explicitArgs.filter((a) => a === '--navigations').length === 1 && explicitArgs[explicitArgs.indexOf('--navigations') + 1] === explicitNav, JSON.stringify(explicitArgs));
  const { resolveNavigations } = require('../pre_showcase_gate');
  writeJson(navCfg, {});
  check('pre-showcase: a config without project_key resolves no navigations file', resolveNavigations({ config: navCfg, navigations: null }, navKit) === null);
  check('pre-showcase: an unreadable config resolves no navigations file', resolveNavigations({ config: path.join(TMP_ROOT, 'absent.json'), navigations: null }, navKit) === null);
  fs.rmSync(navArgsFile);
  runKit('workflow_final_guard.js', ['--root', certified, '--require-pre-showcase', ...navReadinessArgs, '--navigations', explicitNav]);
  const guardArgs = fs.existsSync(navArgsFile) ? recordedArgs() : [];
  check('guard: --navigations is passed through to the pre-showcase readiness run', guardArgs[guardArgs.indexOf('--navigations') + 1] === explicitNav, JSON.stringify(guardArgs));
  check('guard: usage documents --navigations', /--navigations/.test(runKit('workflow_final_guard.js', ['--help']).out));

  const receiptAuditLib = require('../lib/receipt-audit');
  const hostedContract = contractOf(designDefaults());
  hostedContract.screens.push({ name: 'account', path: '/account/login', status: 'verified-static-hosted-auth', landmarks: [], evidence: { desktop: '', mobile: '' } });
  const hostedCells = receiptAuditLib.expectedCells(hostedContract, [375, 1024]);
  check('receipt-audit: a verified-static-hosted-auth screen yields no expected cell and is listed in skippedHostedAuth', hostedCells.cells.length === 2 && hostedCells.cells.every((c) => c.screen === 'home') && JSON.stringify(hostedCells.skippedHostedAuth) === '["account"]' && hostedCells.missingPath.length === 0, JSON.stringify(hostedCells));
  const plainCells = receiptAuditLib.expectedCells({ screens: [{ name: 'account', path: '/account/login', status: 'verified-static' }] }, [375]);
  check('receipt-audit: the same screen with any other status still expects its cells', plainCells.cells.length === 1 && plainCells.skippedHostedAuth.length === 0);
  const hosted = gateRoot('gate-hosted-auth');
  writeJson(path.join(hosted, 'deliverables', 'FULL_REMAKE_CONTRACT.json'), hostedContract);
  writeReceipt(hosted, 'r1.json');
  const hostedOut = gate(hosted, 'qa-gate');
  check('pre-showcase: a hosted-auth screen is not expected by qa-gate and is noted in the detail', hostedOut.status === 0 && /PASS qa-gate/.test(hostedOut.out) && /1\/1 cells/.test(hostedOut.out) && /hosted auth off-theme: account/.test(hostedOut.out), hostedOut.out.slice(-300));
  const notHosted = gateRoot('gate-hosted-auth-control');
  const controlContract = contractOf(designDefaults());
  controlContract.screens.push({ name: 'account', path: '/account/login', status: 'implemented-static', landmarks: [], evidence: { desktop: '', mobile: '' } });
  writeJson(path.join(notHosted, 'deliverables', 'FULL_REMAKE_CONTRACT.json'), controlContract);
  writeReceipt(notHosted, 'r1.json');
  const notHostedOut = gate(notHosted, 'qa-gate');
  check('pre-showcase: without the hosted-auth status the account screen is still an expected cell and blocks coverage', notHostedOut.status === 1 && /COVERAGE_BELOW_FLOOR/.test(notHostedOut.out) && /account@375/.test(notHostedOut.out), notHostedOut.out.slice(-300));

  const full = gate(certified, null);
  check('pre-showcase: the unscoped gate on a theme with no showcase output is not clear (exit non-zero)', full.status !== 0 && /UNMEASURED/.test(full.out) && !/Not run/.test(full.out), full.out.slice(-300));
  const scoped = gate(certified, 'claim-scan');
  check('pre-showcase: --only names the checks that were not run', /Not run \(--only\): readiness, qa-gate/.test(scoped.out));
  const bad = runKit('pre_showcase_gate.js', ['--root', certified, '--only', 'nonsense']);
  check('pre-showcase: an unknown check name is a usage error (exit 3)', bad.status === 3);
}

// 7. workflow_final_guard wiring
console.log('\n## 7. Final guard wiring');
{
  const root = gateRoot('guard-wiring');
  const withGate = runKit('workflow_final_guard.js', ['--root', root, '--require-pre-showcase']);
  check('guard: --require-pre-showcase blocks the handoff and reports each sub-check', withGate.status === 1 && /pre-showcase qa-gate \[UNMEASURED\]/.test(withGate.out) && /pre-showcase readiness \[UNMEASURED\]/.test(withGate.out), withGate.out.slice(-500));
  const without = runKit('workflow_final_guard.js', ['--root', root]);
  check('guard: without the flag the pre-showcase gate does not run', without.status === 1 && !/pre-showcase/.test(without.out), without.out.slice(-300));
  check('guard: a contract that carries design tokens reports DESIGN_GATE_MISSING through the guard', /DESIGN_GATE_MISSING/.test(without.out), without.out.slice(-300));
  const usage = runKit('workflow_final_guard.js', ['--help']);
  check('guard: usage documents --require-pre-showcase, --require-design-gate and --allow-structural-qa', /--require-pre-showcase/.test(usage.out) && /--require-design-gate/.test(usage.out) && /--allow-structural-qa/.test(usage.out));

  const zlib = require('zlib');
  const pngChunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const writeFastPng = (file, width, height) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    writeText(file, '');
    fs.writeFileSync(file, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.alloc(1))), pngChunk('IEND', Buffer.alloc(0))]));
  };
  const makeGuardLedgerFixture = (name, ledgerMd) => {
    const dir = freshTheme(name);
    const showcase = path.join(dir, 'final-showcase');
    writeFastPng(path.join(showcase, 'Trang chủ.png'), 876, 2000);
    writeFastPng(path.join(showcase, 'Trang chủ-mobile.png'), 276, 480);
    writeFastPng(path.join(showcase, 'Trang chủ-fullpage.png'), 1200, 2400);
    writeFastPng(path.join(showcase, 'Trang chủ-mobile-fullpage.png'), 375, 1400);
    writeText(path.join(showcase, 'THEME_DESCRIPTION.html'), '<h1>Sky Fashion Theme</h1><p>Mô tả storefront bán hàng theo đúng định hướng thương hiệu, nhấn vào lợi ích, niềm tin và bố cục đã được thiết kế chuẩn mực cho cửa hàng thời trang.</p><ul><li>Bố cục trung thành với bản thiết kế</li><li>Tương thích chuẩn Haravan</li></ul><p>Phần mô tả bổ sung đảm bảo vượt ngưỡng độ dài tối thiểu hai trăm ký tự của bộ kiểm định.</p>');
    writeText(path.join(dir, 'deliverables', 'RESTYLE_PROGRESS_LEDGER.md'), ledgerMd);
    return dir;
  };

  const structuralLedgerRoot = makeGuardLedgerFixture('guard-structural-ledger', [
    '# Restyle Progress Ledger',
    '',
    '| Gate | Status | Evidence |',
    '|---|---|---|',
    '| Desktop/mobile preview | structural (QA-debt) | deliverables/qa-receipts.json |',
    '| Final approval | passed | deliverables/APPROVAL.json |',
    '',
    '| Page | Viewport | Tool | Screenshot | Console | Network | Overflow | Contrast | Spacing/font | Status |',
    '|---|---:|---|---|---|---|---|---|---|---|',
    '| 10 routes | 375/1440 | theme.qa_validate | *.png | receipt | receipt | receipt | receipt | receipt | structural (QA-debt) |',
    ''
  ].join('\n'));
  const structuralFail = runKit('workflow_final_guard.js', ['--root', structuralLedgerRoot]);
  check('guard: ledger with a structural (QA-debt) status row fails even when Final approval is passed',
    structuralFail.status === 1
      && /QA not certified in deliverables\/RESTYLE_PROGRESS_LEDGER\.md: row "Desktop\/mobile preview" is structural \(QA-debt\)/.test(structuralFail.out)
      && /row "10 routes" is structural \(QA-debt\)/.test(structuralFail.out)
      && /--allow-structural-qa "<reason>"/.test(structuralFail.out),
    structuralFail.out.slice(-500));

  const structuralWaived = runKit('workflow_final_guard.js', ['--root', structuralLedgerRoot, '--allow-structural-qa', 'user accepted 2026-10-17']);
  check('guard: --allow-structural-qa downgrades structural QA rows to a warning that includes the reason',
    structuralWaived.status === 0
      && /WARNING:/.test(structuralWaived.out)
      && /user accepted 2026-10-17/.test(structuralWaived.out)
      && /PASS: final gate clear/.test(structuralWaived.out),
    structuralWaived.out.slice(-500));

  const structuralEmptyReason = runKit('workflow_final_guard.js', ['--root', structuralLedgerRoot, '--allow-structural-qa', '   ']);
  check('guard: --allow-structural-qa with an empty reason is rejected as a usage error',
    structuralEmptyReason.status !== 0 && /Missing value for --allow-structural-qa/.test(structuralEmptyReason.out),
    structuralEmptyReason.out.slice(-300));

  const proseOnlyRoot = makeGuardLedgerFixture('guard-structural-prose', [
    '# Restyle Progress Ledger',
    '',
    '| Gate | Status | Evidence |',
    '|---|---|---|',
    '| Desktop/mobile preview | passed | deliverables/qa.json (structural check and visual baseline CERTIFIED) |',
    '| Final approval | passed | deliverables/APPROVAL.json |',
    '',
    '| ID | Source | Page/Area | Issue | Severity | Status | Notes |',
    '|---|---|---|---|---|---|---|',
    '| 1 | QA | home | layout | low | passed | structural CSS grid note |',
    '',
    '## Final Notes',
    '- Remaining risk: structural markup cleanup completed.',
    ''
  ].join('\n'));
  const proseOnlyPass = runKit('workflow_final_guard.js', ['--root', proseOnlyRoot]);
  check('guard: a ledger mentioning structural only outside status cells passes without error or QA warning',
    proseOnlyPass.status === 0 && /PASS: final gate clear/.test(proseOnlyPass.out) && !/QA not certified/.test(proseOnlyPass.out),
    proseOnlyPass.out.slice(-400));
}

// 8. Guidance assertions
console.log('\n## 8. Guidance assertions');
{
  const registryFile = path.join(KIT_ROOT, 'registry', 'guidance-assertions.json');
  const entries = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  const gateIds = ['stitch-overnight-envelope', 'stitch-skill-envelope-deny-list', 'stitch-checkpoint-envelope', 'stitch-master-prompt-gates', 'stitch-phase-guide-gates', 'stitch-no-removed-image-providers', 'final-showcase-pre-showcase-gate'];
  check('assertions: every gate assertion is registered', gateIds.every((id) => entries.some((entry) => entry.id === id)));
  const live = runAssertions(registryFile);
  const mine = live.results.filter((r) => gateIds.includes(r.label));
  const failing = mine.filter((r) => !r.ok);
  check('assertions: the envelope, design gate, slice receipt and pre-showcase text is present in the skill and prompt files', !live.error && mine.length > 0 && failing.length === 0, failing.slice(0, 4).map((r) => `${r.label}: ${r.kind} ${r.phrase} ${r.detail}`).join(' | ') || live.error);

  const envelope = entries.find((entry) => entry.id === 'stitch-overnight-envelope');
  const sample = (allow, deny) => `Overnight\n  - ${allow}\n  - ${deny}\nreport: commands ran / commands not run\n`;
  const goodAllow = 'Allowed in overnight, all local: home contract entry to approved-final, a local ZIP export, and showcase capture.';
  const goodDeny = 'Denied, never run: Partners Create/Update, the `haravan`/`hrv` CLI (haravan/hrv CLI exports too), theme push, and any write to config/settings_data.json.';
  const evaluate = (text) => {
    const file = path.join(TMP_ROOT, 'envelope-sample.md');
    const assertions = path.join(TMP_ROOT, 'envelope-assertions.json');
    writeText(file, text);
    writeJson(assertions, [{ ...envelope, id: 'sample', file }]);
    const result = runAssertions(assertions);
    return !result.error && result.results.length > 0 && result.results.every((r) => r.ok);
  };
  check('assertions: the deny/allow envelope in the packet passes', evaluate(sample(goodAllow, goodDeny)));
  check('assertions: an allow list that grants Partners Create/Update fails', !evaluate(sample(`${goodAllow.replace('.', '')}, Partners Create/Update.`, goodDeny)));
  check('assertions: an allow list that grants theme push fails', !evaluate(sample(`${goodAllow.replace('.', '')} and theme push.`, goodDeny)));
  check('assertions: an allow list that grants the hrv CLI fails', !evaluate(sample(`${goodAllow.replace('.', '')} and the hrv CLI.`, goodDeny)));
  check('assertions: a deny list missing theme push fails', !evaluate(sample(goodAllow, goodDeny.replace('theme push, ', ''))));
  check('assertions: a deny list missing the settings_data.json write ban fails', !evaluate(sample(goodAllow, 'Denied, never run: Partners Create/Update, the `haravan`/`hrv` CLI (haravan/hrv CLI exports too), theme push.')));
  check('assertions: an envelope without the commands ran / commands not run report fails', !evaluate(sample(goodAllow, goodDeny).replace('commands ran / commands not run', 'nothing')));

  const promptCopy = path.join(HOME_DIR, '.claude', 'skills', 'haravan-stitch-full-run', 'references', 'new-theme-master-prompt.md');
  if (!fs.existsSync(promptCopy)) skip('assertions: kit master prompt equals the skill reference copy', `${promptCopy} not present`);
  else check('assertions: kit master prompt is byte-identical to the skill reference copy', fs.readFileSync(path.join(KIT_ROOT, 'NEW_THEME_MASTER_PROMPT.md')).equals(fs.readFileSync(promptCopy)));
}

console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
process.exitCode = failed > 0 ? 1 : 0;
