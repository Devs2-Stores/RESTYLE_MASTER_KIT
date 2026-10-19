#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readValue, parseFiniteNumber } = require('./lib/cli-args');
const { walkTheme } = require('./lib/theme-walk');

function parseArgs(argv) {
  const args = {
    base: '',
    themeId: '',
    root: '',
    assets: [],
    paths: [],
    changedSince: null,
    markers: [],
    timeout: 120,
    interval: 5,
    help: false
  };

  let pendingRoute = '/';

  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') {
      args.help = true;
    } else if (v === '--base' || v === '--shop') {
      args.base = readValue(argv, i, v);
      i += 1;
    } else if (v === '--theme-id' || v === '--theme') {
      args.themeId = readValue(argv, i, v);
      i += 1;
    } else if (v === '--root') {
      args.root = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--asset') {
      args.assets.push(readValue(argv, i, v));
      i += 1;
    } else if (v === '--changed-since') {
      args.changedSince = parseFiniteNumber(readValue(argv, i, v), v);
      i += 1;
    } else if (v === '--path') {
      pendingRoute = readValue(argv, i, v);
      if (!pendingRoute.startsWith('/')) pendingRoute = '/' + pendingRoute;
      if (!args.paths.includes(pendingRoute)) args.paths.push(pendingRoute);
      i += 1;
    } else if (v === '--marker') {
      const markerText = readValue(argv, i, v);
      args.markers.push({ text: markerText, route: pendingRoute });
      i += 1;
    } else if (v === '--timeout') {
      args.timeout = parseFiniteNumber(readValue(argv, i, v), v);
      i += 1;
    } else if (v === '--interval') {
      args.interval = parseFiniteNumber(readValue(argv, i, v), v);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${v}`);
    }
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node wait_theme_sync.js --base <shopUrl> --theme-id <id> --root <theme> [options]

Options:
  --base <url>              Shop storefront URL (e.g. https://shop.myharavan.com).
  --theme-id <id>           Theme ID for preview query (?themeid=<id>).
  --root <path>             Theme root directory.
  --asset <file>            Asset filename or relative path (repeatable).
  --changed-since <min>     Pick assets modified within the last N minutes.
  --marker <text>           Text marker in rendered HTML to verify Liquid sync.
  --path <route>            Route for subsequent --marker checks (default: /).
  --timeout <sec>           Maximum wait time in seconds (default: 600).
  --interval <sec>          Polling interval in seconds (default: 10).
  --help, -h                Show this help message.

Exit codes:
  0 = remote matches local (all assets and markers synced)
  1 = timeout or mismatch (prints pending items)
  2 = usage error (missing required arguments)
`);
}

