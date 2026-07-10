#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { config: '', root: path.resolve(process.cwd(), '..'), force: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') args.help = true;
    else if (v === '--config') args.config = path.resolve(argv[++i]);
    else if (v === '--root') args.root = path.resolve(argv[++i]);
    else if (v === '--force') args.force = true;
    else if (v === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown argument: ${v}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node section_scaffold.js --config <section-config.json> --root <theme-root> [--force] [--dry-run]

Generate Liquid section + snippet boilerplate from a JSON config so the agent
does not write the same scaffold by hand for every Stitch screen.

Options:
  --force     Overwrite existing files (off by default).
  --dry-run   Print files that would be written, do not touch disk.

Schema: see section-config.template.json
`);
}

function liquidEscape(s) { return String(s).replace(/}}/g, '} }').replace(/{%/g, '{ %'); }

function renderSettingHtml(settings) {
  const out = [];
  for (const s of settings) {
    // Skip CTA pair - rendered separately as <a> button
    if (/^(cta_text|cta_url|button_text|button_url)$/.test(s.id)) continue;
    if (s.type === 'text' || s.type === 'textarea' || s.type === 'richtext') {
      out.push(`  {% if section.settings.${s.id} != blank %}`);
      const tag = s.type === 'richtext' ? 'div' : (s.heading ? 'h2' : 'p');
      out.push(`    <${tag} class="section-${s.id}">{{ section.settings.${s.id} }}</${tag}>`);
      out.push(`  {% endif %}`);
    } else if (s.type === 'image_picker') {
      out.push(`  {% if section.settings.${s.id} != blank %}`);
      out.push(`    <img class="section-${s.id}" src="{{ section.settings.${s.id} | img_url: '1600x' }}" alt="{{ section.settings.${s.id}_alt | default: section.settings.heading | escape }}" loading="lazy">`);
      out.push(`  {% endif %}`);
    } else if (s.type === 'url') {
      // URL alone has no rendering; usually paired with cta_text.
    } else if (s.type === 'collection' || s.type === 'page' || s.type === 'blog' || s.type === 'menu' || s.type === 'product') {
      out.push(`  {% comment %} ${s.type} picker: section.settings.${s.id} {% endcomment %}`);
    }
  }
  return out.join('\n');
}

function renderCta(settings) {
  const text = settings.find((s) => /cta_text|button_text/.test(s.id));
  const url = settings.find((s) => /cta_url|button_url/.test(s.id));
  if (!text || !url) return '';
  return `  {% if section.settings.${text.id} != blank and section.settings.${url.id} != blank %}
    <a class="btn btn--primary" href="{{ section.settings.${url.id} }}">{{ section.settings.${text.id} }}</a>
  {% endif %}`;
}

function renderBlocksLoop(section) {
  if (!section.blocks || !section.blocks.length) return '';
  const blockType = section.blocks[0].type || 'item';
  return `  {% if section.blocks.size > 0 %}
    <div class="section-${section.name}__list">
      {% for block in section.blocks %}
        <div class="section-${section.name}__item" {{ block.shopify_attributes }}>
          {% include 'section-${section.name}-${blockType}', block: block %}
        </div>
      {% endfor %}
    </div>
  {% endif %}`;
}

function renderSchema(section) {
  const schema = {
    name: section.label || section.name,
    settings: section.settings || [],
    presets: section.presets || [{ name: section.label || section.name, category: 'Stitch' }]
  };
  if (section.blocks) schema.blocks = section.blocks;
  return `{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}`;
}

function buildSectionLiquid(section) {
  const stitchHint = section.stitchSource ? `{%- comment %} Stitch source: ${section.stitchSource} {% endcomment -%}\n` : '';
  return `${stitchHint}<section class="section section--${section.name}" data-section="${section.name}">
${renderSettingHtml(section.settings || [])}
${renderBlocksLoop(section)}
${renderCta(section.settings || [])}
</section>

${renderSchema(section)}
`;
}

function buildSnippetLiquid(section, block) {
  return `{%- comment %} Block snippet for section ${section.name}, block type ${block.type} {% endcomment -%}
<article class="section-${section.name}__card">
${(block.settings || []).map((s) => {
  if (s.type === 'image_picker') {
    return `  {% if block.settings.${s.id} != blank %}
    <img src="{{ block.settings.${s.id} | img_url: '800x' }}" alt="{{ block.settings.${s.id}_alt | default: block.settings.heading | escape }}" loading="lazy">
  {% endif %}`;
  }
  if (s.type === 'text' || s.type === 'textarea' || s.type === 'richtext') {
    const tag = s.heading ? 'h3' : 'p';
    return `  {% if block.settings.${s.id} != blank %}<${tag} class="section-${section.name}__${s.id}">{{ block.settings.${s.id} }}</${tag}>{% endif %}`;
  }
  return '';
}).filter(Boolean).join('\n')}
</article>
`;
}

function writeFile(filePath, content, args) {
  if (fs.existsSync(filePath) && !args.force) {
    console.log(`SKIP (exists): ${path.relative(args.root, filePath)}`);
    return false;
  }
  if (args.dryRun) {
    console.log(`WOULD WRITE: ${path.relative(args.root, filePath)} (${content.length} bytes)`);
    return true;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`WROTE: ${path.relative(args.root, filePath)}`);
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.config) { usage(); process.exit(args.help ? 0 : 1); }
  if (!fs.existsSync(args.config)) { console.error(`ERROR: config not found: ${args.config}`); process.exit(1); }

  const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  if (!Array.isArray(config.sections)) { console.error('ERROR: config.sections must be an array'); process.exit(1); }

  console.log('# Section Scaffold');
  console.log(`Config: ${args.config}`);
  console.log(`Root:   ${args.root}`);
  console.log(`Mode:   ${args.dryRun ? 'dry-run' : (args.force ? 'force overwrite' : 'safe (skip existing)')}`);
  console.log('');

  let written = 0;
  for (const section of config.sections) {
    if (!section.name) { console.error('skip: section missing "name"'); continue; }
    const sectionPath = path.join(args.root, 'templates', 'sections', `${section.name}.liquid`);
    if (writeFile(sectionPath, buildSectionLiquid(section), args)) written += 1;

    for (const block of (section.blocks || [])) {
      const blockType = block.type || 'item';
      const snippetPath = path.join(args.root, 'snippets', `section-${section.name}-${blockType}.liquid`);
      if (writeFile(snippetPath, buildSnippetLiquid(section, block), args)) written += 1;
    }
  }

  console.log('');
  console.log(`Files ${args.dryRun ? 'planned' : 'written'}: ${written}`);
  if (!args.dryRun && written > 0) {
    console.log('\nNote: scaffold is structural only. Add CSS scope, asset, and layout fidelity per STITCH_FIDELITY.md.');
  }
}

try { main(); } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
