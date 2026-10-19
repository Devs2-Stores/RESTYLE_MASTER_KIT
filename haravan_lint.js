#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { walkTheme } = require('./lib/theme-walk');
const { readValue, normalizeEnum } = require('./lib/cli-args');
const { countBySeverity, shouldFail } = require('./lib/findings');
const { printFindingsTable } = require('./lib/report');
const { runSettingsSchemaAudit, resolveSettingsMode, normalizeSettingsMode } = require('./lib/settings-audit');
const registry = require('./lib/registry');

const VALID_HARAVAN_IMG_URL_SIZES = new Set([
  'pico', 'icon', 'thumb', 'small', 'compact', 'medium', 'large', 'grande', '1024x1024', '2048x2048', 'master'
]);
function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    failOn: 'blocker',
    dryRun: false,
    json: false,
    waivers: null,
    contract: null,
    settingsMode: 'auto',
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') {
      args.help = true;
    } else if (v === '--root' || v === '--theme') {
      args.root = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--fail-on') {
      args.failOn = normalizeEnum(readValue(argv, i, '--fail-on'), '--fail-on', ['blocker', 'warn']);
      i += 1;
    } else if (v === '--dry-run') {
      args.dryRun = true;
    } else if (v === '--json') {
      args.json = true;
    } else if (v === '--waivers') {
      args.waivers = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--contract') {
      args.contract = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--settings-mode') {
      args.settingsMode = normalizeSettingsMode(readValue(argv, i, v));
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${v}`);
    }
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node haravan_lint.js [--root <theme-root>] [--fail-on blocker|warn] [--dry-run] [--json] [--waivers <QA_WAIVERS.json>] [--contract <contract.json>] [--settings-mode legacy|schema|auto]

Options:
  --root, --theme <path>  Theme root directory (default: parent of cwd).
  --fail-on <level>       Exit 1 on blocker (default) or warn.
  --dry-run               Report findings but always exit 0.
  --json                  Output raw findings as JSON.
  --help, -h              Show this help message.
  --waivers <file>        JSON array of {rule, reason, kinds?}; rule is a registry slug, reason at least 10 chars. Optional kinds (for example ["aria-label","title"] on hardcoded-visible-text; allowed: aria-label, title, placeholder, alt, text, table) waives only findings of those kinds. Waived findings are listed, not counted.
  --contract <file>       Remake contract (default: <root>/deliverables/FULL_REMAKE_CONTRACT.json when present); supplies mobileRootFontPx and typeScale overrides.
  --settings-mode <mode>  legacy audits config/settings.html and skips settings_schema.json shape checks; schema (default) runs the settings schema audit; auto reads "settingsMode" from .workspace-context.json (theme root or up to 3 parents) and falls back to schema.

Checks Haravan-forbidden syntax, Liquid platform limitations, and F1GENZ conventions:
  - | json filter in HTML markup (blocker); inside executable <script> it is a warn
    that requires a live probe, and allowed inside <script type="application/json">
  - {% continue %} (causes Haravan HTTP 500)
  - {% render %} and {% schema %} (Shopify-only syntax)
  - | image_url and link.levels (Shopify-only filters/properties)
  - Hard-text settings defaults: settings.x | default: '...'
  - Object fallbacks: | default: collections['all'] or blogs.news
  - Global scroll-behavior: smooth on html/body (causes CLS 0.5+)
  - prefers-reduced-motion (forbidden workspace override)
  - Bare body.<theme> input|textarea|select selectors
  - .container combined with another class on the same element
  - setting-id/setting-type vs settings_schema.json parity (image_picker -> image)
  - settings.<key> used in Liquid but missing from schema (with dynamic capture expansion)
  - HTML tag balance per file with Liquid tags masked
  - asset_url references to missing assets/ files
  - HTML entities (&bull;, &amp;, etc.) in settings_schema defaults
  - Default-named reCAPTCHA scripts of two {% form %} tags that can render on one page
`);
}

function maskLiquidAndComments(text) {
  // Replace HTML comments with spaces of same length
  let masked = text.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  // Replace Liquid tags {% ... %} and {{ ... }} with spaces of same length
  masked = masked.replace(/\{%-?[\s\S]*?-?%\}/g, (m) => ' '.repeat(m.length));
  masked = masked.replace(/\{\{[\s\S]*?\}\}/g, (m) => ' '.repeat(m.length));
  return masked;
}

function getLineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function checkLiquidFile(file, root, findings, schemaContext, assetSet) {
  const text = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(root, file);

  // 1. | json: allowed in JSON scripts, warn in executable scripts, blocker in markup
  const lines = text.split(/\r?\n/);
  let scriptKind = null;
  for (let i = 0; i < lines.length; i += 1) {
    for (const token of lines[i].matchAll(/<script\b[^>]*>|<\/script>|\|\s*json\b/gi)) {
      const tag = token[0];
      if (/^<script/i.test(tag)) {
        scriptKind = /type=["']application\/(?:ld\+)?json["']/i.test(tag) ? 'json' : 'code';
      } else if (/^<\/script>/i.test(tag)) {
        scriptKind = null;
      } else if (scriptKind === 'code') {
        findings.push({
          severity: 'warn',
          rule: 'HARAVAN_JSON_IN_SCRIPT',
          location: `${relPath}:${i + 1}`,
          message: 'Filter | json inside an executable <script>: allowed only after a live probe shows no "json not allowed for this object" in the rendered page. Numbers and objects (products_count, settings.x | plus: 0) print that error literal; output them raw with a guard instead.'
        });
      } else if (scriptKind === null) {
        const lineText = lines[i];
        if (/\{\{\s*(?:product|option|collection|variant|article|blog|cart|product\.options)\s*\|\s*json\s*\}\}/i.test(lineText)) {
          findings.push({
            severity: 'blocker',
            rule: 'HARAVAN_DROP_JSON_FILTER',
            location: `${relPath}:${i + 1}`,
            message: 'Filter | json cannot be applied to Haravan Drop objects (product, option, collection, variant, etc.). DotLiquid throws "json not allowed for this object". Construct JSON manually or output specific string/number attributes.'
          });
        } else {
          findings.push({
            severity: 'blocker',
            rule: 'HARAVAN_FORBIDDEN_JSON_FILTER',
            location: `${relPath}:${i + 1}`,
            message: 'Filter | json is forbidden in HTML markup. Haravan Liquid fails to render HTML with | json; use | escape, | strip_html, or manual JSON formatting.'
          });
        }
      }
    }
  }

  // 1c. DotLiquid .size < / .size > comparison without blank guard (warn)
  for (const m of text.matchAll(/\{%-?\s*(?:if|elsif|unless)\s+([^%]+)-?%\}/g)) {
    const expr = m[1];
    const sizeMatch = expr.match(/\b([a-zA-Z0-9_\.\[\]]+)\.size\s*(?:<|<=|>|>=)\s*\d+/);
    if (sizeMatch) {
      const varName = sizeMatch[1];
      const hasBlankGuard = new RegExp(`\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:==|!=)\\s*blank`).test(expr);
      if (!hasBlankGuard) {
        const line = getLineNumber(text, m.index);
        findings.push({
          severity: 'warn',
          rule: 'HARAVAN_DOTLIQUID_NIL_SIZE',
          location: `${relPath}:${line}`,
          message: `Comparison on '.size' without blank guard in '${expr.trim()}'. In Haravan DotLiquid, nil.size is false in numeric comparisons. Guard with '${varName} == blank or ${varName}.size < ...' or '${varName} != blank and ...'.`
        });
      }
    }
  }

  // 1d. Direct setting-type="image_picker"
  if (!schemaContext || !schemaContext.delegatedToSettingsAudit) {
    for (const m of text.matchAll(/setting-type=["']image_picker["']/g)) {
      const line = getLineNumber(text, m.index);
      findings.push({
        severity: 'blocker',
        rule: 'editor-attribute',
        location: `${relPath}:${line}`,
        message: 'Attribute setting-type="image_picker" is forbidden in storefront markup. In Haravan F1GENZ, visual editor binding requires setting-type="image".'
      });
    }
  }

  // 1e. location.reload() inside bot detection script in Liquid
  for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const scriptBody = m[1];
    if (/noPS|StartOptimize|Chrome-Lighthouse/i.test(scriptBody) && /location\.reload\s*\(/i.test(scriptBody)) {
      const line = getLineNumber(text, m.index);
      findings.push({
        severity: 'blocker',
        rule: 'BOT_DETECTION_LOCATION_RELOAD',
        location: `${relPath}:${line}`,
        message: 'location.reload() inside noPS / StartOptimize bot detection is forbidden. It destroys Google Search referrer and breaks GA4 channel attribution.'
      });
    }
  }
  // 2. {% continue %}
  for (const m of text.matchAll(/\{%-?\s*continue\s*-?%\}/g)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'HARAVAN_FORBIDDEN_CONTINUE',
      location: `${relPath}:${line}`,
      message: 'Liquid tag {% continue %} causes HTTP 500 error on Haravan template engine. Wrap inner logic with {% unless %} instead.'
    });
  }

  // 3. {% render %}
  for (const m of text.matchAll(/\{%-?\s*render\b/g)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'HARAVAN_FORBIDDEN_RENDER',
      location: `${relPath}:${line}`,
      message: 'Shopify tag {% render %} is not supported on Haravan. Use {% include %} instead.'
    });
  }

  // 4. {% schema %}
  for (const m of text.matchAll(/\{%-?\s*schema\s*-?%\}/g)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'HARAVAN_FORBIDDEN_SCHEMA',
      location: `${relPath}:${line}`,
      message: 'Tag {% schema %} is forbidden on Haravan. Haravan F1GENZ themes use config/settings_schema.json exclusively.'
    });
  }

  // 5. | image_url
  for (const m of text.matchAll(/\|\s*image_url\b/g)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'HARAVAN_FORBIDDEN_IMAGE_URL',
      location: `${relPath}:${line}`,
      message: 'Filter | image_url is Shopify-only. Use | img_url: or | asset_url on Haravan.'
    });
  }

  // 6. link.levels
  for (const m of text.matchAll(/\blink\.levels\b/g)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'HARAVAN_FORBIDDEN_LINK_LEVELS',
      location: `${relPath}:${line}`,
      message: 'Property link.levels is Shopify-only. Haravan link objects use link.links for submenus.'
    });
  }

  // 7. Hard-text settings defaults: delegated to audit-settings-schema.mjs (liquid-hardcoded-fallback)
  if (!schemaContext || !schemaContext.delegatedToSettingsAudit) {
    for (const m of text.matchAll(/(?:settings\.[a-zA-Z0-9_]+|settings\[[^\]]+\])\s*\|\s*default\s*:\s*(['"][^'"]+['"])/g)) {
      const line = getLineNumber(text, m.index);
      findings.push({
        severity: 'blocker',
        rule: 'liquid-hardcoded-fallback',
        location: `${relPath}:${line}`,
        message: `Hard-text fallback ${m[0]} violates Merchant Data Policy. Use '{% if settings.x != blank %}' so merchants can clear the content in Customizer.`
      });
    }
  }

  // 8. Object fallbacks: | default: collections['all'] or blogs.news -> liquid-hardcoded-handle
  for (const m of text.matchAll(/\|\s*default\s*:\s*(?:collections\[['"][^'"]+['"]\]|linklists\[['"][^'"]+['"]\]|blogs\[['"][^'"]+['"]\]|pages\[['"][^'"]+['"]\]|blogs\.[a-zA-Z0-9_]+|collections\.[a-zA-Z0-9_]+)/g)) {
    const line = getLineNumber(text, m.index);
    const loc = `${relPath}:${line}`;
    if (!findings.some((f) => f.rule === 'liquid-hardcoded-handle' && f.location === loc)) {
      findings.push({
        severity: 'blocker',
        rule: 'liquid-hardcoded-handle',
        location: loc,
        message: `Object fallback ${m[0]} leaks junk data when merchant leaves setting blank. Use conditional '{%- if settings.handle != blank -%}' instead.`
      });
    }
  }

  // 8b. Invalid img_url size parameter
  for (const m of text.matchAll(/\|\s*img_url\s*:\s*(['"])([^'"]*)\1/g)) {
    const sizeArg = m[2].trim();
    if (!VALID_HARAVAN_IMG_URL_SIZES.has(sizeArg)) {
      const line = getLineNumber(text, m.index);
      findings.push({
        severity: 'blocker',
        rule: 'HARAVAN_INVALID_IMG_URL_SIZE',
        location: `${relPath}:${line}`,
        message: `Invalid Haravan img_url size '${sizeArg}'. Allowed sizes: ${[...VALID_HARAVAN_IMG_URL_SIZES].join(', ')}.`
      });
    }
  }

  // 9. prefers-reduced-motion in Liquid / inline styles
  for (const m of text.matchAll(/prefers-reduced-motion/gi)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'FORBIDDEN_REDUCED_MOTION',
      location: `${relPath}:${line}`,
      message: 'Workspace policy ban: prefers-reduced-motion style overrides must not be added.'
    });
  }

  // 10. .container combined with another class in HTML
  for (const m of text.matchAll(/class=["']([^"']*\bcontainer\b[^"']*)["']/g)) {
    const cls = m[1].trim();
    const classes = cls.split(/\s+/).filter((c) => c && !c.includes('{') && !c.includes('}'));
    if (classes.includes('container') && classes.length > 1) {
      const line = getLineNumber(text, m.index);
      findings.push({
        severity: 'blocker',
        rule: 'CONTAINER_INVARIANT_VIOLATION',
        location: `${relPath}:${line}`,
        message: `Container invariant violation: .container must stand alone on its own element without sibling classes (${cls}).`
      });
    }
  }

  // 11 & 12. setting-id/setting-type parity and missing settings keys (delegated when audit-settings-schema.mjs runs)
  if (schemaContext && !schemaContext.delegatedToSettingsAudit) {
    if (schemaContext.schemaMap) {
      const regex1 = /setting-id=["']([^"']+)["'][^>]*?setting-type=["']([^"']+)["']/g;
      const regex2 = /setting-type=["']([^"']+)["'][^>]*?setting-id=["']([^"']+)["']/g;

      for (const m of text.matchAll(regex1)) {
        const id = m[1];
        const type = m[2];
        const schemaType = schemaContext.schemaMap.get(id);
        if (schemaType) {
          const expected = schemaType === 'image_picker' ? 'image' : schemaType;
          if (type !== expected) {
            const line = getLineNumber(text, m.index);
            findings.push({
              severity: 'blocker',
              rule: 'editor-attribute',
              location: `${relPath}:${line}`,
              message: `Visual editor binding mismatch for '${id}': markup has setting-type="${type}" but schema defines type "${schemaType}" (expected "${expected}").`
            });
          }
        }
      }

      for (const m of text.matchAll(regex2)) {
        const type = m[1];
        const id = m[2];
        const schemaType = schemaContext.schemaMap.get(id);
        if (schemaType) {
          const expected = schemaType === 'image_picker' ? 'image' : schemaType;
          if (type !== expected) {
            const line = getLineNumber(text, m.index);
            findings.push({
              severity: 'blocker',
              rule: 'editor-attribute',
              location: `${relPath}:${line}`,
              message: `Visual editor binding mismatch for '${id}': markup has setting-type="${type}" but schema defines type "${schemaType}" (expected "${expected}").`
            });
          }
        }
      }
    }

    if (schemaContext.schemaKeys) {
      for (const m of text.matchAll(/(?<!section\.)settings\.([a-zA-Z0-9_]+)/g)) {
        const key = m[1];
        if (schemaContext.schemaKeys.has(key)) continue;

        let isDynamic = false;
        for (const prefix of schemaContext.dynamicPrefixes) {
          if (key.startsWith(prefix)) {
            isDynamic = true;
            break;
          }
        }
        if (/^(?:hero_slide_|home_feature_|footer_col_|testimonial_|banner_)\d+/.test(key)) {
          isDynamic = true;
        }

        if (!isDynamic) {
          const line = getLineNumber(text, m.index);
          findings.push({
            severity: 'blocker',
            rule: 'missing-setting',
            location: `${relPath}:${line}`,
            message: `settings.${key} is used in Liquid but not declared in config/settings_schema.json.`
          });
        }
      }
    }
  }

  // 13. asset_url references to missing assets/
  if (assetSet) {
    for (const m of text.matchAll(/(?:['"]([a-zA-Z0-9_\-\.]+\.(?:css|js|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot))['"]\s*\|\s*asset_url)/g)) {
      const assetName = m[1];
      if (!assetSet.has(assetName) && !assetSet.has(assetName + '.liquid')) {
        const line = getLineNumber(text, m.index);
        findings.push({
          severity: 'blocker',
          rule: 'MISSING_ASSET_FILE',
          location: `${relPath}:${line}`,
          message: `Asset '${assetName}' referenced via asset_url is missing from assets/ directory.`
        });
      }
    }
  }

  // 14. HTML tag balance per file with Liquid tags masked + Liquid block tag balance
  checkHtmlTagBalance(text, relPath, findings);
  checkLiquidBlockAndInteractiveNesting(text, relPath, findings);
}

function checkLiquidBlockAndInteractiveNesting(text, relPath, findings) {
  const noComments = text
    .replace(/\{%[-~]?\s*comment\s*[-~]?%\}[\s\S]*?\{%[-~]?\s*endcomment\s*[-~]?%\}/g, (m) => m.replace(/[^\r\n]/g, ' '))
    .replace(/\{%[-~]?\s*raw\s*[-~]?%\}[\s\S]*?\{%[-~]?\s*endraw\s*[-~]?%\}/g, (m) => m.replace(/[^\r\n]/g, ' '));

  const blockPairs = {
    if: 'endif',
    unless: 'endunless',
    for: 'endfor',
    capture: 'endcapture',
    case: 'endcase',
    form: 'endform',
    paginate: 'endpaginate',
    tablerow: 'endtablerow'
  };
  const closeToOpen = {};
  for (const [o, c] of Object.entries(blockPairs)) closeToOpen[c] = o;

  const stack = [];
  const tagRe = /\{%[-~]?\s*(if|unless|for|capture|case|form|paginate|tablerow|endif|endunless|endfor|endcapture|endcase|endform|endpaginate|endtablerow)\b[^%]*[-~]?%\}/g;
  let m;
  while ((m = tagRe.exec(noComments)) !== null) {
    const kw = m[1];
    const line = getLineNumber(noComments, m.index);
    if (blockPairs[kw]) {
      stack.push({ kw, line });
    } else if (closeToOpen[kw]) {
      const expectedOpen = closeToOpen[kw];
      if (stack.length === 0 || stack[stack.length - 1].kw !== expectedOpen) {
        findings.push({
          severity: 'blocker',
          rule: 'UNBALANCED_LIQUID_TAG',
          location: `${relPath}:${line}`,
          message: `Unexpected '{% ${kw} %}' at line ${line}${stack.length ? ` (top of stack is '{% ${stack[stack.length - 1].kw} %}' opened at line ${stack[stack.length - 1].line})` : ' with no matching open block'}.`
        });
      } else {
        stack.pop();
      }
    }
  }
  for (const unclosed of stack) {
    findings.push({
      severity: 'blocker',
      rule: 'UNBALANCED_LIQUID_TAG',
      location: `${relPath}:${unclosed.line}`,
      message: `Unclosed Liquid block '{% ${unclosed.kw} %}' opened at line ${unclosed.line} (missing '{% ${blockPairs[unclosed.kw]} %}').`
    });
  }

  const maskedHtml = maskLiquidAndComments(text);
  for (const nm of maskedHtml.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const outerTag = nm[1].toLowerCase();
    const innerHtml = nm[2];
    if (/<(?:a|button)\b/i.test(innerHtml)) {
      const line = getLineNumber(maskedHtml, nm.index);
      findings.push({
        severity: 'blocker',
        rule: 'UNBALANCED_LIQUID_TAG',
        location: `${relPath}:${line}`,
        message: `Nested interactive element inside <${outerTag}> (${relPath}:${line}): <a> and <button> must never be nested inside each other.`
      });
    }
  }
}

function checkHtmlTagBalance(text, relPath, findings) {
  const masked = maskLiquidAndComments(text);
  const trackedTags = ['div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'form', 'ul', 'ol', 'table', 'tbody', 'thead', 'tr', 'button', 'select'];
  const tagRegex = /<\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*?)?(\/?)>/g;

  const counts = {};
  for (const t of trackedTags) counts[t] = 0;

  let match;
  while ((match = tagRegex.exec(masked)) !== null) {
    const tag = match[1].toLowerCase();
    const isSelfClosing = match[2] === '/' || ['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'area', 'param', 'col', 'base'].includes(tag);
    if (isSelfClosing || !trackedTags.includes(tag)) continue;

    if (match[0].startsWith('</')) {
      counts[tag] -= 1;
    } else {
      counts[tag] += 1;
    }
  }

  const imbalanced = Object.entries(counts).filter(([, count]) => count !== 0);
  if (imbalanced.length > 0) {
    const details = imbalanced.map(([tag, count]) => `<${tag}> (${count > 0 ? '+' : ''}${count})`).join(', ');
    findings.push({
      severity: 'blocker',
      rule: 'HTML_TAG_BALANCE_ERROR',
      location: `${relPath}:1`,
      message: `HTML tag imbalance in file: ${details}. Verify opening and closing tags.`
    });
  }
}

function checkCssFile(file, root, findings) {
  const text = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(root, file);

  // prefers-reduced-motion
  for (const m of text.matchAll(/prefers-reduced-motion/gi)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'FORBIDDEN_REDUCED_MOTION',
      location: `${relPath}:${line}`,
      message: 'Workspace policy ban: prefers-reduced-motion style overrides must not be added.'
    });
  }

  // Bare body.<theme> input|textarea|select selectors
  for (const m of text.matchAll(/body\.[a-zA-Z0-9_-]+\s+(?:input|textarea|select|label)\b/gi)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'HARAVAN_BARE_BODY_FORM_SELECTOR',
      location: `${relPath}:${line}`,
      message: `Bare selector '${m[0]}' breaks Haravan Admin quick-edit overlay. Scope form inputs to :where(.theme-shell, form-wrapper).`
    });
  }

  // Compound .container classes: .container.row or .container.col
  for (const m of text.matchAll(/\.container\.[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+\.container\b/g)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'CONTAINER_INVARIANT_VIOLATION',
      location: `${relPath}:${line}`,
      message: `Compound selector '${m[0]}' violates container invariant: .container must stand alone on its own element level.`
    });
  }

  // Global scroll-behavior: smooth, CONTAINER_GUTTER_OVERRIDE, and VIEWPORT_UNIT_ALIGNMENT
  const cleanCss = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '));
  const ruleRe = /([^{}@]+)\{([^{}]*)\}/g;
  let ruleMatch;
  while ((ruleMatch = ruleRe.exec(cleanCss)) !== null) {
    const selector = ruleMatch[1].trim();
    const body = ruleMatch[2];
    const line = getLineNumber(cleanCss, ruleMatch.index);

    if (/scroll-behavior\s*:\s*smooth/i.test(body)) {
      const parts = selector.split(',').map((s) => s.trim());
      for (const p of parts) {
        if (/^(?:html|:root|body)$/i.test(p)) {
          findings.push({
            severity: 'blocker',
            rule: 'HARAVAN_GLOBAL_SMOOTH_SCROLL',
            location: `${relPath}:${line}`,
            message: `Global scroll-behavior: smooth on '${p}' causes severe CLS (0.5+) and header jumps on reload. Restrict to 'html:focus-within { scroll-behavior: smooth; }'.`
          });
          break;
        }
      }
    }

    // CONTAINER_GUTTER_OVERRIDE: <parent> .container setting horizontal padding
    const selArms = selector.split(',').map((s) => s.trim());
    for (const arm of selArms) {
      if (/(?:^|\s)[.#a-zA-Z0-9_-][^{},]*\s+\.container\b/.test(arm)) {
        if (/\bpadding(?:-(?:left|right|inline|inline-start|inline-end))?\s*:/i.test(body)) {
          findings.push({
            severity: 'blocker',
            rule: 'CONTAINER_GUTTER_OVERRIDE',
            location: `${relPath}:${line}`,
            message: `Selector '${arm}' overrides .container horizontal padding. Keep a single global gutter token on .container so sections stay aligned.`
          });
          break;
        }
      }
    }

    // VIEWPORT_UNIT_ALIGNMENT: 100vw on in-flow layout (excluding position: fixed overlays/drawers/modals)
    const isFixedOverlay = /\bposition\s*:\s*fixed\b/i.test(body)
      || /(?:^|[^a-zA-Z0-9])(?:modal|drawer|overlay|backdrop|lightbox|popup|toast|offcanvas|float-social)(?:$|[^a-zA-Z0-9])/i.test(selector);
    if (!isFixedOverlay && /\b100vw\b/i.test(body)) {
      if (/(?:width|max-width|min-width|margin(?:-(?:left|right|inline|inline-start|inline-end))?|padding(?:-(?:left|right|inline|inline-start|inline-end))?|left|right|inset-inline)\s*:[^;]*\b100vw\b/i.test(body)) {
        findings.push({
          severity: 'blocker',
          rule: 'VIEWPORT_UNIT_ALIGNMENT',
          location: `${relPath}:${line}`,
          message: `In-flow selector '${selector.replace(/\s+/g, ' ')}' uses '100vw', which includes vertical scrollbar width and causes horizontal overflow/misalignment. Use '100%' or '.container' gutter tokens instead.`
        });
      }
    }
  }

  // MEDIA_QUERY_OVERRIDDEN_BY_BASE: @media (max-width: ...) rule overridden by subsequent top-level base rule in same file
  checkMediaQueryOverriddenByBase(cleanCss, relPath, findings);
}

function extractLayoutProperties(body) {
  const props = new Set();
  const propRe = /(?:^|;)\s*(display|grid-template-columns|flex-direction|width|max-width|padding|padding-inline|padding-left|padding-right|margin|position|font-size)\s*:\s*([^;]+)/gi;
  let m;
  while ((m = propRe.exec(body)) !== null) {
    if (!/!important/i.test(m[2])) {
      props.add(m[1].toLowerCase());
    }
  }
  return props;
}

function checkMediaQueryOverriddenByBase(cleanCss, relPath, findings) {
  const mediaMobileProps = new Map();
  let i = 0;
  const len = cleanCss.length;

  while (i < len) {
    while (i < len && /\s/.test(cleanCss[i])) i += 1;
    if (i >= len) break;

    const braceOpen = cleanCss.indexOf('{', i);
    if (braceOpen === -1) break;
    const header = cleanCss.slice(i, braceOpen).trim();
    const headerLine = getLineNumber(cleanCss, i);

    let depth = 1;
    let pos = braceOpen + 1;
    while (pos < len && depth > 0) {
      if (cleanCss[pos] === '{') depth += 1;
      else if (cleanCss[pos] === '}') depth -= 1;
      pos += 1;
    }
    const blockBody = cleanCss.slice(braceOpen + 1, pos - 1);

    if (/^@media\b/i.test(header) && /max-width/i.test(header)) {
      const innerRuleRe = /([^{}]+)\{([^{}]*)\}/g;
      let im;
      while ((im = innerRuleRe.exec(blockBody)) !== null) {
        const sel = im[1].trim().replace(/\s+/g, ' ');
        const props = extractLayoutProperties(im[2]);
        if (props.size > 0) {
          if (!mediaMobileProps.has(sel)) mediaMobileProps.set(sel, new Set());
          for (const p of props) mediaMobileProps.get(sel).add(p);
        }
      }
    } else if (!header.startsWith('@')) {
      const normSel = header.replace(/\s+/g, ' ');
      if (mediaMobileProps.has(normSel)) {
        const baseProps = extractLayoutProperties(blockBody);
        const overridden = [...baseProps].filter((p) => mediaMobileProps.get(normSel).has(p));
        if (overridden.length > 0) {
          findings.push({
            severity: 'warn',
            rule: 'MEDIA_QUERY_OVERRIDDEN_BY_BASE',
            location: `${relPath}:${headerLine}`,
            message: `Base selector '${normSel}' appears after a '@media (max-width: ...)' block and overrides mobile property(${overridden.join(', ')}) due to equal specificity source order.`
          });
        }
      }
    }
    i = pos;
  }
}

function checkJsFile(file, root, findings) {
  const text = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(root, file);

  // prefers-reduced-motion
  for (const m of text.matchAll(/prefers-reduced-motion/gi)) {
    const line = getLineNumber(text, m.index);
    findings.push({
      severity: 'blocker',
      rule: 'FORBIDDEN_REDUCED_MOTION',
      location: `${relPath}:${line}`,
      message: 'Workspace policy ban: prefers-reduced-motion check/override in JS must not be added.'
    });
  }

  // /cart/add.js sent with items: array payload
  for (const m of text.matchAll(/(?:body|data)\s*:\s*JSON\.stringify\([\s\S]{0,100}?\{\s*items\s*:/g)) {
    const windowStart = Math.max(0, m.index - 500);
    const windowEnd = Math.min(text.length, m.index + 500);
    const surrounding = text.slice(windowStart, windowEnd);
    if (/\/cart\/add\.js|add_cart_url/i.test(surrounding)) {
      const line = getLineNumber(text, m.index);
      findings.push({
        severity: 'blocker',
        rule: 'HARAVAN_CART_ADD_ITEMS_ARRAY',
        location: `${relPath}:${line}`,
        message: 'Haravan /cart/add.js does not accept Shopify-style multi-item payload ({ items: [...] }). Haravan returns 404. Add items sequentially one by one with { id, quantity }.'
      });
    }
  }

  // location.reload() inside noPS / StartOptimize bot detection
  if (/noPS|StartOptimize|Chrome-Lighthouse/i.test(text) && /location\.reload\s*\(/i.test(text)) {
    const match = text.match(/location\.reload\s*\(/);
    const line = match ? getLineNumber(text, match.index) : 1;
    findings.push({
      severity: 'blocker',
      rule: 'BOT_DETECTION_LOCATION_RELOAD',
      location: `${relPath}:${line}`,
      message: 'location.reload() inside noPS / StartOptimize bot detection is forbidden. It destroys Google Search referrer and breaks GA4 channel attribution.'
    });
  }
}

function checkSchemaFile(schemaPath, root, findings) {
  if (!fs.existsSync(schemaPath)) return;
  const relPath = path.relative(root, schemaPath);

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (err) {
    findings.push({
      severity: 'blocker',
      rule: 'SETTINGS_SCHEMA_PARSE_ERROR',
      location: `${relPath}:1`,
      message: `settings_schema.json parse error: ${err.message}`
    });
    return;
  }

  const entityRegex = /&[a-zA-Z0-9#]+;/g;

  if (Array.isArray(schema)) {
    for (const section of schema) {
      for (const s of (section.settings || [])) {
        if (typeof s.default === 'string' && entityRegex.test(s.default)) {
          findings.push({
            severity: 'blocker',
            rule: 'SCHEMA_HTML_ENTITY_IN_DEFAULT',
            location: `${relPath}:setting-${s.id || 'unknown'}`,
            message: `HTML entity found in schema default for '${s.id}': "${s.default}". Use literal UTF-8 character (e.g. '•') instead to avoid raw entity output when template applies | escape.`
          });
        }
      }
    }
  }
}

function buildSchemaContext(root) {
  const schemaPath = path.join(root, 'config', 'settings_schema.json');
  const schemaMap = new Map();
  const schemaKeys = new Set();
  const dynamicPrefixes = new Set();

  if (fs.existsSync(schemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      if (Array.isArray(schema)) {
        for (const section of schema) {
          for (const s of (section.settings || [])) {
            if (s.id) {
              schemaKeys.add(s.id);
              schemaMap.set(s.id, s.type || 'text');
            }
          }
        }
      }
    } catch {}
  }

  // Scan liquid files for capture patterns to discover dynamic key prefixes
  const liquidFiles = walkTheme(root, {
    dirs: ['layout', 'snippets', 'templates', 'sections'],
    ext: /\.liquid$/i
  });

  for (const file of liquidFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\{%-?\s*capture\s+([a-zA-Z0-9_]+)\s*-?%\}([\s\S]*?)\{%-?\s*endcapture\s*-?%\}/g)) {
      const body = m[2].trim();
      if (/\{\{[^}]+\}\}/.test(body)) {
        const prefixMatch = body.match(/^([a-zA-Z0-9_]+?)(?:\{\{[^}]+\}\})/);
        if (prefixMatch) {
          dynamicPrefixes.add(prefixMatch[1]);
        }
      }
    }
  }

  return { schemaMap, schemaKeys, dynamicPrefixes };
}

function buildAssetSet(root) {
  const assetDir = path.join(root, 'assets');
  const assetSet = new Set();
  if (fs.existsSync(assetDir)) {
    for (const ent of fs.readdirSync(assetDir, { withFileTypes: true })) {
      if (ent.isFile()) {
        assetSet.add(ent.name);
      }
    }
  }
  return assetSet;
}

function findUnscopedForms(text) {
  const unscoped = [];
  const tagRe = /\{%-?\s*(capture\s+([a-zA-Z0-9_]+)|endcapture|for\b|endfor\b|form\b)[^%]*-?%\}/g;
  let openCapture = null;
  let loopDepth = 0;
  for (const m of text.matchAll(tagRe)) {
    if (m[2]) {
      openCapture = m[2];
    } else if (m[1] === 'endcapture') {
      openCapture = null;
    } else if (m[1] === 'for') {
      loopDepth += 1;
    } else if (m[1] === 'endfor') {
      loopDepth = Math.max(0, loopDepth - 1);
    } else {
      const output = openCapture === null ? null : text.match(new RegExp(
        `\\{\\{-?\\s*${openCapture}\\s*\\|[^}]*replace:\\s*['"](recaptchaElm|<script)['"]\\s*,\\s*(['"]?)`
      ));
      // A fixed replacement name inside a loop is declared again on every iteration.
      const scoped = output !== null && (output[1] === '<script' || loopDepth === 0 || output[2] === '');
      if (!scoped) unscoped.push({ line: getLineNumber(text, m.index), inLoop: loopDepth > 0 });
    }
  }
  return unscoped;
}

function runHaravanLint(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const findings = [];

  const schemaContext = buildSchemaContext(root);
  const assetSet = buildAssetSet(root);

  const schemaFile = path.join(root, 'config', 'settings_schema.json');
  const settingsMode = resolveSettingsMode(root, options.settingsMode).mode;
  const legacySettings = settingsMode === 'legacy';
  const shouldRunSettingsAudit = legacySettings
    || fs.existsSync(schemaFile)
    || Boolean(options.settingsAuditScript)
    || Boolean(process.env.HARAVAN_SETTINGS_AUDIT);

  if (shouldRunSettingsAudit) {
    if (!legacySettings) checkSchemaFile(schemaFile, root, findings);
    const hasParseError = findings.some((f) => f.rule === 'SETTINGS_SCHEMA_PARSE_ERROR');
    if (legacySettings || (!hasParseError && fs.existsSync(schemaFile))) {
      const auditRes = runSettingsSchemaAudit(root, { scriptPath: options.settingsAuditScript, settingsMode });
      schemaContext.delegatedToSettingsAudit = true;
      for (const err of auditRes.errors) {
        findings.push({
          severity: 'blocker',
          rule: err.rule,
          location: err.line ? `${err.file}:${err.line}` : (err.file || 'config/settings_schema.json'),
          message: err.message
        });
      }
      for (const warn of auditRes.warnings) {
        findings.push({
          severity: 'warn',
          rule: warn.rule,
          location: warn.line ? `${warn.file}:${warn.line}` : (warn.file || 'config/settings_schema.json'),
          message: warn.message
        });
      }
    } else if (!fs.existsSync(schemaFile) && (options.settingsAuditScript || process.env.HARAVAN_SETTINGS_AUDIT)) {
      runSettingsSchemaAudit(root, { scriptPath: options.settingsAuditScript });
    }
  }
  // Check liquid files
  const liquidFiles = walkTheme(root, {
    dirs: ['layout', 'snippets', 'templates', 'sections'],
    ext: /\.(liquid|html)$/i
  });
  const unscopedForms = [];
  for (const file of liquidFiles) {
    checkLiquidFile(file, root, findings, schemaContext, assetSet);
    const relPath = path.relative(root, file);
    const shared = /^(layout|snippets)[\\/]/.test(relPath);
    for (const form of findUnscopedForms(fs.readFileSync(file, 'utf8'))) {
      unscopedForms.push({ ...form, relPath, shared });
    }
  }
  // One request renders one template, so default-named forms collide only when they
  // share a file, repeat in a loop, or one of them sits in a layout/snippet that can
  // render beside any other.
  const perFile = new Map();
  for (const form of unscopedForms) perFile.set(form.relPath, (perFile.get(form.relPath) || 0) + 1);
  const anyShared = unscopedForms.some((form) => form.shared);
  for (const form of unscopedForms) {
    const reason = form.inLoop ? 'it sits inside a {% for %} loop, so every iteration declares it again'
      : perFile.get(form.relPath) >= 2 ? 'another form in the same file keeps the default name'
        : anyShared && unscopedForms.length >= 2 ? 'a layout/snippet form that renders on every page keeps the default name too'
          : null;
    if (!reason) continue;
    findings.push({
      severity: 'blocker',
      rule: 'HARAVAN_RECAPTCHA_DUPLICATE_LET',
      location: `${form.relPath}:${form.line}`,
      message: `Haravan injects a top-level <script>let recaptchaElm…</script> into every {% form %}; this form keeps the default name and ${reason}, so the page throws "Identifier 'recaptchaElm' has already been declared" and that form's reCAPTCHA never binds. Wrap the form in {% capture x %}…{% endcapture %} and output {{ x | replace: 'recaptchaElm', '<name>RecaptchaElm' | replace: 'recaptchaForm', '<name>RecaptchaForm' }} (inside a loop, build <name> from the item id).`
    });
  }

  // Check CSS files
  const cssFiles = walkTheme(root, {
    dirs: ['assets'],
    ext: /\.css$/i
  });
  for (const file of cssFiles) {
    checkCssFile(file, root, findings);
  }

  // Check JS files
  const jsFiles = walkTheme(root, {
    dirs: ['assets'],
    ext: /\.js$/i
  });
  for (const file of jsFiles) {
    checkJsFile(file, root, findings);
  }
  // Theme-wide rule checks
  checkThemeWideRules(root, liquidFiles, cssFiles, jsFiles, findings);

  const ctx = buildRegistryContext(root, options);
  if (liquidFiles.length === 0 && cssFiles.length === 0) {
    findings.push({
      severity: 'blocker',
      rule: 'LINT_NO_INPUT',
      location: root,
      message: 'No .liquid and no .css file was found under layout, snippets, templates, sections or assets: nothing was linted. Point --root at the theme root.'
    });
  }
  checkRegistryRules(root, liquidFiles, cssFiles, jsFiles, findings, ctx);
  const waivers = Array.isArray(options.waivers)
    ? registry.parseWaivers(options.waivers, ctx.entries)
    : (options.waivers ? registry.loadWaivers(options.waivers, ctx.entries) : []);
  return applyWaivers(findings, waivers, ctx);
}
function checkThemeWideRules(root, liquidFiles, cssFiles, jsFiles, findings) {
  const cssCorpus = cssFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  // 1. Global [hidden]{display:none !important} OR .x[hidden] rule
  const hasGlobalHiddenReset = /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/i.test(cssCorpus);
  if (!hasGlobalHiddenReset) {
    for (const file of liquidFiles) {
      const text = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(root, file);
      for (const m of text.matchAll(/<([a-zA-Z0-9_-]+)\s+([^>]+)>/gi)) {
        const attrs = m[2];
        const withoutQuoted = attrs.replace(/[a-zA-Z0-9_-]+=["'][^"']*["']/g, '');
        if (/\bhidden\b/i.test(withoutQuoted)) {
          const classMatch = attrs.match(/class=["']([^"']+)["']/i);
          if (classMatch) {
            const classes = classMatch[1].trim().split(/\s+/).filter((c) => c && !c.includes('{') && !c.includes('}'));
            for (const cls of classes) {
              const setsDisplay = new RegExp(`\\.${cls}[^{}]*\\{[^}]*\\bdisplay\\s*:\\s*(?:flex|inline-flex|grid|inline-grid)\\b`, 'i').test(cssCorpus);
              if (setsDisplay) {
                const hasOverride = new RegExp(`(\\b\\[hidden\\]|\\.${cls}\\[hidden\\]|\\[hidden\\]\\.${cls}|\\.${cls}\\.hidden)`, 'i').test(cssCorpus);
                if (!hasOverride) {
                  const line = getLineNumber(text, m.index);
                  findings.push({
                    severity: 'blocker',
                    rule: 'MISSING_HIDDEN_ATTRIBUTE_OVERRIDE',
                    location: `${relPath}:${line}`,
                    message: `Class '.${cls}' defines flex/grid display and is used with the 'hidden' attribute, but lacks a '.${cls}[hidden]' override, and theme CSS lacks global '[hidden] { display: none !important; }'.`
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. .hidden class defined in CSS if class="hidden" or classList.add('hidden') is used
  const hasHiddenClass = /\.hidden\s*\{/i.test(cssCorpus);
  if (!hasHiddenClass) {
    let usedInFile = null;
    for (const file of liquidFiles) {
      const text = fs.readFileSync(file, 'utf8');
      const match = text.match(/class=["'][^"']*\bhidden\b[^"']*["']/i);
      if (match) {
        usedInFile = { relPath: path.relative(root, file), line: getLineNumber(text, match.index) };
        break;
      }
    }
    if (!usedInFile) {
      for (const file of jsFiles) {
        const text = fs.readFileSync(file, 'utf8');
        const match = text.match(/\bclassList\.(?:add|toggle)\(['"]hidden['"]\)/);
        if (match) {
          usedInFile = { relPath: path.relative(root, file), line: getLineNumber(text, match.index) };
          break;
        }
      }
    }
    if (usedInFile) {
      findings.push({
        severity: 'blocker',
        rule: 'MISSING_HIDDEN_CLASS_IN_CSS',
        location: `${usedInFile.relPath}:${usedInFile.line}`,
        message: "Class 'hidden' is used in theme markup/scripts, but '.hidden' is not defined in any CSS file."
      });
    }
  }

  // 3. Stylesheets referenced in layout/snippets and template-specific stylesheet branches
  const headFiles = liquidFiles.filter((f) => {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    return rel.startsWith('layout/') || rel.startsWith('snippets/');
  });
  const headCorpus = headFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  let vendorCss = ['swiper.css', 'aos.css'];
  const contractPath = path.join(root, 'deliverables', 'FULL_REMAKE_CONTRACT.json');
  if (fs.existsSync(contractPath)) {
    try {
      const c = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
      if (Array.isArray(c.allowlists?.vendorCss)) vendorCss = c.allowlists.vendorCss;
    } catch {}
  }

  for (const file of cssFiles) {
    const name = path.basename(file);
    if (vendorCss.includes(name) || /\.min\.css$/i.test(name)) continue;
    if (!headCorpus.includes(name)) {
      findings.push({
        severity: 'blocker',
        rule: 'UNREFERENCED_STYLESHEET',
        location: `assets/${name}:1`,
        message: `Stylesheet 'assets/${name}' is never referenced via asset_url in layout/snippets head loading.`
      });
    }
  }

  // Template-specific stylesheet branches
  for (const file of liquidFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (rel.startsWith('templates/page.')) {
      const suffix = path.basename(file, '.liquid').replace(/^page\./, '');
      const candidates = [`page-${suffix}.css`, `page.${suffix}.css`];
      for (const cand of candidates) {
        if (fs.existsSync(path.join(root, 'assets', cand))) {
          if (!headCorpus.includes(cand) || (!headCorpus.includes(`page.${suffix}`) && !headCorpus.includes(suffix))) {
            findings.push({
              severity: 'blocker',
              rule: 'UNREFERENCED_TEMPLATE_STYLESHEET',
              location: `assets/${cand}:1`,
              message: `Template-specific stylesheet 'assets/${cand}' exists for '${rel}', but is not conditionally branched in layout/snippets head loading.`
            });
          }
        }
      }
    }
  }

  // 4. ThemeUtils.<fn>() / window.<Theme>.<fn>() called in assets must be defined in assets
  const definedMethods = new Set();
  for (const file of jsFiles) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/(?:window\.)?ThemeUtils\.([a-zA-Z0-9_$]+)\s*=/g)) {
      definedMethods.add(m[1]);
    }
    for (const m of code.matchAll(/window\.[A-Z][a-zA-Z0-9_$]*\.([a-zA-Z0-9_$]+)\s*=/g)) {
      definedMethods.add(m[1]);
    }
    const tuStart = code.search(/(?:const|var|let)\s+(?:window\.)?ThemeUtils\s*=\s*\{/);
    if (tuStart !== -1) {
      let braceCount = 0;
      let started = false;
      let tuBlock = '';
      for (let i = tuStart; i < code.length; i += 1) {
        if (code[i] === '{') {
          braceCount += 1;
          started = true;
        } else if (code[i] === '}') {
          braceCount -= 1;
          if (started && braceCount === 0) {
            tuBlock = code.slice(tuStart, i + 1);
            break;
          }
        }
      }
      for (const m of tuBlock.matchAll(/([a-zA-Z0-9_$]+)\s*:\s*(?:async\s+)?function\b/g)) {
        definedMethods.add(m[1]);
      }
      for (const m of tuBlock.matchAll(/^\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/gm)) {
        definedMethods.add(m[1]);
      }
    }
  }

  for (const file of jsFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(root, file);
    const lines = code.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const m of line.matchAll(/(?:window\.)?ThemeUtils\.([a-zA-Z0-9_$]+)\s*\(/g)) {
        const fn = m[1];
        if (!definedMethods.has(fn)) {
          findings.push({
            severity: 'blocker',
            rule: 'UNDEFINED_THEME_UTIL_FUNCTION',
            location: `${relPath}:${idx + 1}`,
            message: `Method 'ThemeUtils.${fn}()' is called, but '${fn}' is never defined on ThemeUtils anywhere in assets JS files.`
          });
        }
      }
    });
  }

  // 5. Snippet included in layout/theme.liquid is not included again in templates
  const themeLiquidPath = path.join(root, 'layout', 'theme.liquid');
  if (fs.existsSync(themeLiquidPath)) {
    const themeLiquidText = fs.readFileSync(themeLiquidPath, 'utf8');
    const layoutSnippets = new Set(
      [...themeLiquidText.matchAll(/\{%-?\s*include\s+['"]([a-zA-Z0-9_-]+)['"]/g)].map((m) => m[1])
    );

    const templateFiles = liquidFiles.filter((f) => {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      return rel.startsWith('templates/');
    });

    for (const file of templateFiles) {
      const text = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(root, file);
      for (const m of text.matchAll(/\{%-?\s*include\s+['"]([a-zA-Z0-9_-]+)['"]/g)) {
        const snip = m[1];
        if (layoutSnippets.has(snip) && snip !== 'icon') {
          const line = getLineNumber(text, m.index);
          findings.push({
            severity: 'blocker',
            rule: 'DUPLICATE_GLOBAL_SNIPPET_INCLUDE',
            location: `${relPath}:${line}`,
            message: `Snippet '${snip}' is already globally included in layout/theme.liquid. Including it again in '${relPath}' causes duplicate scripts, reCAPTCHA declarations, and ID collisions.`
          });
        }
      }
    }
  }

  // 6. CROSS_TEMPLATE_CSS_MISSING & UNSTYLED_CLASS (WARN)
  checkCrossTemplateAndUnstyledClasses(root, liquidFiles, cssFiles, findings);

  // 7. ICON_MISSING_FROM_SPRITE
  checkIconsAgainstSprite(root, liquidFiles, findings);

  // 8. CUSTOM_ELEMENT_INLINE_ROOT
  checkCustomElementsDisplay(root, liquidFiles, cssCorpus, findings);

  // 9. INLINE_STATIC_TOKEN_OVERRIDE
  checkInlineStaticTokenOverrides(root, liquidFiles, cssCorpus, findings);

  // 10. Static T5-05 JS/DOM checks (querySelector on [data-action], cart badge dataset.count)
  checkStaticDomInteractionPatterns(root, liquidFiles, jsFiles, findings);
}

function extractCssClassesFromText(cssText) {
  const classes = new Set();
  const noComments = cssText.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const ruleRe = /([^{}@]+)\{[^{}]*\}/g;
  let m;
  while ((m = ruleRe.exec(noComments)) !== null) {
    const sel = m[1];
    for (const cm of sel.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)) {
      classes.add(cm[1]);
    }
  }
  return classes;
}

function parseHeadCssScopes(headCorpus, cssFiles) {
  const scopesByCss = new Map();
  for (const file of cssFiles) {
    scopesByCss.set(path.basename(file), new Set());
  }

  const tagOrAssetRe = /\{%[-~]?\s*(if|elsif|else|endif)\b([\s\S]*?)[-~]?%\}|['"]([a-zA-Z0-9_.-]+\.css)['"]\s*\|\s*asset_url/g;
  const condStack = [];
  let m;
  while ((m = tagOrAssetRe.exec(headCorpus)) !== null) {
    if (m[1]) {
      const kw = m[1];
      const cond = m[2] || '';
      if (kw === 'if') {
        condStack.push(cond);
      } else if (kw === 'elsif') {
        if (condStack.length > 0) condStack[condStack.length - 1] = cond;
      } else if (kw === 'else') {
        if (condStack.length > 0) condStack[condStack.length - 1] = '';
      } else if (kw === 'endif') {
        condStack.pop();
      }
    } else if (m[3]) {
      const cssName = m[3];
      if (!scopesByCss.has(cssName)) scopesByCss.set(cssName, new Set());
      const activeTemplateConds = condStack.filter((c) => /\btemplate\b/i.test(c));
      if (activeTemplateConds.length === 0) {
        scopesByCss.get(cssName).add('global');
      } else {
        for (const c of activeTemplateConds) {
          for (const sm of c.matchAll(/['"]([a-zA-Z0-9_.-]+)['"]/g)) {
            const tok = sm[1].toLowerCase();
            scopesByCss.get(cssName).add(tok === 'customers' || tok.startsWith('customer') ? 'customers' : tok);
          }
        }
      }
    }
  }

  const knownFallbackScopes = {
    index: 'index',
    home: 'index',
    product: 'product',
    collection: 'collection',
    cart: 'cart',
    blog: 'blog',
    article: 'article',
    search: 'search',
    account: 'customers',
    customer: 'customers',
    customers: 'customers',
    contact: 'page.contact'
  };

  for (const file of cssFiles) {
    const cssName = path.basename(file);
    const scopes = scopesByCss.get(cssName);
    const base = cssName.replace(/\.css(?:\.liquid)?$/i, '').toLowerCase();
    if (!scopes || scopes.size === 0) {
      if (base.startsWith('page-') || base.startsWith('page.')) {
        scopesByCss.set(cssName, new Set([`page.${base.slice(5)}`]));
      } else if (knownFallbackScopes[base]) {
        scopesByCss.set(cssName, new Set([knownFallbackScopes[base]]));
      } else {
        scopesByCss.set(cssName, new Set(['global']));
      }
    } else if (scopes.has('global') && knownFallbackScopes[base]) {
      if (!/\btemplate\b/i.test(headCorpus)) {
        scopesByCss.set(cssName, new Set([knownFallbackScopes[base]]));
      }
    }
  }

  return scopesByCss;
}

function scopeMatches(cssScope, targetScope) {
  if (cssScope === 'global') return true;
  if (cssScope === targetScope) return true;
  if (targetScope.startsWith(`${cssScope}.`)) return true;
  if (cssScope === 'page' && targetScope.startsWith('page')) return true;
  if (cssScope === 'customers' && targetScope.startsWith('customer')) return true;
  if (targetScope === 'customers' && cssScope.startsWith('customer')) return true;
  return false;
}

function buildLiquidRouteScopes(root, liquidFiles) {
  const snippetIncludes = new Map();
  for (const file of liquidFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (rel.startsWith('snippets/')) {
      const snipName = path.basename(rel, '.liquid');
      const txt = fs.readFileSync(file, 'utf8');
      const children = new Set();
      for (const m of txt.matchAll(/\{%-?\s*include\s+['"]([a-zA-Z0-9_-]+)['"]/g)) {
        children.add(m[1]);
      }
      snippetIncludes.set(snipName, children);
    }
  }

  const snippetScopes = new Map();
  function addScopeToSnippet(snip, scope, visited = new Set()) {
    if (visited.has(snip)) return;
    visited.add(snip);
    if (!snippetScopes.has(snip)) snippetScopes.set(snip, new Set());
    snippetScopes.get(snip).add(scope);
    const children = snippetIncludes.get(snip);
    if (children) {
      for (const child of children) addScopeToSnippet(child, scope, visited);
    }
  }

  const themeLiquidPath = path.join(root, 'layout', 'theme.liquid');
  if (fs.existsSync(themeLiquidPath)) {
    const txt = fs.readFileSync(themeLiquidPath, 'utf8');
    const tagRe = /\{%[-~]?\s*(if|elsif|else|endif)\b([\s\S]*?)[-~]?%\}|\{%-?\s*include\s+['"]([a-zA-Z0-9_-]+)['"]/g;
    const condStack = [];
    let m;
    while ((m = tagRe.exec(txt)) !== null) {
      if (m[1]) {
        const kw = m[1];
        const cond = m[2] || '';
        if (kw === 'if') condStack.push(cond);
        else if (kw === 'elsif' && condStack.length) condStack[condStack.length - 1] = cond;
        else if (kw === 'else' && condStack.length) condStack[condStack.length - 1] = '';
        else if (kw === 'endif') condStack.pop();
      } else if (m[3]) {
        const snip = m[3];
        const activeTpl = condStack.filter((c) => /\btemplate\b/i.test(c));
        if (activeTpl.length === 0) {
          addScopeToSnippet(snip, 'global');
        } else {
          for (const c of activeTpl) {
            for (const sm of c.matchAll(/['"]([a-zA-Z0-9_.-]+)['"]/g)) {
              addScopeToSnippet(snip, sm[1].toLowerCase());
            }
          }
        }
      }
    }
  }

  for (const file of liquidFiles) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (!rel.startsWith('templates/')) continue;
    const rawName = path.basename(rel, '.liquid').toLowerCase();
    const tScope = rawName.startsWith('customers') ? 'customers' : rawName;
    const txt = fs.readFileSync(file, 'utf8');
    for (const m of txt.matchAll(/\{%-?\s*include\s+['"]([a-zA-Z0-9_-]+)['"]/g)) {
      addScopeToSnippet(m[1], tScope);
    }
  }

  return {
    getScopesForFile(relPath) {
      const norm = relPath.replace(/\\/g, '/');
      if (norm.startsWith('layout/')) return new Set(['global']);
      if (norm.startsWith('templates/')) {
        const rawName = path.basename(norm, '.liquid').toLowerCase();
        return new Set([rawName.startsWith('customers') ? 'customers' : rawName]);
      }
      if (norm.startsWith('snippets/')) {
        const snip = path.basename(norm, '.liquid');
        const s = snippetScopes.get(snip);
        if (s && s.size > 0) return s;
      }
      return new Set(['global']);
    }
  };
}

function checkCrossTemplateAndUnstyledClasses(root, liquidFiles, cssFiles, findings) {
  const headFiles = liquidFiles.filter((f) => {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    return rel.startsWith('layout/') || rel.startsWith('snippets/head');
  });
  const headCorpus = headFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const scopesByCss = parseHeadCssScopes(headCorpus, cssFiles);
  const routeScopes = buildLiquidRouteScopes(root, liquidFiles);

  const globalClasses = new Set();
  const allCssClasses = new Set();
  const scopedCssMap = new Map();

  for (const hf of headFiles) {
    const txt = fs.readFileSync(hf, 'utf8');
    for (const sm of txt.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      for (const c of extractCssClassesFromText(sm[1])) {
        globalClasses.add(c);
        allCssClasses.add(c);
      }
    }
  }

  for (const file of cssFiles) {
    const cssName = path.basename(file);
    const classes = extractCssClassesFromText(fs.readFileSync(file, 'utf8'));
    for (const c of classes) allCssClasses.add(c);
    const scopes = scopesByCss.get(cssName) || new Set(['global']);
    if (scopes.has('global')) {
      for (const c of classes) globalClasses.add(c);
    } else {
      scopedCssMap.set(cssName, { scopes, classes });
    }
  }

  const reportedCross = new Set();
  const reportedUnstyled = new Set();

  for (const file of liquidFiles) {
    const relPath = path.relative(root, file);
    const fileScopes = routeScopes.getScopesForFile(relPath);
    const rawText = fs.readFileSync(file, 'utf8');
    const masked = maskLiquidAndComments(rawText);

    for (const m of masked.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
      const classTokens = m[1].trim().split(/\s+/).filter(Boolean);
      const line = getLineNumber(masked, m.index);

      for (const cls of classTokens) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(cls)) continue;
        if (/^(?:js-|is-|has-|swiper|hrv-|no-|lazyload|container$|hidden$|sr-only$|visually-hidden$)/i.test(cls)) continue;

        if (globalClasses.has(cls)) continue;

        const definingFiles = [];
        const coveredCssScopes = [];
        for (const [cssName, info] of scopedCssMap.entries()) {
          if (info.classes.has(cls)) {
            definingFiles.push(cssName);
            for (const s of info.scopes) coveredCssScopes.push(s);
          }
        }

        if (definingFiles.length > 0) {
          const missingOnScopes = [];
          for (const reqScope of fileScopes) {
            if (reqScope === 'global') {
              missingOnScopes.push('global');
            } else {
              const isCovered = coveredCssScopes.some((cs) => scopeMatches(cs, reqScope));
              if (!isCovered) missingOnScopes.push(reqScope);
            }
          }
          if (missingOnScopes.length > 0) {
            const key = `${relPath}:${cls}`;
            if (!reportedCross.has(key)) {
              reportedCross.add(key);
              findings.push({
                severity: 'blocker',
                rule: 'CROSS_TEMPLATE_CSS_MISSING',
                location: `${relPath}:${line}`,
                message: `Class '.${cls}' used in '${relPath}' is only defined in template-scoped stylesheet(s) [${definingFiles.join(', ')}] and missing on [${missingOnScopes.join(', ')}] route(s).`
              });
            }
          }
        } else if (!allCssClasses.has(cls) && /[a-z0-9]+(?:__[a-zA-Z0-9-]+|--[a-zA-Z0-9-]+)/.test(cls)) {
          const key = `${relPath}:${cls}`;
          if (!reportedUnstyled.has(key)) {
            reportedUnstyled.add(key);
            findings.push({
              severity: 'warn',
              rule: 'UNSTYLED_CLASS',
              location: `${relPath}:${line}`,
              message: `BEM class '.${cls}' used in '${relPath}' is not defined in any theme stylesheet.`
            });
          }
        }
      }
    }
  }
}

function checkIconsAgainstSprite(root, liquidFiles, findings) {
  const spriteCandidates = [
    path.join(root, 'snippets', 'icons-sprite.liquid'),
    path.join(root, 'snippets', 'icon.liquid'),
    path.join(root, 'snippets', 'icons.liquid')
  ];
  const existingSprites = spriteCandidates.filter((p) => fs.existsSync(p));
  if (existingSprites.length === 0) return;

  const definedIcons = new Set();
  for (const sp of existingSprites) {
    const txt = fs.readFileSync(sp, 'utf8');
    for (const m of txt.matchAll(/\bid\s*=\s*["'](?:icon-)?([a-zA-Z0-9_-]+)["']/gi)) {
      definedIcons.add(m[1]);
    }
    for (const m of txt.matchAll(/\{%-?\s*when\s+['"]([^'"]+)['"]/g)) {
      for (const part of m[1].split(/\s+or\s+|,/)) {
        const clean = part.replace(/['"\s]/g, '');
        if (clean) definedIcons.add(clean);
      }
    }
  }
  if (definedIcons.size === 0) return;

  for (const file of liquidFiles) {
    const relPath = path.relative(root, file);
    const txt = fs.readFileSync(file, 'utf8');

    for (const m of txt.matchAll(/\{%-?\s*include\s+['"](?:icon|icons-sprite|icons)['"][^%]*?\b(?:name|icon)\s*:\s*['"]([a-zA-Z0-9_-]+)['"]/g)) {
      const iconName = m[1].replace(/^icon-/, '');
      if (!definedIcons.has(iconName) && !definedIcons.has(`icon-${iconName}`)) {
        const line = getLineNumber(txt, m.index);
        findings.push({
          severity: 'blocker',
          rule: 'ICON_MISSING_FROM_SPRITE',
          location: `${relPath}:${line}`,
          message: `Icon '${m[1]}' referenced in '${relPath}' is missing from icon sprite (${existingSprites.map((p) => path.basename(p)).join(', ')}).`
        });
      }
    }

    for (const m of txt.matchAll(/<use\b[^>]*?(?:xlink:)?href\s*=\s*["']#icon-([a-zA-Z0-9_-]+)["']/gi)) {
      const iconName = m[1];
      if (!definedIcons.has(iconName) && !definedIcons.has(`icon-${iconName}`)) {
        const line = getLineNumber(txt, m.index);
        findings.push({
          severity: 'blocker',
          rule: 'ICON_MISSING_FROM_SPRITE',
          location: `${relPath}:${line}`,
          message: `SVG sprite reference '#icon-${iconName}' in '${relPath}' is missing from icon sprite.`
        });
      }
    }
  }
}

const IGNORED_CUSTOM_TAG_NAMES = new Set([
  'font-face', 'linear-gradient', 'radial-gradient', 'clip-path', 'text-path', 'color-profile', 'missing-glyph'
]);

function collectCssRuleBlocks(cssText) {
  const blocks = [];
  for (const rm of cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorText = rm[1].trim();
    if (!selectorText || selectorText.startsWith('@')) continue;
    const subjects = selectorText.split(',').map((sel) => {
      const parts = sel.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    }).filter(Boolean);
    blocks.push({ subjects, body: rm[2] });
  }
  return blocks;
}

function compoundTargets(compound, tag, classes) {
  const tagPart = compound.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
  if (tagPart && tagPart[0].toLowerCase() === tag) return true;
  return classes.some((cls) => new RegExp(`\\.${cls}(?![\\w-])`).test(compound));
}

function checkCustomElementsDisplay(root, liquidFiles, cssCorpus, findings) {
  const cleanCss = cssCorpus.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const ruleBlocks = collectCssRuleBlocks(cleanCss);
  const reported = new Set();

  for (const file of liquidFiles) {
    const relPath = path.relative(root, file);
    const masked = maskLiquidAndComments(fs.readFileSync(file, 'utf8'));
    for (const m of masked.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]+)\b([^>]*)>/gi)) {
      const tag = m[1].toLowerCase();
      if (IGNORED_CUSTOM_TAG_NAMES.has(tag)) continue;
      if (reported.has(tag)) continue;

      const attrs = m[2] || '';
      const classMatch = attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i);
      const tagClasses = classMatch ? classMatch[1].trim().split(/\s+/).filter(Boolean) : [];

      const safeClasses = tagClasses.filter((cls) => /^[a-zA-Z0-9_-]+$/.test(cls));
      const subjectBodies = ruleBlocks
        .filter((block) => block.subjects.some((compound) => compoundTargets(compound, tag, safeClasses)))
        .map((block) => block.body);
      const hasDisplay = subjectBodies.some((body) => /\bdisplay\s*:\s*(?!none\b)[a-z-]+/i.test(body));

      if (!hasDisplay) {
        const blockified = subjectBodies.some((body) => /\bposition\s*:\s*(?:fixed|absolute)\b|\bfloat\s*:\s*(?:left|right)\b/i.test(body));
        const boxStyled = subjectBodies.some((body) => /\b(?:margin|padding|border(?:-[a-z]+)?|width|height|min-height|max-width|background(?:-color)?|gap|aspect-ratio)\s*:/i.test(body));
        if (blockified || !boxStyled) continue;

        reported.add(tag);
        const line = getLineNumber(masked, m.index);
        findings.push({
          severity: 'blocker',
          rule: 'CUSTOM_ELEMENT_INLINE_ROOT',
          location: `${relPath}:${line}`,
          message: `Custom element '<${tag}>' has box styles (margin/padding/border/size) but no explicit 'display' rule in CSS; custom elements default to 'display: inline', so those box styles collapse or fragment.`
        });
      }
    }
  }
}

function checkInlineStaticTokenOverrides(root, liquidFiles, cssCorpus, findings) {
  const headDesignFiles = liquidFiles.filter((f) => {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    return rel.startsWith('snippets/head') || rel.startsWith('layout/');
  });
  const cleanCss = cssCorpus.replace(/\/\*[\s\S]*?\*\//g, ' ');

  for (const file of headDesignFiles) {
    const relPath = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    for (const sm of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      const styleContent = sm[1];
      const styleStartOffset = sm.index;
      for (const tm of styleContent.matchAll(/(--[a-z0-9]+-(?:space|gutter|section-space)[a-z0-9_-]*)\s*:\s*([^;}\n]+);/gi)) {
        const tokenName = tm[1];
        const tokenVal = tm[2].trim();
        if (tokenVal.includes('{{') || tokenVal.includes('{%')) continue;
        const definedInCss = new RegExp(`${tokenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(cleanCss);
        if (definedInCss) {
          const line = getLineNumber(text, styleStartOffset + tm.index);
          findings.push({
            severity: 'blocker',
            rule: 'INLINE_STATIC_TOKEN_OVERRIDE',
            location: `${relPath}:${line}`,
            message: `Static spacing/gutter token '${tokenName}: ${tokenVal}' in inline <style> (${relPath}) overrides responsive CSS token definitions in assets/*.css.`
          });
        }
      }
    }
  }
}

function checkStaticDomInteractionPatterns(root, liquidFiles, jsFiles, findings) {
  // Check if singular querySelector('[data-action="..."]') is used when multiple targets exist in Liquid
  const actionCounts = new Map();
  for (const file of liquidFiles) {
    const txt = fs.readFileSync(file, 'utf8');
    for (const m of txt.matchAll(/\bdata-action\s*=\s*["']([^"']+)["']/gi)) {
      const act = m[1].trim();
      actionCounts.set(act, (actionCounts.get(act) || 0) + 1);
    }
  }
  for (const file of jsFiles) {
    const relPath = path.relative(root, file);
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(/\bquerySelector\s*\(\s*['"]\[data-action=["']?([a-zA-Z0-9_-]+)["']?\]['"]\s*\)/g)) {
      const act = m[1];
      if ((actionCounts.get(act) || 0) > 1) {
        const line = getLineNumber(code, m.index);
        findings.push({
          severity: 'warn',
          rule: 'SINGULAR_DATA_ACTION_QUERYSELECTOR',
          location: `${relPath}:${line}`,
          message: `Singular querySelector('[data-action="${act}"]') binds only the first element, but ${actionCounts.get(act)} elements use data-action="${act}" in Liquid. Use querySelectorAll or delegated click handling.`
        });
      }
    }
    for (const m of code.matchAll(/(\w+)\.textContent\s*=\s*([^;\n]+count[^;\n]*);/gi)) {
      const elVar = m[1];
      const windowSlice = code.slice(Math.max(0, m.index - 250), Math.min(code.length, m.index + 350));
      if (/(?:badge|cartcount|countel)/i.test(elVar) && !new RegExp(`dataset\\.count|setAttribute\\(\\s*['"]data-count['"]`, 'i').test(windowSlice)) {
        const line = getLineNumber(code, m.index);
        findings.push({
          severity: 'warn',
          rule: 'BADGE_COUNT_MISSING_DATASET_SYNC',
          location: `${relPath}:${line}`,
          message: `Badge '${elVar}.textContent' is updated without syncing '${elVar}.dataset.count' (or hiding at 0).`
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Registry-backed rules. Severity comes from registry/defect-classes.json (tier);
// thresholds come from registry/thresholds.json plus the contract typeScale.
// ---------------------------------------------------------------------------

const VIETNAMESE_CHAR = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]/;
const GLOBAL_OBJECTS = new Set(['product', 'collection', 'article', 'blog', 'page', 'customer']);
const LIQUID_RESERVED = new Set([
  'settings', 'shop', 'template', 'request', 'cart', 'linklists', 'pages', 'collections', 'blogs', 'forloop',
  'tablerowloop', 'true', 'false', 'nil', 'blank', 'empty', 'and', 'or', 'contains', 'page_title', 'handle',
  'current_page', 'current_tags', 'search', 'paginate', 'customer', 'order', 'checkout', 'comments', 'images',
  'product', 'collection', 'article', 'blog', 'page', 'size', 'first', 'last', 'content_for_header', 'content_for_layout'
]);
const END_BLOCK_TAGS = new Set(['endif', 'endunless', 'endcase', 'endfor', 'endtablerow', 'endcapture']);
const OPEN_BLOCK_TAGS = new Set(['if', 'unless', 'case', 'for', 'tablerow', 'capture']);
const PALETTE_MIN_LITERALS = 3;
const LITERAL_TABLE_MIN_CELLS = 4;

function blankOut(text, re) {
  return text.replace(re, (m) => m.replace(/[^\r\n]/g, ' '));
}

function stripLiquidComments(text) {
  const noComment = blankOut(text, /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g);
  return blankOut(noComment, /\{%-?\s*raw\s*-?%\}[\s\S]*?\{%-?\s*endraw\s*-?%\}/g);
}

function liquidTags(clean) {
  const tags = [];
  for (const m of clean.matchAll(/\{%-?\s*([a-zA-Z_]+)([\s\S]*?)-?%\}/g)) {
    tags.push({ name: m[1].toLowerCase(), args: m[2], index: m.index, end: m.index + m[0].length });
  }
  return tags;
}

// Walks Liquid tags with an open-block stack. The stack reflects the state AFTER the visited tag.
function scanBlocks(clean, onTag, onClose) {
  const stack = [];
  for (const tag of liquidTags(clean)) {
    const n = tag.name;
    if (OPEN_BLOCK_TAGS.has(n)) {
      stack.push({ name: n, cond: tag.args, branch: 'then', conds: [tag.args], index: tag.index });
    } else if (n === 'elsif' || n === 'when') {
      const frame = stack[stack.length - 1];
      if (frame) {
        frame.branch = 'elsif';
        frame.cond = tag.args;
        frame.conds.push(tag.args);
      }
    } else if (n === 'else') {
      const frame = stack[stack.length - 1];
      if (frame) frame.branch = 'else';
    } else if (END_BLOCK_TAGS.has(n)) {
      const frame = stack.pop();
      if (frame && onClose) onClose(frame, tag);
    }
    onTag(tag, stack);
  }
}

function collectAssigned(clean, includeLoopVars = true) {
  const names = new Set();
  for (const tag of liquidTags(clean)) {
    let m = null;
    if (tag.name === 'assign') m = tag.args.match(/^\s*([\w-]+)\s*=/);
    else if (tag.name === 'capture' || tag.name === 'increment' || tag.name === 'decrement') m = tag.args.match(/^\s*([\w-]+)/);
    else if (includeLoopVars && (tag.name === 'for' || tag.name === 'tablerow')) m = tag.args.match(/^\s*([\w-]+)\s+in\b/);
    if (m) names.add(m[1]);
  }
  return names;
}

function settingIdsOf(text) {
  const ids = new Set();
  for (const m of text.matchAll(/\bsettings\s*(?:\.\s*([\w-]+)|\[\s*['"]([\w-]+)['"]\s*\])/g)) ids.add(m[1] || m[2]);
  return ids;
}

function conditionTokens(cond) {
  const bare = cond.replace(/'[^']*'|"[^"]*"/g, ' ');
  return [...bare.matchAll(/(?<![\w.\-\]])([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}

function reportRule(findings, ctx, rule, relPath, line, message, extra = {}) {
  findings.push({ severity: ctx.tierOf(rule), rule, location: `${relPath}:${line}`, message, ...extra });
}

function loadContract(root, options) {
  const given = options.contract;
  if (given && typeof given === 'object') return given;
  const file = typeof given === 'string' ? path.resolve(given) : path.join(root, 'deliverables', 'FULL_REMAKE_CONTRACT.json');
  if (typeof given !== 'string' && !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Contract unreadable at ${file}: ${err.message}`);
  }
}

function buildRegistryContext(root, options) {
  const entries = registry.readRegistry();
  const tiers = new Map();
  for (const entry of entries) for (const id of registry.ruleIdsOf(entry)) tiers.set(id, entry.tier);
  const contract = loadContract(root, options);
  const thresholds = registry.loadThresholds({ contract });
  const mobileRoot = contract && contract.designDefaults ? contract.designDefaults.mobileRootFontPx : undefined;
  if (mobileRoot !== undefined && (typeof mobileRoot !== 'number' || !(mobileRoot > 0))) {
    throw new Error(`Contract designDefaults.mobileRootFontPx must be a positive number (got ${JSON.stringify(mobileRoot)})`);
  }
  return {
    entries,
    thresholds,
    contract,
    mobileRootPx: mobileRoot,
    tierOf(rule) {
      const tier = tiers.get(rule);
      if (!tier) throw new Error(`Lint rule ${rule} is not registered in the defect registry`);
      return tier;
    }
  };
}

// ---- include-global-fallback ------------------------------------------------

function checkIncludeGlobalFallback(relPath, text, findings, ctx) {
  if (!/^snippets\//.test(relPath)) return;
  const clean = stripLiquidComments(text);
  const assigned = collectAssigned(clean);
  const isParam = (name) => Boolean(name) && !assigned.has(name) && !GLOBAL_OBJECTS.has(name) && !LIQUID_RESERVED.has(name);
  const report = (index, message) => reportRule(findings, ctx, 'LIQUID_INCLUDE_GLOBAL_FALLBACK', relPath, getLineNumber(clean, index), message);

  for (const chunk of clean.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g)) {
    const re = /(?<![\w.\-\]'"])([A-Za-z_][\w-]*)\s*\|\s*default\s*:\s*(product|collection|article|blog|page|customer)(?![\w.\[\-])/g;
    for (const m of chunk[0].matchAll(re)) {
      if (!isParam(m[1])) continue;
      report(chunk.index + m.index, `Include parameter '${m[1]}' falls back to the global '${m[2]}' (| default: ${m[2]}): a snippet included without it silently renders the page's own ${m[2]}. Render nothing when the parameter is blank.`);
    }
  }

  const globalAssigned = new Set();
  scanBlocks(clean, (tag, stack) => {
    const top = stack[stack.length - 1];
    if ((tag.name === 'if' || tag.name === 'unless') && top) {
      const m = tag.args.match(/^\s*([\w-]+)\s*==\s*(?:blank|nil|empty)\s*$/);
      if (m && globalAssigned.has(m[1])) top.fallbackFor = m[1];
      return;
    }
    if (tag.name !== 'assign') return;
    const m = tag.args.match(/^\s*([\w-]+)\s*=\s*([\s\S]*)$/);
    if (!m) return;
    const target = m[1];
    const head = m[2].split('|')[0].trim();
    if (GLOBAL_OBJECTS.has(head)) {
      const branch = [...stack].reverse().find((f) => (f.name === 'if' || f.name === 'unless') && (f.branch === 'else' || f.branch === 'elsif'));
      const tested = branch ? branch.conds.flatMap(conditionTokens).find(isParam) : null;
      if (tested) {
        report(tag.index, `'${target}' falls back to the global '${head}' in the else branch of a test on include parameter '${tested}': a snippet included without '${tested}' renders the page's own ${head}.`);
      } else {
        globalAssigned.add(target);
      }
      return;
    }
    const guarded = [...stack].reverse().find((f) => f.fallbackFor === target && f.branch === 'then');
    if (guarded && isParam(head)) {
      report(tag.index, `Include parameter '${head}' is only used when the global assigned to '${target}' is blank: the global shadows the parameter. Assign '${target}' from '${head}' alone.`);
    }
  });
}

// ---- include-scope-leak -----------------------------------------------------

function liquidChunks(clean) {
  const chunks = [];
  for (const m of clean.matchAll(/\{\{([\s\S]*?)\}\}|\{%-?\s*([a-zA-Z_]+)([\s\S]*?)-?%\}/g)) {
    if (m[2] === undefined) chunks.push({ kind: 'out', body: m[1], index: m.index });
    else chunks.push({ kind: 'tag', name: m[2].toLowerCase(), args: m[3], index: m.index });
  }
  return chunks;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkIncludeScopeLeak(liquid, findings, ctx) {
  const snippetAssigned = new Map();
  for (const f of liquid) {
    const m = f.rel.match(/^snippets\/(.+)\.liquid$/);
    if (m) snippetAssigned.set(m[1], collectAssigned(stripLiquidComments(f.text), false));
  }
  for (const f of liquid) {
    const clean = stripLiquidComments(f.text);
    const chunks = liquidChunks(clean);
    const reported = new Set();
    for (let i = 0; i < chunks.length; i += 1) {
      const inc = chunks[i];
      if (inc.kind !== 'tag' || inc.name !== 'include') continue;
      const m = inc.args.match(/^\s*(['"])([^'"]+)\1\s*(?:,([\s\S]*))?$/);
      if (!m || !snippetAssigned.has(m[2])) continue;
      const params = new Set([...(m[3] || '').matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]));
      const before = new Set();
      for (const prev of chunks.slice(0, i)) {
        if (prev.kind !== 'tag') continue;
        const probe = collectAssigned(`{%${prev.name}${prev.args}%}`);
        for (const name of probe) before.add(name);
      }
      const live = new Set([...snippetAssigned.get(m[2])].filter((name) => !params.has(name) && !before.has(name)));
      for (let j = i + 1; j < chunks.length && live.size; j += 1) {
        const c = chunks[j];
        let expr = c.kind === 'out' ? c.body : c.args;
        let assigns = null;
        if (c.kind === 'tag') {
          if (c.name === 'assign') {
            const a = c.args.match(/^\s*([\w-]+)\s*=\s*([\s\S]*)$/);
            if (a) { assigns = a[1]; expr = a[2]; }
          } else if (c.name === 'capture' || c.name === 'increment' || c.name === 'decrement') {
            const a = c.args.match(/^\s*([\w-]+)/);
            assigns = a ? a[1] : null;
            expr = '';
          } else if (c.name === 'for' || c.name === 'tablerow') {
            const a = c.args.match(/^\s*([\w-]+)\s+in\b([\s\S]*)$/);
            if (a) { assigns = a[1]; expr = a[2]; }
          } else if (c.name === 'include') {
            expr = c.args.replace(/^\s*(['"])[^'"]*\1/, ' ').replace(/([\w-]+)\s*:/g, ' ');
          }
        }
        const bare = expr.replace(/'[^']*'|"[^"]*"/g, ' ');
        for (const name of [...live]) {
          if (!new RegExp(`(?<![\\w.\\-])${escapeRegExp(name)}(?![\\w\\-])`).test(bare)) continue;
          live.delete(name);
          const key = `${m[2]}:${name}`;
          if (reported.has(key)) continue;
          reported.add(key);
          reportRule(findings, ctx, 'LIQUID_INCLUDE_SCOPE_LEAK', f.rel, getLineNumber(clean, c.index),
            `'${name}' is assigned inside snippet '${m[2]}' and read here only because include shares scope with its includer; assign it in this file or pass it explicitly.`);
        }
        if (assigns) live.delete(assigns);
      }
    }
  }
}

// ---- scheme-before-img-url --------------------------------------------------

function checkSchemeBeforeImgUrl(relPath, text, findings, ctx) {
  const ldRanges = [];
  for (const m of text.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)) {
    ldRanges.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(/https:\{\{[^}]*\|\s*(?:img_url|product_img_url|asset_url)\b/g)) {
    if (ldRanges.some(([from, to]) => m.index >= from && m.index < to)) continue;
    const tagStart = text.lastIndexOf('<', m.index);
    if (tagStart >= 0) {
      const outputEnd = text.indexOf('}}', m.index + m[0].length);
      const tagEnd = outputEnd >= 0 ? text.indexOf('>', outputEnd) : -1;
      const tag = text.slice(tagStart, tagEnd >= 0 ? tagEnd + 1 : m.index + m[0].length);
      if (/^<meta\b/i.test(tag) && (/\bproperty\s*=\s*["']og:/i.test(tag) || /\bitemprop\s*=\s*["']url["']/i.test(tag))) continue;
    }
    reportRule(findings, ctx, 'LIQUID_SCHEME_BEFORE_IMG_URL', relPath, getLineNumber(text, m.index),
      'https: placed before an img_url/product_img_url/asset_url output: Haravan returns a protocol-relative or absolute CDN URL, so the prefix is redundant and breaks on absolute output. Use the filter output as is (absolute URLs are only required in og:*, itemprop url and ld+json).');
  }
}

// ---- hardcoded-swatch-palette -----------------------------------------------

function checkHardcodedPalette(relPath, text, findings, ctx) {
  const clean = stripLiquidComments(text);
  const counts = new Map();
  scanBlocks(clean, (tag, stack) => {
    if (tag.name !== 'assign') return;
    if (!/^\s*[\w-]+\s*=\s*['"]#[0-9a-fA-F]{3,8}['"]\s*$/.test(tag.args)) return;
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].name === 'if' || stack[i].name === 'unless' || stack[i].name === 'case') {
        counts.set(stack[i], (counts.get(stack[i]) || 0) + 1);
        break;
      }
    }
  }, (frame) => {
    const count = counts.get(frame) || 0;
    if (count >= PALETTE_MIN_LITERALS) {
      reportRule(findings, ctx, 'LIQUID_HARDCODED_PALETTE', relPath, getLineNumber(clean, frame.index),
        `${count} hex colour literals are assigned inside one if/case chain: a colour palette keyed by name must come from a merchant setting (for example a Name:#hex textarea parsed with split), not from literals in Liquid.`);
    }
  });
}

// ---- hardcoded-visible-text (Liquid) ----------------------------------------

function checkLiquidVisibleText(relPath, text, findings, ctx) {
  const clean = stripLiquidComments(text);
  let masked = blankOut(clean, /<!--[\s\S]*?-->/g);
  masked = blankOut(masked, /<script\b[\s\S]*?<\/script>/gi);
  masked = blankOut(masked, /<style\b[\s\S]*?<\/style>/gi);
  masked = blankOut(masked, /\{%[\s\S]*?%\}/g);
  masked = blankOut(masked, /\{\{[\s\S]*?\}\}/g);
  const report = (index, message, kind) => reportRule(findings, ctx, 'LIQUID_HARDCODED_VISIBLE_TEXT', relPath, getLineNumber(clean, index), message, { kind });
  const stack = [];
  const tagRe = /<(\/)?([A-Za-z0-9_-]+)([^>]*)>/g;
  let last = 0;
  const flushText = (end) => {
    const chunk = masked.slice(last, end);
    if (!VIETNAMESE_CHAR.test(chunk) || stack.some((s) => s.bound)) return;
    const snippet = chunk.trim().replace(/\s+/g, ' ');
    if (!snippet) return;
    report(last + chunk.indexOf(snippet[0]), `Hardcoded visible text "${snippet.slice(0, 60)}": merchant-visible strings must come from a schema setting.`, 'text');
  };
  let m;
  while ((m = tagRe.exec(masked)) !== null) {
    flushText(m.index);
    const closing = Boolean(m[1]);
    const tagName = m[2].toLowerCase();
    const attrs = m[3];
    const selfClosing = attrs.trim().endsWith('/') || ['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName);
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === tagName) { stack.splice(i, 1); break; }
      }
    } else {
      const bound = /setting-id\s*=/i.test(attrs);
      if (!bound) {
        for (const a of attrs.matchAll(/\b(aria-label|title|alt|placeholder)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
          const value = a[2] !== undefined ? a[2] : a[3];
          if (/\p{L}{2,}/u.test(value)) {
            report(m.index, `Hardcoded ${a[1].toLowerCase()} "${value.trim().slice(0, 60)}": use a schema setting for the attribute text.`, a[1].toLowerCase());
          }
        }
      }
      if (!selfClosing) stack.push({ tag: tagName, bound });
    }
    last = tagRe.lastIndex;
  }
  flushText(masked.length);

  for (const table of masked.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    let literal = 0;
    for (const cell of table[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)) {
      const shown = cell[1].replace(/<[^>]+>/g, '').trim();
      const original = clean.slice(table.index + cell.index, table.index + cell.index + cell[0].length);
      if (shown && (/\d/.test(shown) || /\p{L}{2,}/u.test(shown)) && !/\{\{|\{%/.test(original)) literal += 1;
    }
    if (literal >= LITERAL_TABLE_MIN_CELLS) {
      report(table.index, `Literal data table (${literal} hardcoded cells): table content must come from a page or schema setting, not Liquid markup.`, 'table');
    }
  }
}

// ---- trigger-without-gated-modal --------------------------------------------

function guardIds(stack) {
  const ids = new Set();
  const tokens = new Set();
  for (const f of stack) {
    if ((f.name === 'if' || f.name === 'unless') && (f.branch === 'then' || f.branch === 'elsif')) {
      for (const id of settingIdsOf(f.cond)) ids.add(id);
      for (const token of conditionTokens(f.cond)) tokens.add(token);
    }
  }
  return { ids, tokens };
}

function analyzeGuards(clean) {
  const events = [];
  const varIds = new Map();
  scanBlocks(clean, (tag, stack) => {
    const guard = guardIds(stack);
    events.push({ end: tag.end, ids: guard.ids, tokens: guard.tokens });
    if (tag.name === 'assign') {
      const m = tag.args.match(/^\s*([\w-]+)\s*=\s*([\s\S]*)$/);
      if (m) {
        const set = varIds.get(m[1]) || new Set();
        for (const id of guard.ids) set.add(id);
        for (const id of settingIdsOf(m[2])) set.add(id);
        varIds.set(m[1], set);
      }
    }
  });
  return {
    idsAt(pos) {
      let hit = null;
      for (const ev of events) {
        if (ev.end <= pos) hit = ev;
        else break;
      }
      const ids = new Set(hit ? hit.ids : []);
      if (hit) {
        for (const token of hit.tokens) {
          for (const id of varIds.get(token) || []) ids.add(id);
        }
      }
      return ids;
    }
  };
}

function leadingGateIds(clean) {
  const tags = liquidTags(clean);
  if (!tags.length || !/^(if|unless)$/.test(tags[0].name) || clean.slice(0, tags[0].index).trim()) return new Set();
  let depth = 0;
  for (const tag of tags) {
    if (OPEN_BLOCK_TAGS.has(tag.name)) depth += 1;
    else if (END_BLOCK_TAGS.has(tag.name)) {
      depth -= 1;
      if (depth === 0) return clean.slice(tag.end).trim() ? new Set() : settingIdsOf(tags[0].args);
    }
  }
  return new Set();
}

function checkTriggerGates(liquid, findings, ctx) {
  const snippetNames = new Set();
  const cleaned = new Map();
  for (const f of liquid) {
    cleaned.set(f.rel, stripLiquidComments(f.text));
    const m = f.rel.match(/^snippets\/(.+)\.liquid$/);
    if (m) snippetNames.add(m[1]);
  }
  const guards = new Map();
  for (const f of liquid) guards.set(f.rel, analyzeGuards(cleaned.get(f.rel)));

  const siteIds = new Map();
  for (const f of liquid) {
    for (const tag of liquidTags(cleaned.get(f.rel))) {
      if (tag.name !== 'include') continue;
      const m = tag.args.match(/^\s*(['"])([^'"]+)\1/);
      if (!m || !snippetNames.has(m[2])) continue;
      const list = siteIds.get(m[2]) || [];
      list.push(guards.get(f.rel).idsAt(tag.end));
      siteIds.set(m[2], list);
    }
  }
  const gates = new Map();
  for (const name of snippetNames) {
    const own = leadingGateIds(cleaned.get(`snippets/${name}.liquid`));
    const sites = siteIds.get(name) || [];
    const shared = sites.length ? [...sites[0]].filter((id) => sites.every((s) => s.has(id))) : [];
    const gate = new Set([...own, ...shared]);
    if (gate.size) gates.set(name, gate);
  }

  for (const f of liquid) {
    const clean = cleaned.get(f.rel);
    const triggers = [];
    for (const m of clean.matchAll(/data-action\s*=\s*["']open-([a-z0-9_-]+)["']/g)) {
      triggers.push({ index: m.index, modal: m[1].endsWith('-modal') ? m[1] : `${m[1]}-modal` });
    }
    for (const m of clean.matchAll(/\bdata-([a-z0-9_-]+)-trigger\b/g)) triggers.push({ index: m.index, modal: `${m[1]}-modal` });
    for (const trigger of triggers) {
      const gate = gates.get(trigger.modal);
      if (!gate || f.rel === `snippets/${trigger.modal}.liquid`) continue;
      const have = guards.get(f.rel).idsAt(trigger.index);
      const missing = [...gate].filter((id) => !have.has(id));
      if (!missing.length) continue;
      reportRule(findings, ctx, 'LIQUID_TRIGGER_WITHOUT_GATE', f.rel, getLineNumber(clean, trigger.index),
        `Trigger for '${trigger.modal}' is not inside the condition that gates the modal (missing settings.${missing.join(', settings.')}): when the modal is off the trigger still renders and opens nothing.`);
    }
  }
}

// ---- icon-stroke-mismatch ---------------------------------------------------

function checkSvgStrokeMismatch(liquid, findings, ctx) {
  const sites = [];
  for (const f of liquid) {
    const clean = stripLiquidComments(f.text);
    for (const m of clean.matchAll(/<(svg|symbol)\b([^>]*)>/gi)) {
      const w = m[2].match(/\bstroke-width\s*=\s*["']([0-9]*\.?[0-9]+)["']/i);
      if (w) sites.push({ rel: f.rel, line: getLineNumber(clean, m.index), width: Number(w[1]) });
    }
  }
  const counts = new Map();
  for (const s of sites) counts.set(s.width, (counts.get(s.width) || 0) + 1);
  if (counts.size < 2) return;
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  for (const s of sites) {
    if (s.width === modal) continue;
    reportRule(findings, ctx, 'SVG_ICON_STROKE_MISMATCH', s.rel, s.line,
      `Icon stroke-width ${s.width} differs from the theme's dominant ${modal}: outline icons must share one stroke weight.`);
  }
}

// ---- CSS rules --------------------------------------------------------------

function parseCssRules(css) {
  const text = blankOut(css, /\/\*[\s\S]*?\*\//g);
  const rules = [];
  const walk = (start, end, media) => {
    let i = start;
    while (i < end) {
      let j = i;
      while (j < end && text[j] !== '{' && text[j] !== ';' && text[j] !== '}') j += 1;
      if (j >= end) break;
      if (text[j] !== '{') { i = j + 1; continue; }
      const prelude = text.slice(i, j).trim();
      let depth = 1;
      let k = j + 1;
      while (k < end && depth > 0) {
        if (text[k] === '{') depth += 1;
        else if (text[k] === '}') depth -= 1;
        k += 1;
      }
      const bodyStart = j + 1;
      const bodyEnd = k - 1;
      const preludeIndex = i + (text.slice(i, j).length - text.slice(i, j).trimStart().length);
      if (prelude.startsWith('@')) {
        const name = (prelude.match(/^@([\w-]+)/) || [])[1];
        if (name && /^(media|supports|layer|container)$/i.test(name)) walk(bodyStart, bodyEnd, `${media} ${prelude}`.trim());
      } else {
        const body = text.slice(bodyStart, bodyEnd).replace(/\{[^{}]*\}/g, (b) => b.replace(/[^\r\n]/g, ' '));
        const decls = [];
        for (const d of body.matchAll(/(?:^|;)\s*(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;]+)/g)) {
          decls.push({ prop: d[1].toLowerCase() === d[1] || d[1].startsWith('--') ? d[1] : d[1].toLowerCase(), value: d[2].trim(), index: bodyStart + d.index + d[0].indexOf(d[1]) });
        }
        rules.push({ selector: prelude, media, index: preludeIndex, decls });
      }
      i = k;
    }
  };
  walk(0, text.length, '');
  return { text, rules };
}

function resolveCssPx(value, defs, remPx, depth = 0) {
  if (depth > 6) return null;
  const v = value.replace(/!important/i, '').trim();
  let m = v.match(/^(-?\d*\.?\d+)px$/i);
  if (m) return Number(m[1]);
  m = v.match(/^(-?\d*\.?\d+)rem$/i);
  if (m) return Number(m[1]) * remPx;
  m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/i);
  if (m) {
    const nums = (defs.get(m[1]) || []).map((d) => resolveCssPx(d, defs, remPx, depth + 1)).filter((n) => n !== null);
    if (nums.length) return Math.min(...nums);
    return m[2] ? resolveCssPx(m[2], defs, remPx, depth + 1) : null;
  }
  m = v.match(/^clamp\(\s*([^,]+),/i);
  if (m) return resolveCssPx(m[1], defs, remPx, depth + 1);
  return null;
}

function resolveRootFontPx(value, defs) {
  const v = value.replace(/!important/i, '').trim();
  const pct = v.match(/^(\d*\.?\d+)%$/);
  if (pct) return (Number(pct[1]) / 100) * 16;
  const em = v.match(/^(\d*\.?\d+)em$/i);
  if (em) return Number(em[1]) * 16;
  return resolveCssPx(v, defs, 16);
}

const OVERLAY_WORD = /(?:modal|dialog|popup|lightbox|drawer|sheet|offcanvas)/i;
const PANEL_SUFFIX = /(?:card|panel|dialog|box|window|inner|container|modal|popup|drawer|sheet)$/i;
const NOT_PANEL = /(?:backdrop|overlay|mask|scrim|close|header|title|body|footer|actions|btn|button|icon|trigger|toggle|content|list|item|text|image|img|form|grid|row|col|tab|nav|badge|label|desc)/i;
const VIEWPORT_UNIT_HEIGHT = /\b\d*\.?\d+(?:vh|dvh|svh|lvh|%)\b|calc\([^)]*(?:vh|dvh|svh|lvh)/i;

function checkCssRegistryRules(root, cssFiles, liquid, jsFiles, findings, ctx) {
  const parsed = cssFiles.map((file) => ({
    rel: path.relative(root, file).replace(/\\/g, '/'),
    ...parseCssRules(fs.readFileSync(file, 'utf8'))
  }));
  const defs = new Map();
  const declared = new Set();
  for (const p of parsed) {
    for (const m of p.text.matchAll(/@property\s+(--[\w-]+)/g)) declared.add(m[1]);
    for (const rule of p.rules) {
      for (const d of rule.decls) {
        if (!d.prop.startsWith('--')) continue;
        declared.add(d.prop);
        defs.set(d.prop, [...(defs.get(d.prop) || []), d.value]);
      }
    }
  }
  for (const f of liquid) for (const m of f.text.matchAll(/(--[\w-]+)\s*:/g)) declared.add(m[1]);
  for (const file of jsFiles) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)) declared.add(m[1]);
  }

  const remPx = ctx.mobileRootPx || 16;
  const minText = ctx.thresholds.minTextPx;
  const overlayGroups = new Map();
  for (const p of parsed) {
    const reportedVars = new Set();
    for (const rule of p.rules) {
      if (/print/i.test(rule.media)) continue;
      for (const d of rule.decls) {
        const dline = getLineNumber(p.text, d.index);
        if (d.prop === 'font-size') {
          const px = resolveCssPx(d.value, defs, remPx);
          if (px !== null && px > 0 && px < minText) {
            reportRule(findings, ctx, 'CSS_FONT_BELOW_MIN', p.rel, dline,
              `font-size ${d.value} resolves to ${Number(px.toFixed(2))}px (rem at the ${remPx}px mobile root), below the ${minText}px text minimum.`);
          }
          const selectors = rule.selector.split(',').map((s) => s.trim());
          if (selectors.some((s) => /^(?::where\()?(?:html|:root)\)?$/i.test(s))) {
            const rootPx = resolveRootFontPx(d.value, defs);
            if (rootPx !== null && rootPx < 16 && rootPx !== ctx.mobileRootPx) {
              reportRule(findings, ctx, 'CSS_ROOT_FONT_SHRINK', p.rel, dline,
                `Root font-size ${d.value} resolves to ${Number(rootPx.toFixed(2))}px: shrinking the root below 16px is only allowed to the contract mobileRootFontPx${ctx.mobileRootPx ? ` (${ctx.mobileRootPx}px)` : ' (none declared)'}.`);
            }
          }
        }
      }
    }
    for (const m of p.text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (declared.has(m[1]) || reportedVars.has(m[1])) continue;
      reportedVars.add(m[1]);
      reportRule(findings, ctx, 'CSS_UNDECLARED_VAR', p.rel, getLineNumber(p.text, m.index),
        `var(${m[1]}) has no fallback and no declaration of ${m[1]} exists in the theme.`);
    }
    for (const rule of p.rules) {
      for (const raw of rule.selector.split(',')) {
        const selector = raw.trim().replace(/\s+/g, ' ');
        const compound = selector.split(/[\s>+~]+/).pop() || '';
        if (compound.includes(':')) continue;
        const classes = [...compound.matchAll(/\.([\w-]+)/g)].map((c) => c[1]);
        const cls = classes[classes.length - 1];
        if (!cls || !OVERLAY_WORD.test(cls)) continue;
        const elem = cls.includes('__') ? cls.split('__').pop() : cls.split('-').pop();
        if (!PANEL_SUFFIX.test(elem) || NOT_PANEL.test(elem)) continue;
        const group = overlayGroups.get(`${p.rel}|${selector}`) || { rel: p.rel, selector, index: rule.index, text: p.text, props: new Map() };
        for (const d of rule.decls) group.props.set(d.prop, d.value);
        overlayGroups.set(`${p.rel}|${selector}`, group);
      }
    }
  }
  for (const group of overlayGroups.values()) {
    const has = (prop) => group.props.has(prop);
    const capped = ['max-height', 'max-block-size'].some((prop) => has(prop) && !/^(none|initial|unset)$/i.test(group.props.get(prop)))
      || (has('height') && VIEWPORT_UNIT_HEIGHT.test(group.props.get('height')))
      || has('inset') || (has('top') && has('bottom'));
    if (capped) continue;
    reportRule(findings, ctx, 'CSS_OVERLAY_NO_VIEWPORT_CAP', group.rel, getLineNumber(group.text, group.index),
      `Overlay panel '${group.selector}' has no viewport bound (max-height, vh/dvh height, or top and bottom): on a short or landscape screen its content is cut off and cannot scroll.`);
  }

  for (const f of liquid) {
    const reportedVars = new Set();
    for (const m of f.text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (declared.has(m[1]) || reportedVars.has(m[1])) continue;
      reportedVars.add(m[1]);
      reportRule(findings, ctx, 'CSS_UNDECLARED_VAR', f.rel, getLineNumber(f.text, m.index),
        `var(${m[1]}) has no fallback and no declaration of ${m[1]} exists in the theme.`);
    }
  }
}

// ---- JS rules ---------------------------------------------------------------

// Returns string/template literals outside comments and regex literals.
function scanJsLiterals(text) {
  const literals = [];
  const n = text.length;
  const keywords = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do']);
  let i = 0;
  let prev = '';
  let word = '';
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      i += 1;
      let value = '';
      while (i < n && text[i] !== c && text[i] !== '\n') {
        if (text[i] === '\\') { value += text[i + 1] || ''; i += 2; continue; }
        value += text[i];
        i += 1;
      }
      i += 1;
      literals.push({ start, end: i, value, quote: c });
      prev = c;
      word = '';
      continue;
    }
    if (c === '`') {
      const start = i;
      i += 1;
      let value = '';
      let depth = 0;
      while (i < n) {
        if (depth === 0 && text[i] === '`') break;
        if (text[i] === '\\') { value += depth === 0 ? (text[i + 1] || '') : ''; i += 2; continue; }
        if (text[i] === '$' && text[i + 1] === '{') { depth += 1; i += 2; continue; }
        if (depth > 0 && text[i] === '{') depth += 1;
        else if (depth > 0 && text[i] === '}') depth -= 1;
        else if (depth === 0) value += text[i];
        i += 1;
      }
      i += 1;
      literals.push({ start, end: i, value, quote: '`' });
      prev = '`';
      word = '';
      continue;
    }
    if (c === '/') {
      const regexAllowed = prev === '' || /[(,=:\[!&|?{};+\-*%<>~^]/.test(prev) || keywords.has(word);
      if (regexAllowed) {
        i += 1;
        let inClass = false;
        while (i < n && text[i] !== '\n') {
          if (text[i] === '\\') { i += 2; continue; }
          if (text[i] === '[') inClass = true;
          else if (text[i] === ']') inClass = false;
          else if (text[i] === '/' && !inClass) break;
          i += 1;
        }
        i += 1;
        while (i < n && /[a-z]/i.test(text[i])) i += 1;
        prev = '/';
        word = '';
        continue;
      }
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      word = /[A-Za-z_$]/.test(c) || word ? word + c : '';
    } else {
      word = '';
    }
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  return literals;
}

function isNonVisibleJsContext(text, lit) {
  const before = text.slice(Math.max(0, lit.start - 80), lit.start);
  const after = text.slice(lit.end, lit.end + 40);
  if (/(?:===?|!==?)\s*$/.test(before) || /^\s*(?:===?|!==?)/.test(after)) return true;
  if (/\.(?:includes|indexOf|lastIndexOf|startsWith|endsWith|has|localeCompare|test|match|split|getAttribute|setAttribute|querySelector|querySelectorAll|closest|matches)\(\s*$/.test(before)) return true;
  if (/\bcase\s+$/.test(before)) return true;
  if (/[{,]\s*$/.test(before) && /^\s*:/.test(after)) return true;
  if (/\[\s*$/.test(before) && /^\s*\]/.test(after)) return true;
  const lineStart = text.lastIndexOf('\n', lit.start) + 1;
  return /\bconsole\.\w+\s*\(/.test(text.slice(lineStart, lit.start));
}

function matchingParen(text, open, literals) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const lit = literals.find((l) => i >= l.start && i < l.end);
    if (lit) { i = lit.end - 1; continue; }
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function checkJsRegistryRules(relPath, text, findings, ctx) {
  const literals = scanJsLiterals(text);
  const report = (rule, index, message) => reportRule(findings, ctx, rule, relPath, getLineNumber(text, index), message);
  const tCalls = [];
  for (const m of text.matchAll(/ThemeUtils\s*\.\s*t\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchingParen(text, open, literals);
    if (close < 0) continue;
    tCalls.push([m.index, close]);
    let depth = 0;
    let hasFallback = false;
    for (let i = open + 1; i < close; i += 1) {
      const lit = literals.find((l) => i >= l.start && i < l.end);
      if (lit) { i = lit.end - 1; continue; }
      if ('([{'.includes(text[i])) depth += 1;
      else if (')]}'.includes(text[i])) depth -= 1;
      else if (text[i] === ',' && depth === 0 && text.slice(i + 1, close).trim()) { hasFallback = true; break; }
    }
    if (hasFallback) {
      report('JS_HARDCODED_VISIBLE_TEXT', m.index, 'ThemeUtils.t(key, fallback) carries a hardcoded fallback: the string must come only from window.themeConfig.strings; ThemeUtils.t(key) returns an empty string when the setting is unset.');
    }
  }
  for (const lit of literals) {
    if (!VIETNAMESE_CHAR.test(lit.value) || isNonVisibleJsContext(text, lit)) continue;
    if (tCalls.some(([from, to]) => lit.start >= from && lit.start <= to)) continue;
    report('JS_HARDCODED_VISIBLE_TEXT', lit.start, `Hardcoded visible text "${lit.value.slice(0, 60)}" in JS: read it from window.themeConfig.strings (schema setting) instead.`);
  }
  const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\r\n]/g, ' '));
  const utc = /\.toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|substr\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/g;
  for (const m of code.matchAll(utc)) {
    report('JS_UTC_DATE_IDIOM', m.index, 'A date-only string derived from toISOString() is the UTC date: before 07:00 in UTC+7 it is yesterday. Build the date from getFullYear/getMonth/getDate.');
  }
}

function checkRegistryRules(root, liquidFiles, cssFiles, jsFiles, findings, ctx) {
  const liquid = liquidFiles.map((file) => ({
    rel: path.relative(root, file).replace(/\\/g, '/'),
    text: fs.readFileSync(file, 'utf8')
  }));
  for (const f of liquid) {
    checkIncludeGlobalFallback(f.rel, f.text, findings, ctx);
    checkSchemeBeforeImgUrl(f.rel, f.text, findings, ctx);
    checkHardcodedPalette(f.rel, f.text, findings, ctx);
    checkLiquidVisibleText(f.rel, f.text, findings, ctx);
  }
  checkIncludeScopeLeak(liquid, findings, ctx);
  checkTriggerGates(liquid, findings, ctx);
  checkSvgStrokeMismatch(liquid, findings, ctx);
  checkCssRegistryRules(root, cssFiles, liquid, jsFiles, findings, ctx);
  for (const file of jsFiles) {
    checkJsRegistryRules(path.relative(root, file).replace(/\\/g, '/'), fs.readFileSync(file, 'utf8'), findings, ctx);
  }
}

function applyWaivers(findings, waivers, ctx) {
  const waived = [];
  if (!waivers || !waivers.length) {
    findings.waived = waived;
    return findings;
  }
  const slugOf = (rule) => registry.slugForRule(ctx.entries, rule);
  const bySlug = new Map();
  for (const w of waivers) {
    if (!bySlug.has(w.rule)) bySlug.set(w.rule, []);
    bySlug.get(w.rule).push(w);
  }
  const kept = [];
  for (const finding of findings) {
    const candidates = bySlug.get(slugOf(finding.rule)) || [];
    const waiver = candidates.find((w) => !w.kinds || w.kinds.includes(finding.kind));
    if (waiver) waived.push({ rule: waiver.rule, reason: waiver.reason, finding });
    else kept.push(finding);
  }
  kept.waived = waived;
  return kept;
}

function summarizeFindings(findings) {
  const counts = {};
  for (const f of findings) {
    counts[f.rule] = (counts[f.rule] || 0) + 1;
  }
  return counts;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    usage();
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    usage();
    process.exitCode = 0;
    return;
  }

  let findings;
  try {
    findings = runHaravanLint(args.root, { waivers: args.waivers, contract: args.contract, settingsMode: args.settingsMode });
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const warns = findings.filter((f) => f.severity === 'warn');
  const ruleCounts = summarizeFindings(findings);

  if (args.json) {
    console.log(JSON.stringify({ findings, blockers, warns, ruleCounts, waived: findings.waived || [] }, null, 2));
    const fail = shouldFail(findings, args.failOn);
    process.exitCode = (fail && !args.dryRun) ? 1 : 0;
    return;
  }

  console.log('# Haravan Theme Lint');
  console.log(`Root: ${args.root}`);
  console.log(`Findings: ${findings.length} (${blockers.length} error/blocker, ${warns.length} warn)`);
  if (findings.waived && findings.waived.length > 0) {
    console.log(`Waived: ${findings.waived.length} (${[...new Set(findings.waived.map((w) => w.rule))].join(', ')})`);
  }

  if (Object.keys(ruleCounts).length > 0) {
    console.log('\n## Rule Summary');
    for (const [rule, count] of Object.entries(ruleCounts)) {
      console.log(`- ${rule}: ${count}`);
    }
  }

  if (findings.length > 0) {
    console.log('\n## Detailed Findings');
    printFindingsTable(findings);
  } else {
    console.log('\nPASS: No Haravan-forbidden syntax or high-frequency theme defects found.');
  }

  const fail = shouldFail(findings, args.failOn);
  if (args.dryRun && findings.length > 0) {
    console.log('\n(dry-run: exit code suppressed)');
    process.exitCode = 0;
    return;
  }

  if (fail) {
    console.log('\nFAIL: Haravan lint failed with blocker findings.');
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runHaravanLint,
  checkLiquidFile,
  checkCssFile,
  checkJsFile,
  checkSchemaFile,
  maskLiquidAndComments,
  checkHtmlTagBalance,
  summarizeFindings
};
