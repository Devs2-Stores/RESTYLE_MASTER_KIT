#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const { readValue, parseCsv, parseFiniteNumber } = require('./lib/cli-args');

const MOJIBAKE_PATTERN = /[\xc2\xc3\xc4\xc6][\x80-\xbf]|\xc4\u2018|\xe1[\xba\xbb]/;
const LIQUID_EXTS = new Set(['.liquid', '.html', '.js', '.css']);
const REQUIRED_DIRS = ['assets', 'config', 'layout', 'snippets', 'templates'];
const TRACKED_KEYS = [
  'STITCH_API_KEY',
  'AIBOX_API_KEY'
];

function parseArgs(argv) {
  const args = {
    theme: '',
    base: '',
    allowMainTheme: false,
    execute: false,
    json: false,
    help: false,
    tokenFile: '',
    maxTokenAgeHours: 24,
    snapshotDir: '',
    viewport: '',
    requiredKeys: [],
    singleWatcher: false,
    processList: '',
    strict: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') {
      args.help = true;
    } else if (v === '--theme' || v === '--root') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) {
        throw new Error(`Missing value for ${v}`);
      }
      args.theme = path.resolve(val);
      i += 1;
    } else if (v === '--base' || v === '--shop') {
      const val = argv[i + 1];
      if (!val || val.startsWith('--')) {
        throw new Error(`Missing value for ${v}`);
      }
      args.base = val.trim();
      i += 1;
    } else if (v === '--allow-main-theme') {
      args.allowMainTheme = true;
    } else if (v === '--execute' || v === '--overnight') {
      args.execute = true;
    } else if (v === '--json') {
      args.json = true;
    } else if (v === '--token-file') {
      args.tokenFile = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--max-token-age-hours') {
      args.maxTokenAgeHours = parseFiniteNumber(readValue(argv, i, v), v);
      i += 1;
    } else if (v === '--snapshot-dir') {
      args.snapshotDir = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--viewport') {
      args.viewport = readValue(argv, i, v);
      i += 1;
    } else if (v === '--require-key') {
      args.requiredKeys = parseCsv(readValue(argv, i, v));
      i += 1;
    } else if (v === '--single-watcher') {
      args.singleWatcher = true;
    } else if (v === '--process-list') {
      args.processList = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--strict') {
      args.strict = true;
    } else {
      throw new Error(`Unknown argument: ${v}`);
    }
  }

  if (!args.theme) {
    args.theme = process.cwd();
  }
  if (args.strict) {
    args.singleWatcher = true;
    if (!args.tokenFile) args.tokenFile = path.join(os.homedir(), '.haravan-cli.json');
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node run_preflight.js [--theme <theme-root>] [--base <shop-url>] [--allow-main-theme] [--json]

Options:
  --theme <path>       Theme root directory (alias: --root). Default: current directory.
  --base <url>         Storefront URL (alias: --shop) for live main-theme role verification.
  --allow-main-theme   Downgrade role='main' blocker to warning when explicitly authorized.
  --json               Output structured findings as JSON.
  --token-file <path>  Check that the Haravan CLI token file is fresh (mtime/expiry only; the CLI is never run). Off unless given or --strict.
  --max-token-age-hours <n>  Token older than this without an expiry field is a blocker (default 24).
  --snapshot-dir <dir> Require a non-empty archive with a .sha256 sibling (rollback snapshot).
  --viewport <WxH>     Require a touch-width QA viewport (<=768px wide), e.g. 375x812.
  --require-key <A,B>  Extra environment keys that must be present.
  --single-watcher     Make more than one 'theme dev' watcher serving this theme root a blocker (default: warning).
                       Watchers are tied to the root by cwd or --root; watchers with neither are reported UNMEASURED, never as a pass.
  --process-list <json> Use this JSON array of { pid, commandLine, cwd } instead of reading the process table (hermetic runs).
  --strict             Shorthand for --single-watcher plus --token-file ~/.haravan-cli.json.
  --help, -h           Show this help message.
`);
}

function checkEnvKey(name, env = process.env, platform = process.platform) {
  if (env[name] && env[name].trim().length > 0) {
    return { name, status: 'present', source: 'process.env' };
  }
  if (platform === 'win32') {
    try {
      const res = execSync(`reg query HKCU\\Environment /v ${name}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (res && res.includes(name)) {
        return { name, status: 'present', source: 'HKCU\\Environment' };
      }
    } catch {
      // not in HKCU
    }
  }
  return { name, status: 'missing', source: 'none' };
}

