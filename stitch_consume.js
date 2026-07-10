#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function readValue(argv, i, flag) {
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parseArgs(argv) {
  const args = { in: '', out: '', help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--in') { args.in = path.resolve(readValue(argv, i, '--in')); i += 1; }
    else if (v === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node stitch_consume.js --in <stitch-html-or-folder> --out <scratch/stitch/<screen>>

Strip Stitch/Tailwind/CDN noise and extract token candidates from a Stitch
export so the agent can implement theme-native code without copy-paste leak.

Output:
  <out>/cleaned.html             Stripped HTML (no script CDN, no Tailwind link).
  <out>/cleaned.css              Inline + linked CSS merged.
  <out>/tokens.json              Color/font/spacing histogram for token mapping.
  <out>/stitch-fidelity.json     Additive checklist artifact for Stitch -> Haravan merge.
  <out>/report.md                What was stripped, what is suspicious.
`);
}

const STRIP_TAGS = [
  /<script[^>]*src=["'][^"']*tailwind[^"']*["'][^>]*>\s*<\/script>/gi,
  /<script[^>]*src=["']https:\/\/cdn\.[^"']+["'][^>]*>\s*<\/script>/gi,
  /<link[^>]*href=["'][^"']*tailwind[^"']*["'][^>]*\/?>/gi,
  /<link[^>]*href=["']https:\/\/fonts\.googleapis\.com[^"']*["'][^>]*\/?>/gi,
  /<link[^>]*href=["']https:\/\/cdn\.[^"']+["'][^>]*\/?>/gi
];

const PLACEHOLDER_HOSTS = [
  /https?:\/\/picsum\.photos\/[^"'\s)]+/gi,
  /https?:\/\/placehold\.co\/[^"'\s)]+/gi,
  /https?:\/\/via\.placeholder\.com\/[^"'\s)]+/gi,
  /https?:\/\/[^"'\s)]*unsplash[^"'\s)]+/gi,
  /https?:\/\/lh3\.googleusercontent\.com\/[^"'\s)]+/gi
];

function collectFilesRecursive(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFilesRecursive(full, out);
    else if (/\.(html?|css)$/i.test(entry.name)) out.push({ name: path.relative(dir, full), fullPath: full, text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

function readInput(p) {
  const stat = fs.statSync(p);
  if (stat.isFile()) return [{ name: path.basename(p), fullPath: p, text: fs.readFileSync(p, 'utf8') }];
  return collectFilesRecursive(p, []).map((item) => ({
    name: path.relative(p, item.fullPath),
    fullPath: item.fullPath,
    text: item.text
  }));
}

function extractInlineStyles(html) {
  const styles = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) styles.push(m[1]);
  return styles.join('\n\n');
}

function stripHtml(html) {
  let stripped = html;
  let removedCount = 0;
  for (const re of STRIP_TAGS) {
    stripped = stripped.replace(re, () => { removedCount += 1; return ''; });
  }
  return { html: stripped, removedCount };
}

function findPlaceholders(text) {
  const hits = [];
  for (const re of PLACEHOLDER_HOSTS) {
    const m = text.match(re);
    if (m) hits.push(...m);
  }
  return Array.from(new Set(hits));
}

function tokenizeColors(css) {
  const counts = new Map();
  const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]+\)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const key = m[0].toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

function tokenizeFonts(css) {
  const counts = new Map();
  const re = /font-family\s*:\s*([^;]+)/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const key = m[1].trim().replace(/!important/i, '').trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

function tokenizeFontSizes(css) {
  const counts = new Map();
  const re = /font-size\s*:\s*([0-9.]+)(px|rem|em)/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const key = `${m[1]}${m[2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

function tokenizeSpacing(css) {
  const counts = new Map();
  const re = /(?:padding|margin|gap)\s*:\s*([^;]+)/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    for (const token of m[1].trim().split(/\s+/)) {
      if (/^[0-9.]+(px|rem|em|%)$/.test(token)) counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

function suggestColorName(hex, index) {
  const slot = ['color-primary', 'color-surface', 'color-text', 'color-muted', 'color-border', 'color-accent', 'color-sale', 'color-success'];
  return slot[index] || `color-${index + 1}`;
}

function slugify(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSections(html) {
  const sections = [];
  const sectionRe = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
  let match;
  let index = 0;
  while ((match = sectionRe.exec(html)) !== null) {
    index += 1;
    const attrs = match[1] || '';
    const body = match[2] || '';
    const id = (attrs.match(/\bid=["']([^"']+)["']/i) || [])[1];
    const dataSection = (attrs.match(/\bdata-section=["']([^"']+)["']/i) || [])[1];
    const ariaLabel = (attrs.match(/\baria-label=["']([^"']+)["']/i) || [])[1];
    const className = (attrs.match(/\bclass=["']([^"']+)["']/i) || [])[1];
    const headingText = stripTags((body.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1] || '');
    const label = id || dataSection || ariaLabel || (className ? className.split(/\s+/)[0] : '') || headingText || `section-${index}`;
    sections.push({
      index,
      name: slugify(label, `section-${index}`),
      source: 'section-tag',
      heading: headingText || null
    });
  }
  if (sections.length) return sections;

  const headings = [];
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((match = headingRe.exec(html)) !== null) {
    const text = stripTags(match[2]);
    if (text) headings.push(text);
  }
  if (headings.length) {
    return headings.slice(0, 12).map((text, index) => ({
      index: index + 1,
      name: slugify(text, `section-${index + 1}`),
      source: 'heading-fallback',
      heading: text
    }));
  }

  return [{ index: 1, name: 'screen-root', source: 'document-fallback', heading: null }];
}

function extractAssetSlots(html, css, placeholderUrls) {
  const assets = [];
  const seen = new Set();
  function pushAsset(type, src, source, status) {
    if (!src) return;
    const key = `${type}|${src}`;
    if (seen.has(key)) return;
    seen.add(key);
    assets.push({ type, src, source, status, required: true });
  }

  for (const match of html.matchAll(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1].trim();
    pushAsset('image', src, 'html-img', placeholderUrls.includes(src) ? 'placeholder' : 'captured');
  }
  for (const match of html.matchAll(/<source[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1].split(',')[0].trim().split(/\s+/)[0];
    pushAsset('image', src, 'html-source', placeholderUrls.includes(src) ? 'placeholder' : 'captured');
  }
  for (const match of css.matchAll(/url\((["']?)([^)"']+)\1\)/gi)) {
    const src = match[2].trim();
    pushAsset('background-image', src, 'css-url', placeholderUrls.includes(src) ? 'placeholder' : 'captured');
  }
  for (const src of placeholderUrls) pushAsset('image', src, 'placeholder-detected', 'placeholder');
  return assets;
}

function extractCopyBlocks(html) {
  const blocks = [];
  const seen = new Set();
  const patterns = [
    { type: 'heading', regex: /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, index: 2 },
    { type: 'paragraph', regex: /<p[^>]*>([\s\S]*?)<\/p>/gi, index: 1 },
    { type: 'button', regex: /<button[^>]*>([\s\S]*?)<\/button>/gi, index: 1 },
    { type: 'link', regex: /<a[^>]*>([\s\S]*?)<\/a>/gi, index: 1 }
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(html)) !== null) {
      const text = stripTags(match[pattern.index]);
      if (!text || text.length < 2) continue;
      const key = `${pattern.type}|${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ type: pattern.type, text });
    }
  }
  return blocks.slice(0, 40);
}

function readLinkedCss(html, htmlPath, seenPaths) {
  const linked = [];
  for (const match of html.matchAll(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1].trim();
    if (/^(https?:)?\/\//i.test(href) || /^data:/i.test(href)) continue;
    const cleanHref = href.split('#')[0].split('?')[0];
    const resolved = path.resolve(path.dirname(htmlPath), cleanHref);
    if (!/\.css$/i.test(resolved) || !fs.existsSync(resolved) || seenPaths.has(resolved)) continue;
    seenPaths.add(resolved);
    linked.push({ name: path.relative(path.dirname(htmlPath), resolved), fullPath: resolved, text: fs.readFileSync(resolved, 'utf8') });
  }
  return linked;
}

function buildFidelityManifest(args, cleanedHtml, cleanedCss, parts) {
  return {
    generatedBy: 'stitch_consume.js',
    input: args.in,
    output: args.out,
    mergeStatus: 'pending',
    sections: extractSections(cleanedHtml),
    assetSlots: extractAssetSlots(cleanedHtml, cleanedCss, parts.placeholders),
    tokens: {
      colors: parts.colors.slice(0, 12),
      fonts: parts.fonts.slice(0, 8),
      fontSizes: parts.fontSizes.slice(0, 12),
      spacings: parts.spacings.slice(0, 12)
    },
    copyBlocks: extractCopyBlocks(cleanedHtml),
    allowedDeviations: [],
    notes: [
      'Use this artifact as additive evidence, not as a replacement for manual Stitch review.',
      'Record approved deviations in the ledger before implementation.'
    ]
  };
}

function buildReport(args, parts) {
  const lines = ['# Stitch Consume Report', '', `Input: ${args.in}`, `Output: ${args.out}`, ''];
  lines.push(`- Files processed: ${parts.fileCount}`);
  lines.push(`- Linked CSS followed: ${parts.linkedCssCount}`);
  lines.push(`- CDN/Tailwind tags stripped: ${parts.removed}`);
  lines.push(`- Inline styles merged: ${parts.styleCount}`);
  lines.push(`- Placeholder image URLs found: ${parts.placeholders.length}`);
  lines.push(`- Stitch fidelity artifact: ${path.join(args.out, 'stitch-fidelity.json')}`);
  if (parts.placeholders.length) {
    lines.push('', '## Placeholder URLs (must be replaced)');
    for (const p of parts.placeholders.slice(0, 30)) lines.push(`- ${p}`);
    if (parts.placeholders.length > 30) lines.push(`- ... +${parts.placeholders.length - 30} more`);
  }
  if (parts.colors.length) {
    lines.push('', '## Top color candidates');
    lines.push('| Hex/RGB | Count | Suggested token |');
    lines.push('|---|---:|---|');
    for (let i = 0; i < Math.min(8, parts.colors.length); i += 1) {
      const c = parts.colors[i];
      lines.push(`| ${c.value} | ${c.count} | --${suggestColorName(c.value, i)} |`);
    }
  }
  if (parts.fonts.length) {
    lines.push('', '## Font families');
    for (const f of parts.fonts.slice(0, 6)) lines.push(`- ${f.value} (${f.count})`);
  }
  if (parts.fontSizes.length) {
    lines.push('', '## Font-size scale');
    lines.push(parts.fontSizes.slice(0, 12).map((x) => `${x.value} (${x.count})`).join(', '));
  }
  if (parts.spacings.length) {
    lines.push('', '## Spacing scale');
    lines.push(parts.spacings.slice(0, 12).map((x) => `${x.value} (${x.count})`).join(', '));
  }
  lines.push('', '## Next steps');
  lines.push('1. Review `cleaned.html`, `cleaned.css`, and `stitch-fidelity.json` before writing Liquid.');
  lines.push('2. Map top colors -> theme tokens (suggested names are placeholders, confirm with brand).');
  lines.push('3. Replace placeholder image URLs via `asset_pipeline.js` and `asset-plan.json`.');
  lines.push('4. Implement Liquid section-by-section per `STITCH_FIDELITY.md` and record deviations in the ledger.');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.in || !args.out) { usage(); process.exit(args.help ? 0 : 1); }
  if (!fs.existsSync(args.in)) { console.error(`ERROR: --in not found: ${args.in}`); process.exit(1); }
  fs.mkdirSync(args.out, { recursive: true });

  const inputs = readInput(args.in);
  const seenCssPaths = new Set(inputs.filter((item) => /\.css$/i.test(item.name)).map((item) => item.fullPath));
  let cleanedHtml = '';
  let cleanedCss = '';
  let removed = 0;
  let styleCount = 0;
  let linkedCssCount = 0;
  const placeholders = new Set();

  for (const file of inputs) {
    if (/\.html?$/i.test(file.name)) {
      const inlineCss = extractInlineStyles(file.text);
      if (inlineCss.trim()) { cleanedCss += `/* from ${file.name} */\n${inlineCss}\n\n`; styleCount += 1; }
      for (const linkedCss of readLinkedCss(file.text, file.fullPath, seenCssPaths)) {
        cleanedCss += `/* linked from ${file.name}: ${linkedCss.name} */\n${linkedCss.text}\n\n`;
        linkedCssCount += 1;
        for (const url of findPlaceholders(linkedCss.text)) placeholders.add(url);
      }
      const stripped = stripHtml(file.text);
      removed += stripped.removedCount;
      const noStyles = stripped.html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      cleanedHtml += `<!-- from ${file.name} -->\n${noStyles}\n`;
      for (const url of findPlaceholders(stripped.html)) placeholders.add(url);
    } else if (/\.css$/i.test(file.name)) {
      cleanedCss += `/* from ${file.name} */\n${file.text}\n\n`;
      for (const url of findPlaceholders(file.text)) placeholders.add(url);
    }
  }

  const colors = tokenizeColors(cleanedCss);
  const fonts = tokenizeFonts(cleanedCss);
  const fontSizes = tokenizeFontSizes(cleanedCss);
  const spacings = tokenizeSpacing(cleanedCss);
  const placeholderList = [...placeholders];
  const fidelityManifest = buildFidelityManifest(args, cleanedHtml, cleanedCss, {
    placeholders: placeholderList,
    colors,
    fonts,
    fontSizes,
    spacings
  });

  fs.writeFileSync(path.join(args.out, 'cleaned.html'), cleanedHtml, 'utf8');
  fs.writeFileSync(path.join(args.out, 'cleaned.css'), cleanedCss, 'utf8');
  fs.writeFileSync(path.join(args.out, 'tokens.json'), JSON.stringify({ colors, fonts, fontSizes, spacings }, null, 2), 'utf8');
  fs.writeFileSync(path.join(args.out, 'stitch-fidelity.json'), JSON.stringify(fidelityManifest, null, 2), 'utf8');

  const report = buildReport(args, {
    fileCount: inputs.length, linkedCssCount, removed, styleCount,
    placeholders: placeholderList, colors, fonts, fontSizes, spacings
  });
  fs.writeFileSync(path.join(args.out, 'report.md'), report, 'utf8');

  console.log('# Stitch Consume');
  console.log(`Input: ${args.in}`);
  console.log(`Output: ${args.out}`);
  console.log(`Stripped CDN tags: ${removed} | Linked CSS: ${linkedCssCount} | Placeholders: ${placeholders.size} | Colors: ${colors.length} | Fonts: ${fonts.length}`);
  console.log(`See ${path.join(args.out, 'report.md')}`);
}

try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