function normalizeContent(raw) {
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function themeIdOfUrl(url) {
  const match = String(url || '').match(/\/themes\/\d+\/(\d+)\/\d+\//);
  return match ? match[1] : null;
}

function belongsToTheme(url, themeId) {
  if (!themeId) return true;
  const owner = themeIdOfUrl(url);
  return owner === null || owner === String(themeId);
}

function absolutize(url, base) {
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return (base.startsWith('http:') ? 'http:' : 'https:') + trimmed;
  if (trimmed.startsWith('/')) return base.replace(/\/+$/, '') + trimmed;
  return trimmed;
}

function resolveAssetUrl(html, assetName, base, themeId = '') {
  const escaped = escapeRegex(path.basename(assetName));
  const patterns = [
    new RegExp(`(?:href|src)=["']([^"']*?${escaped}(?:\\?[^"']*)?)["']`, 'gi'),
    new RegExp(`(["'])((?:https?:)?//cdn\\.hstatic\\.net/[^"']*?/${escaped}(?:\\?[^"']*)?)\\1`, 'gi'),
    new RegExp(`((?:https?:)?//cdn\\.hstatic\\.net/[^"'\\s<>()]+?/${escaped}(?:\\?[^"'\\s<>()]*)?)`, 'gi'),
    new RegExp(`(["'])(/[^"']*?/${escaped}(?:\\?[^"']*)?)\\1`, 'gi')
  ];
  for (const pat of patterns) {
    for (const match of String(html || '').matchAll(pat)) {
      const candidate = match[match.length - 1];
      if (candidate && belongsToTheme(candidate, themeId)) return absolutize(candidate, base);
    }
  }
  return null;
}

function readCliTheme(root) {
  if (!root) return {};
  const cliPath = path.join(root, '.haravan-cli_local.json');
  if (!fs.existsSync(cliPath)) return {};
  try {
    const cli = JSON.parse(fs.readFileSync(cliPath, 'utf8'));
    return { orgId: cli.org_id || cli.theme_org_id || cli.orgId, themeId: cli.theme_id || cli.themeId };
  } catch {
    return {};
  }
}

function extractCdnThemeBase(html, base = '', themeId = '', root = '') {
  const text = String(html || '');
  for (const match of text.matchAll(/((?:https?:)?\/\/[^"'\s<>()]+\/themes\/\d+\/\d+\/\d+\/)/gi)) {
    if (belongsToTheme(match[1], themeId)) return absolutize(match[1], base);
  }
  if (base) {
    for (const match of text.matchAll(/(\/themes\/\d+\/\d+\/\d+\/)/gi)) {
      if (belongsToTheme(match[1], themeId)) return base.replace(/\/+$/, '') + match[1];
    }
  }
  const cli = readCliTheme(root);
  const tId = themeId || cli.themeId;
  if (cli.orgId && tId) return `https://cdn.hstatic.net/themes/${cli.orgId}/${tId}/14/`;
  return null;
}

function findRecentSourceFiles(root, minutes) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return walkTheme(root, { dirs: ['config', 'layout', 'snippets', 'templates'] })
    .filter((file) => {
      try {
        return fs.statSync(file).mtimeMs >= cutoff;
      } catch {
        return false;
      }
    })
    .map((file) => path.relative(root, file).replace(/\\/g, '/'));
}

function findRecentAssets(root, minutes) {
  const assetsDir = path.join(root, 'assets');
  if (!fs.existsSync(assetsDir)) return [];
  const cutoff = Date.now() - minutes * 60 * 1000;
  const recent = [];
  for (const ent of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (ent.isFile()) {
      try {
        const stat = fs.statSync(path.join(assetsDir, ent.name));
        if (stat.mtimeMs >= cutoff) {
          recent.push({ name: ent.name, mtimeMs: stat.mtimeMs });
        }
      } catch {}
    }
  }
  recent.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return recent.map((r) => r.name);
}

function findMostRecentAssets(root, limit = 1) {
  const assetsDir = path.join(root, 'assets');
  if (!fs.existsSync(assetsDir)) return [];
  const all = [];
  for (const ent of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (ent.isFile()) {
      try {
        const stat = fs.statSync(path.join(assetsDir, ent.name));
        all.push({ name: ent.name, mtimeMs: stat.mtimeMs });
      } catch {}
    }
  }
  all.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return all.slice(0, limit).map((r) => r.name);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNoStore(url) {
  const sep = url.includes('?') ? '&' : '?';
  const bustUrl = `${url}${sep}_cb=${Date.now()}`;
  const res = await fetch(bustUrl, {
    headers: {
      'Cache-Control': 'no-store, no-cache',
      'Pragma': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RESTYLE_MASTER_KIT wait_theme_sync/1.0'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }
  return await res.text();
}

async function runWaitThemeSync(options) {
  const base = (options.base || options.shop || '').replace(/\/+$/, '');
  const themeId = options.themeId || options.theme_id || '';
  const root = options.root;

  // Resolve assets list
  const rawAssets = Array.isArray(options.assets)
    ? options.assets
    : options.asset
    ? [options.asset]
    : [];
  const assetSet = new Set(rawAssets.map((a) => path.basename(a)));
  if (options.changedSince != null) {
    for (const name of findRecentAssets(root, options.changedSince)) {
      assetSet.add(name);
    }
  }

  let markers = Array.isArray(options.markers) ? [...options.markers] : [];
  if (options.marker) {
    markers.push({ text: options.marker, route: options.path || '/' });
  }

  if (assetSet.size === 0 && options.changedSince == null && markers.length === 0) {
    const recent15 = findRecentAssets(root, 15);
    if (recent15.length > 0) {
      for (const name of recent15) assetSet.add(name);
    } else {
      for (const name of findMostRecentAssets(root, 1)) assetSet.add(name);
    }
  }

  const assetList = Array.from(assetSet);

  if (assetList.length === 0 && markers.length === 0) {
    const changedSource = options.changedSince != null ? findRecentSourceFiles(root, options.changedSince) : [];
    if (changedSource.length > 0) {
      throw new Error(
        `No assets changed in the last ${options.changedSince} min, but ${changedSource.length} non-asset file(s) did ` +
        `(${changedSource.slice(0, 5).join(', ')}). Liquid/config files are rendered, not served as-is: ` +
        'pass --marker "<text the change renders>" --path <route> to wait for them.'
      );
    }
    throw new Error('No targets to wait for. Specify --asset, --changed-since, or --marker.');
  }
  // Pre-load local asset contents
  const localAssets = new Map();
  for (const assetName of assetList) {
    const candidatePaths = [
      path.join(root, 'assets', assetName),
      path.join(root, assetName)
    ];
    let localPath = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        localPath = p;
        break;
      }
    }
    if (!localPath) {
      throw new Error(`Local asset '${assetName}' does not exist under ${root}`);
    }
    const content = fs.readFileSync(localPath, 'utf8');
    const norm = normalizeContent(content);
    localAssets.set(assetName, {
      path: localPath,
      raw: content,
      norm,
      hash: sha256(norm),
      synced: false,
      remoteHash: null,
      lastError: null
    });
  }

  // Markers state
  const markerStates = markers.map((m) => ({
    text: m.text,
    route: m.route || '/',
    synced: false,
    lastError: null
  }));

  const startTime = Date.now();
  const timeoutSec = options.timeout != null ? options.timeout : 120;
  const intervalSec = options.interval != null ? options.interval : 5;
  const timeoutMs = timeoutSec * 1000;
  const intervalMs = Math.max(50, intervalSec * 1000);

  console.log('# Wait Theme Sync');
  console.log(`Base: ${base}`);
  console.log(`Theme ID: ${themeId}`);
  console.log(`Root: ${root}`);
  console.log(`Assets (${assetList.length}): ${assetList.join(', ') || 'none'}`);
  console.log(`Markers (${markerStates.length}): ${markerStates.map((m) => `"${m.text}" @ ${m.route}`).join(', ') || 'none'}`);
  console.log(`Timeout: ${timeoutSec}s, Interval: ${intervalSec}s\n`);

  let iteration = 0;
  const extraPaths = Array.isArray(options.paths) ? options.paths : (options.path ? [options.path] : []);

  while (true) {
    iteration += 1;
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    // Group routes to fetch
    const routesToFetch = new Set(['/']);
    for (const p of extraPaths) {
      if (p) routesToFetch.add(p.startsWith('/') ? p : '/' + p);
    }
    for (const m of markerStates) {
      if (!m.synced) routesToFetch.add(m.route);
    }
    const routeHtmls = new Map();
    for (const route of routesToFetch) {
      const pageUrl = `${base}${route.startsWith('/') ? route : '/' + route}${route.includes('?') ? '&' : '?'}themeid=${themeId}`;
      try {
        const html = await fetchNoStore(pageUrl);
        routeHtmls.set(route, html);
      } catch (err) {
        // Record error for route
        for (const m of markerStates) {
          if (m.route === route && !m.synced) {
            m.lastError = err.message;
          }
        }
      }
    }

    // Check markers
    for (const m of markerStates) {
      if (m.synced) continue;
      const html = routeHtmls.get(m.route);
      if (html && html.includes(m.text)) {
        m.synced = true;
        m.lastError = null;
      } else if (html) {
        m.lastError = `Marker text not present in HTML of ${m.route}`;
      }
    }

    // Check assets
    const rootHtml = routeHtmls.get('/') || '';
    let cdnBase = options.cdnBase || extractCdnThemeBase(rootHtml, base, themeId, root);
    if (!cdnBase) {
      for (const [, html] of routeHtmls) {
        cdnBase = extractCdnThemeBase(html, base, themeId, root);
        if (cdnBase) break;
      }
    }

    for (const [assetName, state] of localAssets.entries()) {
      if (state.synced) continue;

      let assetUrl = resolveAssetUrl(rootHtml, assetName, base, themeId);
      if (!assetUrl) {
        for (const [, html] of routeHtmls) {
          assetUrl = resolveAssetUrl(html, assetName, base, themeId);
          if (assetUrl) break;
        }
      }
      if (!assetUrl && cdnBase) {
        // hstatic keys its year-long cache on ?v=; a bare URL keeps serving the stale copy.
        assetUrl = `${cdnBase.replace(/\/+$/, '/')}${path.basename(assetName)}?v=${Date.now()}`;
      }

      if (!assetUrl) {
        state.lastError = 'Asset URL not found in storefront HTML and CDN base could not be resolved';
        continue;
      }
      try {
        const remoteContent = await fetchNoStore(assetUrl);
        const remoteNorm = normalizeContent(remoteContent);
        state.remoteHash = sha256(remoteNorm);

        if (state.remoteHash === state.hash || remoteNorm === state.norm) {
          state.synced = true;
          state.lastError = null;
        } else {
          state.lastError = `Hash mismatch (local: ${state.hash.slice(0, 8)}, remote: ${state.remoteHash.slice(0, 8)})`;
        }
      } catch (err) {
        state.lastError = err.message;
      }
    }

    // Report per-item status
    const allAssetsSynced = Array.from(localAssets.values()).every((s) => s.synced);
    const allMarkersSynced = markerStates.every((m) => m.synced);

    console.log(`[T+${elapsedSec}s] Check #${iteration}:`);
    for (const [name, state] of localAssets.entries()) {
      const statusLabel = state.synced ? 'SYNCED' : `PENDING (${state.lastError || 'checking...'})`;
      console.log(`  - asset ${name}: ${statusLabel}`);
    }
    for (const m of markerStates) {
      const statusLabel = m.synced ? 'SYNCED' : `PENDING (${m.lastError || 'checking...'})`;
      console.log(`  - marker "${m.text}": ${statusLabel}`);
    }

    if (allAssetsSynced && allMarkersSynced) {
      console.log(`\nPASS: All ${localAssets.size} asset(s) and ${markerStates.length} marker(s) synced in ${elapsedSec}s.`);
      return { ok: true, elapsedSec, assets: Array.from(localAssets.values()), markers: markerStates };
    }

    if (Date.now() - startTime >= timeoutMs) {
      console.error(`\nTIMEOUT: Theme sync did not complete within ${options.timeout}s.`);
      for (const [name, state] of localAssets.entries()) {
        if (!state.synced) {
          console.error(`  - PENDING asset: ${name} (${state.lastError})`);
        }
      }
      for (const m of markerStates) {
        if (!m.synced) {
          console.error(`  - PENDING marker: "${m.text}" @ ${m.route} (${m.lastError})`);
        }
      }
      return { ok: false, elapsedSec, timeout: true, assets: Array.from(localAssets.values()), markers: markerStates };
    }

    await sleep(intervalMs);
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    usage();
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    usage();
    process.exitCode = 0;
    return;
  }

  if (!args.base || !args.themeId || !args.root) {
    console.error('ERROR: --base, --theme-id, and --root are required.');
    usage();
    process.exitCode = 2;
    return;
  }

  try {
    const result = await runWaitThemeSync(args);
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  normalizeContent,
  normalizeText: normalizeContent,
  resolveAssetUrl,
  extractCdnThemeBase,
  findRecentAssets,
  findMostRecentAssets,
  runWaitThemeSync
};