function resolveWorkspacePreviewUrl(root) {
  const candidates = [
    path.join(root, '.workspace-context.json'),
    path.join(root, 'deliverables', 'FULL_REMAKE_CONTRACT.json'),
    path.join(root, 'FULL_REMAKE_CONTRACT.json')
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const url = parsed.previewUrl || parsed.shop || parsed.storeUrl || parsed.baseUrl || (parsed.preview && parsed.preview.baseUrl) || '';
      if (url && typeof url === 'string' && url.trim()) return url.trim();
    } catch {}
  }
  return '';
}

function checkCliLocalConfig(root, options = {}) {
  const cliLocalPath = path.join(root, '.haravan-cli_local.json');
  if (!fs.existsSync(cliLocalPath)) {
    return {
      exists: false,
      hasShop: false,
      hasOrgId: false,
      hasThemeId: false,
      fields: []
    };
  }
  try {
    const data = JSON.parse(fs.readFileSync(cliLocalPath, 'utf8'));
    const fields = Object.keys(data || {});
    const hasShop = Boolean(data.shop || data.shop_url || data.shop_domain);
    const hasOrgId = Boolean(data.org_id || data.theme_org_id || data.orgId);
    const hasThemeId = Boolean(data.theme_id || data.themeId);
    const shop = data.shop || data.shop_url || data.shop_domain || '';
    const orgId = String(data.org_id || data.theme_org_id || data.orgId || '');
    const themeId = String(data.theme_id || data.themeId || '');
    const role = String(data.role || data.theme_role || '').toLowerCase();
    const resolvedShop = shop || options.base || options.shop || resolveWorkspacePreviewUrl(root) || '';
    return {
      exists: true,
      hasShop,
      hasOrgId,
      hasThemeId,
      shop,
      resolvedShop,
      orgId,
      themeId,
      role,
      fields
    };
  } catch {
    return {
      exists: true,
      hasShop: false,
      hasOrgId: false,
      hasThemeId: false,
      fields: [],
      error: 'Failed to parse JSON'
    };
  }
}

function scanDevWatchers(platform = process.platform) {
  const watchers = [];
  let measured = true;
  if (platform === 'win32') {
    try {
      const psCmd = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'theme\\s+(dev|watch)' -or $_.CommandLine -match 'haravan-theme-ops-cli' -or $_.CommandLine -match 'hrv\\b') -and ($_.CommandLine -notmatch 'powershell') } | ForEach-Object { [string]$_.ProcessId + ' |#| ' + $_.CommandLine }";
      const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const lines = out.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const sepIdx = line.indexOf(' |#| ');
        if (sepIdx !== -1) {
          const pid = parseInt(line.slice(0, sepIdx), 10);
          const commandLine = line.slice(sepIdx + 5).trim();
          if (!isNaN(pid)) watchers.push({ pid, commandLine, command: commandLine });
        } else {
          const pid = parseInt(line, 10);
          if (!isNaN(pid)) watchers.push({ pid, commandLine: '', command: '' });
        }
      }
    } catch {
      measured = false;
    }
  } else {
    try {
      const out = execSync('ps -eo pid,command | grep -E "theme (dev|watch)|hrv" | grep -v grep || true', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const lines = out.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (match) {
          const pid = parseInt(match[1], 10);
          const commandLine = match[2].trim();
          if (isNaN(pid)) continue;
          const watcher = { pid, commandLine };
          try { watcher.cwd = fs.readlinkSync(`/proc/${pid}/cwd`); } catch {}
          watchers.push(watcher);
        }
      }
    } catch {
      measured = false;
    }
  }
  return { measured, watchers };
}

function detectDevWatchers(platform = process.platform) {
  return scanDevWatchers(platform).watchers;
}

