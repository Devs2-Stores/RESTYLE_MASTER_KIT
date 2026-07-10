#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { walkTheme } = require('./lib/theme-walk');

function readValue(argv, i, flag) {
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function parseArgs(argv) {
  const args = { theme: '', stitch: '', out: '', help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--theme') { args.theme = path.resolve(readValue(argv, i, '--theme')); i += 1; }
    else if (v === '--stitch-tokens') { args.stitch = path.resolve(readValue(argv, i, '--stitch-tokens')); i += 1; }
    else if (v === '--out') { args.out = path.resolve(readValue(argv, i, '--out')); i += 1; }
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node design_token_extract.js --theme <theme-root> --stitch-tokens <scratch/stitch/<screen>/tokens.json> --out <out-dir>

Compare design tokens between an existing theme and a Stitch consume report.

Reads:
  - <theme>/assets/*.css       Existing CSS custom properties + raw color usage.
  - <stitch-tokens.json>       Output of stitch_consume.js.
  - <stitch-fidelity.json>     Optional additive manifest from stitch_consume.js.

Writes:
  <out>/mapping.md                      Human-readable mapping table.
  <out>/mapping.json                    Machine-readable mapping for downstream tools.
  <out>/tokens.css                      Suggested ":root" block to paste into theme.
  <out>/stitch-fidelity-token-map.json  Additive token-focused fidelity summary.
`);
}

function parseColor(value) {
  const input = String(value || '').trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(input)) {
    const s = input.slice(1).split('').map((c) => c + c).join('');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  if (/^#[0-9a-f]{6}$/.test(input)) {
    return [parseInt(input.slice(1, 3), 16), parseInt(input.slice(3, 5), 16), parseInt(input.slice(5, 7), 16)];
  }
  const rgb = input.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      const nums = parts.slice(0, 3).map((part) => Number(part.replace('%', '')));
      if (nums.every((num) => Number.isFinite(num))) return nums;
    }
  }
  return null;
}

function colorDistance(a, b) {
  const ra = parseColor(a), rb = parseColor(b);
  if (!ra || !rb) return Infinity;
  return Math.sqrt((ra[0] - rb[0]) ** 2 + (ra[1] - rb[1]) ** 2 + (ra[2] - rb[2]) ** 2);
}

function isColorToken(value) {
  return Boolean(parseColor(value));
}

function parseRootVars(css) {
  const vars = {};
  const rootBlocks = css.match(/:root\s*\{([\s\S]*?)\}/g) || [];
  for (const block of rootBlocks) {
    const re = /--([\w-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(block))) vars[m[1]] = m[2].trim();
  }
  return vars;
}

function parseRawColorUsage(css) {
  const counts = {};
  const re = /(?:color|background(?:-color)?|border(?:-color)?|fill|stroke)\s*:\s*([^;}\n]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const val = m[1].trim();
    if (/^var\(/.test(val)) continue;
    const colorMatch = val.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^)]+\)/);
    if (colorMatch && isColorToken(colorMatch[0])) {
      const key = colorMatch[0].toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

function parseFontFamily(css) {
  const counts = {};
  const re = /font-family\s*:\s*([^;}\n]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const v = m[1].trim().replace(/!important/i, '').trim();
    if (/^var\(/.test(v)) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

function suggestSlot(idx) {
  const names = ['color-primary', 'color-surface', 'color-text', 'color-muted', 'color-border', 'color-accent', 'color-sale', 'color-success'];
  return names[idx] || `color-${idx + 1}`;
}

function findClosestThemeColor(stitchColor, themeUsage, themeVars) {
  if (!isColorToken(stitchColor)) return null;
  let best = null;
  for (const [name, value] of Object.entries(themeVars)) {
    if (isColorToken(value)) {
      const d = colorDistance(stitchColor, value);
      if (!best || d < best.distance) best = { kind: 'var', name, value, distance: d };
    }
  }
  for (const value of Object.keys(themeUsage)) {
    if (isColorToken(value)) {
      const d = colorDistance(stitchColor, value);
      if (!best || d < best.distance) best = { kind: 'raw', name: null, value, distance: d };
    }
  }
  return best;
}

function buildSuggestedRoot(stitchColors, stitchFonts) {
  const lines = [':root {'];
  lines.push('  /* Color tokens (top Stitch values, suggested slot names) */');
  for (let i = 0; i < Math.min(8, stitchColors.length); i += 1) {
    lines.push(`  --${suggestSlot(i)}: ${stitchColors[i].value};`);
  }
  if (stitchFonts.length) {
    lines.push('');
    lines.push('  /* Font tokens */');
    if (stitchFonts[0]) lines.push(`  --font-heading: ${stitchFonts[0].value};`);
    if (stitchFonts[1]) lines.push(`  --font-body: ${stitchFonts[1].value};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function buildMappingMd(parts) {
  const lines = ['# Design Token Mapping', ''];
  lines.push(`Theme: ${parts.themeRoot}`);
  lines.push(`Stitch tokens: ${parts.stitchPath}`);
  lines.push(`Stitch fidelity manifest: ${parts.fidelityPath || 'not found'}`);
  lines.push('');
  lines.push(`- Existing :root vars: ${Object.keys(parts.themeVars).length}`);
  lines.push(`- Theme raw color hits: ${Object.keys(parts.themeUsage).length}`);
  lines.push(`- Stitch top colors: ${parts.stitchColors.length}`);
  lines.push(`- Stitch fonts: ${parts.stitchFonts.length}`);
  if (parts.fidelitySummary) {
    lines.push(`- Stitch sections captured: ${parts.fidelitySummary.sectionCount}`);
    lines.push(`- Stitch asset slots captured: ${parts.fidelitySummary.assetSlotCount}`);
    lines.push(`- Stitch copy blocks captured: ${parts.fidelitySummary.copyBlockCount}`);
  }
  lines.push('');

  lines.push('## Color mapping (Stitch -> closest theme value)');
  lines.push('| Stitch | Count | Closest theme | Distance | Suggestion |');
  lines.push('|---|---:|---|---:|---|');
  for (const c of parts.stitchColors.slice(0, 12)) {
    const closest = findClosestThemeColor(c.value, parts.themeUsage, parts.themeVars);
    const closestLabel = closest ? (closest.kind === 'var' ? `--${closest.name} (${closest.value})` : `${closest.value} (raw)`) : '-';
    const dist = closest ? closest.distance.toFixed(1) : '-';
    let suggestion;
    if (closest && closest.distance < 12) suggestion = `Reuse ${closest.kind === 'var' ? '--' + closest.name : closest.value}`;
    else if (closest && closest.distance < 40) suggestion = `Replace ${closest.value} -> Stitch ${c.value}`;
    else suggestion = `New token: --${suggestSlot(parts.stitchColors.indexOf(c))}`;
    lines.push(`| ${c.value} | ${c.count} | ${closestLabel} | ${dist} | ${suggestion} |`);
  }

  lines.push('');
  lines.push('## Theme orphan colors (in theme but not in Stitch top list)');
  const stitchSet = new Set(parts.stitchColors.map((c) => c.value));
  const themeOnly = Object.keys(parts.themeUsage).filter((c) => !stitchSet.has(c));
  for (const c of themeOnly.slice(0, 10)) lines.push(`- ${c} (used ${parts.themeUsage[c]}x) - candidate to remove`);

  lines.push('');
  lines.push('## Font mapping');
  lines.push('| Stitch font | Count | Theme has var? |');
  lines.push('|---|---:|---|');
  for (const f of parts.stitchFonts.slice(0, 6)) {
    const hasVar = Object.entries(parts.themeVars).find(([k, v]) => /font/i.test(k) && v.includes(f.value.split(',')[0].replace(/['"]/g, '').trim()));
    lines.push(`| ${f.value} | ${f.count} | ${hasVar ? '--' + hasVar[0] : 'no'} |`);
  }

  lines.push('');
  lines.push('## Next steps');
  lines.push('1. Apply `tokens.css` snippet to `<theme>/assets/theme.css :root`.');
  lines.push('2. Review `stitch-fidelity-token-map.json` before touching component CSS.');
  lines.push('3. Replace raw colors with `var(--*)` per the suggestion column, including rgba-based roles when they map cleanly.');
  lines.push('4. Run `node css_token_audit.js --root <theme> --fail-on warn` to verify hardcode count went down.');
  return lines.join('\n');
}

function loadOptionalFidelity(stitchTokensPath) {
  const fidelityPath = path.join(path.dirname(stitchTokensPath), 'stitch-fidelity.json');
  if (!fs.existsSync(fidelityPath)) return { fidelityPath: '', fidelity: null };
  try {
    return { fidelityPath, fidelity: JSON.parse(fs.readFileSync(fidelityPath, 'utf8')) };
  } catch (_) {
    return { fidelityPath, fidelity: null };
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.theme || !args.stitch || !args.out) { usage(); process.exit(args.help ? 0 : 1); }
  if (!fs.existsSync(args.stitch)) { console.error(`ERROR: stitch tokens not found: ${args.stitch}`); process.exit(1); }
  fs.mkdirSync(args.out, { recursive: true });

  const cssFiles = walkTheme(args.theme, { dirs: ['assets'], ext: /\.css$/i });
  let themeCss = '';
  for (const f of cssFiles) themeCss += fs.readFileSync(f, 'utf8') + '\n';

  const themeVars = parseRootVars(themeCss);
  const themeUsage = parseRawColorUsage(themeCss);
  const themeFonts = parseFontFamily(themeCss);

  const stitch = JSON.parse(fs.readFileSync(args.stitch, 'utf8'));
  const stitchColors = (stitch.colors || []).filter((c) => isColorToken(c.value));
  const stitchFonts = stitch.fonts || [];
  const { fidelityPath, fidelity } = loadOptionalFidelity(args.stitch);

  const fidelitySummary = {
    stitchTokensPath: args.stitch,
    stitchFidelityPath: fidelityPath || null,
    sectionCount: Array.isArray(fidelity && fidelity.sections) ? fidelity.sections.length : 0,
    assetSlotCount: Array.isArray(fidelity && fidelity.assetSlots) ? fidelity.assetSlots.length : 0,
    copyBlockCount: Array.isArray(fidelity && fidelity.copyBlocks) ? fidelity.copyBlocks.length : 0,
    allowedDeviations: Array.isArray(fidelity && fidelity.allowedDeviations) ? fidelity.allowedDeviations : [],
    tokenMappingStatus: 'pending-review',
    topColorSlots: stitchColors.slice(0, 8).map((c, i) => ({
      stitchValue: c.value,
      count: c.count,
      slot: suggestSlot(i),
      cssVar: `--${suggestSlot(i)}`,
      closestTheme: findClosestThemeColor(c.value, themeUsage, themeVars)
    })),
    topFonts: stitchFonts.slice(0, 4)
  };

  const mappingMd = buildMappingMd({
    themeRoot: args.theme,
    stitchPath: args.stitch,
    fidelityPath,
    fidelitySummary,
    themeVars,
    themeUsage,
    themeFonts,
    stitchColors,
    stitchFonts
  });

  const mappingJson = {
    themeVars,
    themeRawColors: themeUsage,
    themeFonts,
    stitchColors,
    stitchFonts,
    suggestions: stitchColors.slice(0, 8).map((c, i) => ({
      stitchValue: c.value,
      slot: suggestSlot(i),
      cssVar: `--${suggestSlot(i)}`,
      closestTheme: findClosestThemeColor(c.value, themeUsage, themeVars)
    })),
    fidelity: fidelitySummary
  };

  const tokensCss = buildSuggestedRoot(stitchColors, stitchFonts);

  fs.writeFileSync(path.join(args.out, 'mapping.md'), mappingMd, 'utf8');
  fs.writeFileSync(path.join(args.out, 'mapping.json'), JSON.stringify(mappingJson, null, 2), 'utf8');
  fs.writeFileSync(path.join(args.out, 'tokens.css'), tokensCss, 'utf8');
  fs.writeFileSync(path.join(args.out, 'stitch-fidelity-token-map.json'), JSON.stringify(fidelitySummary, null, 2), 'utf8');

  console.log('# Design Token Extract');
  console.log(`Theme :root vars: ${Object.keys(themeVars).length} | raw colors: ${Object.keys(themeUsage).length}`);
  console.log(`Stitch colors: ${stitchColors.length} | fonts: ${stitchFonts.length}`);
  console.log(`Stitch fidelity manifest: ${fidelityPath || 'not found'}`);
  console.log(`Output: ${args.out}`);
}

try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