function comparablePath(value) {
  const resolved = path.resolve(String(value)).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

const ROOT_FLAG = /(?:^|\s)(?:--root|--theme|--path|--dir|-r)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/g;

function watcherLocations(watcher) {
  const found = [];
  if (watcher.cwd) found.push(watcher.cwd);
  const commandLine = String(watcher.commandLine || watcher.command || '');
  let match;
  ROOT_FLAG.lastIndex = 0;
  while ((match = ROOT_FLAG.exec(commandLine)) !== null) found.push(match[1] || match[2] || match[3]);
  return found;
}

/** Splits theme dev processes by whether they serve `root`; a process with no cwd and no --root cannot be attributed. */
function classifyDevWatchers(watchers, root) {
  const wanted = comparablePath(root);
  const under = (candidate) => {
    const normalized = comparablePath(candidate);
    return normalized === wanted || normalized.startsWith(`${wanted}/`);
  };
  const result = { matching: [], elsewhere: [], unattributed: [] };
  for (const watcher of watchers) {
    const locations = watcherLocations(watcher);
    const mentionsRoot = String(watcher.commandLine || watcher.command || '').replace(/\\/g, '/').toLowerCase().includes(wanted.toLowerCase());
    if (mentionsRoot || locations.some(under)) result.matching.push(watcher);
    else if (locations.length) result.elsewhere.push(watcher);
    else result.unattributed.push(watcher);
  }
  return result;
}

function probePublishedThemeId(shopOrHtml) {
  if (!shopOrHtml) return null;
  if (shopOrHtml.includes('<') || shopOrHtml.includes('theme') || shopOrHtml.includes('{')) {
    const match = shopOrHtml.match(/(?:Haravan|theme|id)[\s\S]{0,50}?(?:id|theme_id)\s*[:=]\s*['"]?(\d{7,12})/i)
      || shopOrHtml.match(/\/themes\/\d+\/(\d+)\//);
    if (match) return match[1];
  }
  const shop = shopOrHtml;
  const shopUrl = shop.startsWith('http') ? shop : `https://${shop}`;
  try {
    const cmd = process.platform === 'win32'
      ? `curl.exe -s -L --max-time 5 "${shopUrl}"`
      : `curl -s -L --max-time 5 "${shopUrl}"`;
    const html = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const match = html.match(/(?:Haravan\.theme\s*=\s*\{[^}]*id\s*:\s*|theme_id\s*=\s*|['"]theme_id['"]\s*:\s*)(\d+)/i);
    if (match) return match[1];
    const matches = [...html.matchAll(/\/themes\/\d+\/(\d+)\//g)].map((m) => m[1]);
    if (matches.length > 0) return matches[0];
  } catch {}
  return null;
}

function scanMojibake(root) {
  const issues = [];
  for (const dirName of REQUIRED_DIRS) {
    const d = path.join(root, dirName);
    if (!fs.existsSync(d)) continue;
    function walk(curr) {
      for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
        const full = path.join(curr, ent.name);
        if (ent.isDirectory()) {
          walk(full);
        } else if (LIQUID_EXTS.has(path.extname(ent.name).toLowerCase())) {
          try {
            const text = fs.readFileSync(full, 'utf8');
            if (MOJIBAKE_PATTERN.test(text)) {
              issues.push(`Possible mojibake: ${path.relative(root, full)}`);
            }
          } catch {}
        }
      }
    }
    walk(d);
  }
  return issues;
}

function checkCatalogIndustryData(root) {
  const candidates = [
    path.join(root, 'THEME_FINGERPRINT.md'),
    path.join(root, 'deliverables', 'THEME_FINGERPRINT.md'),
    path.join(root, 'catalog.json'),
    path.join(root, 'deliverables', 'catalog.json')
  ];
  return candidates.some((c) => fs.existsSync(c));
}

function countThemeFiles(root) {
  let count = 0;
  for (const dirName of REQUIRED_DIRS) {
    const d = path.join(root, dirName);
    if (!fs.existsSync(d)) continue;
    function walk(curr) {
      for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
        if (ent.isDirectory()) walk(path.join(curr, ent.name));
        else count += 1;
      }
    }
    walk(d);
  }
  return count;
}

/** Reads only mtime and an optional expiry field; token values are never read into the report. */
function checkTokenFreshness(tokenFile, options = {}) {
  const maxAgeHours = options.maxAgeHours === undefined ? 24 : options.maxAgeHours;
  const now = options.now === undefined ? Date.now() : options.now;
  let stat;
  try {
    stat = fs.statSync(tokenFile);
  } catch (_) {
    return { status: 'missing', detail: `${tokenFile} not found (log in again before running theme dev)` };
  }
  let expiresAtMs = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    const raw = parsed && (parsed.expires_at ?? parsed.expiresAt ?? parsed.expiry ?? parsed.exp);
    if (typeof raw === 'number') expiresAtMs = raw < 1e12 ? raw * 1000 : raw;
    else if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) expiresAtMs = Date.parse(raw);
  } catch (_) {
    expiresAtMs = null;
  }
  if (expiresAtMs !== null && expiresAtMs <= now) {
    return { status: 'expired', detail: `expiry ${new Date(expiresAtMs).toISOString()} has passed` };
  }
  const ageHours = (now - stat.mtimeMs) / 3600000;
  if (expiresAtMs === null && ageHours > maxAgeHours) {
    return { status: 'stale', detail: `last written ${ageHours.toFixed(1)}h ago (limit ${maxAgeHours}h)` };
  }
  return { status: 'fresh', detail: `written ${ageHours.toFixed(1)}h ago` };
}

function checkSnapshot(snapshotDir) {
  let entries;
  try {
    entries = fs.readdirSync(snapshotDir);
  } catch (_) {
    return { status: 'missing', detail: `${snapshotDir} not found` };
  }
  const archives = entries.filter((name) => /\.(tgz|tar\.gz|zip)$/i.test(name));
  const usable = archives.filter((name) => fs.statSync(path.join(snapshotDir, name)).size > 0);
  if (!usable.length) return { status: 'missing', detail: `no non-empty archive in ${snapshotDir}` };
  const unsummed = usable.filter((name) => !entries.some((other) => other.startsWith(`${name.replace(/\.(tgz|tar\.gz|zip)$/i, '')}`) && /\.sha256$/i.test(other)));
  if (unsummed.length) return { status: 'unverified', detail: `no .sha256 beside: ${unsummed.join(', ')}` };
  return { status: 'present', detail: `${usable.length} archive(s)` };
}

function parseViewport(value) {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(String(value || '').trim());
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function checkViewport(value) {
  const viewport = typeof value === 'string' ? parseViewport(value) : value;
  if (!viewport || !(viewport.width > 0) || !(viewport.height > 0)) {
    return { status: 'invalid', detail: `expected WIDTHxHEIGHT, got ${JSON.stringify(value)}` };
  }
  if (viewport.width > 768) {
    return { status: 'not-touch', detail: `${viewport.width}px is above the 768px touch breakpoint` };
  }
  return { status: 'ok', detail: `${viewport.width}x${viewport.height}` };
}

function runPreflight(themeRoot, options = {}) {
  const root = path.resolve(themeRoot);
  const issues = [];
  const credentials = [];

  // 1. Required directories
  for (const name of REQUIRED_DIRS) {
    if (!fs.existsSync(path.join(root, name))) {
      issues.push(`[blocker] Missing directory: ${name}`);
    }
  }

  // 2. Required files (layout/theme.liquid & settings config)
  const themeLiquid = path.join(root, 'layout', 'theme.liquid');
  if (!fs.existsSync(themeLiquid)) {
    issues.push(`[blocker] Missing required layout: layout/theme.liquid`);
  }

  const settingsSchema = path.join(root, 'config', 'settings_schema.json');
  const settingsHtml = path.join(root, 'config', 'settings.html');
  let settingsType = 'none';
  if (fs.existsSync(settingsSchema)) {
    settingsType = 'F1GENZ (config/settings_schema.json)';
  } else if (fs.existsSync(settingsHtml)) {
    settingsType = 'Legacy (config/settings.html)';
  } else {
    issues.push(`[blocker] Missing settings configuration file: config/settings_schema.json or config/settings.html`);
  }

  // 3. settings_data.json check
  const settingsData = path.join(root, 'config', 'settings_data.json');
  if (!fs.existsSync(settingsData)) {
    issues.push(`[warn] Missing config/settings_data.json — theme settings defaults will be empty on deploy until saved in Customizer`);
  }

  // 4. .haravan-cli_local.json check
  const cliConfig = checkCliLocalConfig(root, options);
  if (!cliConfig.exists) {
    issues.push(`[blocker] Missing .haravan-cli_local.json in theme root (required for shop and theme identity)`);
  } else {
    if (!cliConfig.hasShop) {
      if (cliConfig.hasOrgId && cliConfig.hasThemeId) {
        issues.push(`[warn] .haravan-cli_local.json is missing field: shop (accepted via org_id=${cliConfig.orgId} + theme_id=${cliConfig.themeId})`);
      } else {
        issues.push(`[blocker] .haravan-cli_local.json is missing required field: shop (or org_id)`);
      }
    }
    if (!cliConfig.hasThemeId) {
      issues.push(`[blocker] .haravan-cli_local.json is missing required field: theme_id`);
    } else {
      const probeTarget = cliConfig.shop || cliConfig.resolvedShop || options.base || options.shop || '';
      const publishedId = options.publishedThemeId !== undefined
        ? options.publishedThemeId
        : (probeTarget ? probePublishedThemeId(probeTarget) : null);
      const isMainRole = cliConfig.role === 'main' || (publishedId && String(publishedId) === String(cliConfig.themeId));
      if (isMainRole) {
        const severity = options.allowMainTheme ? '[warn]' : '[blocker]';
        const targetLabel = probeTarget ? ` (currently published on ${probeTarget})` : '';
        issues.push(`${severity} Theme ${cliConfig.themeId} has role 'main'${targetLabel}. Restyle and overnight workflows must target an unpublished draft theme to avoid mutating production (pass --allow-main-theme only with explicit authorization).`);
      } else if (!publishedId) {
        issues.push(`[info] Could not verify theme role via public storefront GET. Please manually verify in Haravan Admin > Website > Themes that theme ${cliConfig.themeId} is an unpublished draft theme, not role 'main'.`);
      }
    }
  }
  // 5. .git repository check
  const hasGit = fs.existsSync(path.join(root, '.git'));
  if (!hasGit) {
    issues.push(`[warn] Theme directory has no .git repository (diff via snapshot instead)`);
  }

  // 6. Credentials check (process.env vs HKCU\Environment)
  for (const key of TRACKED_KEYS) {
    const info = checkEnvKey(key, options.env, options.platform);
    credentials.push(info);
    if (key === 'STITCH_API_KEY' && info.status === 'missing') {
      issues.push(`[warn] STITCH_API_KEY is missing from environment (required for Stitch design generation)`);
    }
    if (key === 'AIBOX_API_KEY' && info.status === 'missing') {
      issues.push(`[warn] AIBOX_API_KEY is missing from environment (required for AI image generation)`);
    }
  }

  // 7. Duplicate hrv theme dev watcher processes
  const scan = options.devWatchersScan
    || (options.devWatchers !== undefined
      ? { measured: true, watchers: options.devWatchers }
      : (options.devPids !== undefined
        ? { measured: true, watchers: options.devPids.map((p) => (typeof p === 'object' ? p : { pid: p, commandLine: '' })) }
        : scanDevWatchers(options.platform)));
  const devWatchers = scan.watchers;
  const devPids = devWatchers.map((w) => w.pid);
  const attribution = classifyDevWatchers(devWatchers, root);
  if (!scan.measured) {
    issues.push('[warn] Single-watcher check UNMEASURED: the process list could not be read (do not assume there is only one theme dev watcher)');
  }
  if (attribution.matching.length > 1) {
    const message = `Duplicate Haravan theme dev watcher processes detected for ${root}: PID(s) ${attribution.matching.map((w) => w.pid).join(', ')} (do not kill automatically; ensure only a single watcher runs to avoid remote write conflicts and API 429/409 errors)`;
    issues.push(options.singleWatcher ? `[blocker] ${message}` : `[warn] ${message}`);
  }
  if (attribution.unattributed.length > 0) {
    issues.push(`[warn] Single-watcher check UNMEASURED for ${attribution.unattributed.length} theme dev process(es) with no cwd or --root, so they cannot be tied to ${root}: PID(s) ${attribution.unattributed.map((w) => w.pid).join(', ')}`);
  }

  // 7b. CLI token freshness (file metadata only; the CLI itself is never invoked)
  if (options.tokenFile) {
    const token = checkTokenFreshness(options.tokenFile, { maxAgeHours: options.maxTokenAgeHours });
    if (token.status !== 'fresh') issues.push(`[blocker] Haravan CLI token ${token.status}: ${token.detail}`);
  }

  // 7c. Rollback snapshot
  if (options.snapshotDir) {
    const snap = checkSnapshot(options.snapshotDir);
    if (snap.status !== 'present') issues.push(`[blocker] Snapshot ${snap.status}: ${snap.detail}`);
  }

  // 7d. QA viewport
  if (options.viewport) {
    const view = checkViewport(options.viewport);
    if (view.status !== 'ok') issues.push(`[blocker] Viewport ${view.status}: ${view.detail}`);
  }

  // 7e. Extra required key list
  for (const key of options.requiredKeys || []) {
    if (checkEnvKey(key, options.env || process.env, options.platform).status === 'missing') {
      issues.push(`[blocker] Required key ${key} is missing from the environment`);
    }
  }

  // 8. Catalog-industry check data
  const hasCatalogData = checkCatalogIndustryData(root);
  if (hasCatalogData) {
    issues.push(`[warn] Catalog-industry check data available: verify shop catalog matches target brand archetype before design generation (run HaravanDemoKit seeding if mismatched)`);
  } else {
    issues.push(`[warn] Catalog-industry check data not yet recorded: verify that shop demo catalog matches target brand industry before generating design`);
  }

  // 9. Mojibake scan
  const mojibake = scanMojibake(root);
  for (const m of mojibake) {
    issues.push(`[blocker] ${m}`);
  }

  // 10. Summary
  const fileCount = countThemeFiles(root);
  const blockers = issues.filter((i) => i.startsWith('[blocker]'));
  const warns = issues.filter((i) => i.startsWith('[warn]'));

  return {
    root,
    fileCount,
    settingsType,
    hasGit,
    cliConfig,
    credentials,
    devPids,
    devWatchers,
    hasCatalogData,
    issues,
    blockers,
    warns,
    pass: blockers.length === 0
  };
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

  let devWatchersScan;
  if (args.processList) {
    try {
      const parsed = JSON.parse(fs.readFileSync(args.processList, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('expected a JSON array of { pid, commandLine, cwd }');
      devWatchersScan = { measured: true, watchers: parsed };
    } catch (err) {
      console.error(`ERROR: cannot read --process-list ${args.processList}: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const result = runPreflight(args.theme, {
    base: args.base,
    allowMainTheme: args.allowMainTheme,
    execute: args.execute,
    tokenFile: args.tokenFile,
    maxTokenAgeHours: args.maxTokenAgeHours,
    snapshotDir: args.snapshotDir,
    viewport: args.viewport,
    requiredKeys: args.requiredKeys,
    singleWatcher: args.singleWatcher,
    devWatchersScan
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.pass ? 0 : 1;
    return;
  }

  console.log('# Haravan Preflight');
  console.log(`Root: ${result.root}`);
  console.log(`Theme files found: ${result.fileCount}`);
  console.log(`Settings configuration: ${result.settingsType}`);
  console.log(`VCS: ${result.hasGit ? 'git repository present' : 'no .git repository (snapshot mode)'}`);

  console.log('\n## API Credentials');
  for (const cred of result.credentials) {
    console.log(`- ${cred.name}: ${cred.status} (source: ${cred.source})`);
  }

  if (result.devWatchers && result.devWatchers.length > 0) {
    console.log(`\n## Dev Watchers`);
    for (const w of result.devWatchers) {
      console.log(`- PID ${w.pid}: ${w.commandLine || '(commandline unavailable)'}`);
    }
  } else if (result.devPids.length > 0) {
    console.log(`\n## Dev Watchers`);
    console.log(`- Active theme dev watcher PIDs: ${result.devPids.join(', ')}`);
  }

  console.log(`\n## Findings: ${result.issues.length} (${result.blockers.length} blocker, ${result.warns.length} warn)`);
  if (result.issues.length) {
    for (const issue of result.issues) {
      console.log(`- ${issue}`);
    }
  } else {
    console.log('- None');
  }

  if (!result.pass) {
    console.log('\nFAIL: blockers must be resolved before proceeding.');
    process.exitCode = 1;
  } else {
    console.log('\nPASS: theme structure looks sane.');
    process.exitCode = 0;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkEnvKey,
  checkCliLocalConfig,
  detectDevWatchers,
  probePublishedThemeId,
  scanMojibake,
  checkCatalogIndustryData,
  runPreflight,
  REQUIRED_DIRS,
  TRACKED_KEYS,
  checkTokenFreshness,
  checkSnapshot,
  checkViewport,
  parseViewport,
  parseArgs,
  scanDevWatchers,
  classifyDevWatchers
};
