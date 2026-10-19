#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readValue } = require('./lib/cli-args');
const { extractCdnThemeBase } = require('./wait_theme_sync');
const { runSettingsSchemaAudit } = require('./lib/settings-audit');

function hasGlobChars(str) {
  return /[*?[\]]/.test(String(str || ''));
}

/** Identity of an id-less schema entry (header/paragraph): its type plus visible content. */
function settingSignature(setting) {
  return setting.content !== undefined
    ? `${setting.type}\u0000${setting.content}`
    : JSON.stringify(setting);
}

const STRUCTURAL_DATA_KEYS = new Set(['current', 'presets']);

function findOrphanDataKeys(targetData, schemaIds, isRootObject) {
  return Object.keys(targetData).filter((key) => !schemaIds.has(key) && !(isRootObject && STRUCTURAL_DATA_KEYS.has(key)));
}

function parseArgs(argv) {
  const args = {
    root: path.resolve(process.cwd(), '..'),
    manifest: '',
    assetCdnBase: '',
    storefront: '',
    writeSchema: false,
    writeData: false,
    allowSchemaRemove: false,
    allowSettingsData: false,
    resetSkeleton: false,
    pruneOrphanData: false,
    dryRun: false,
    skipAudit: false,
    backupDir: '',
    key: '',
    maxKeyLoss: 0,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--help' || v === '-h') {
      args.help = true;
    } else if (v === '--root' || v === '--theme') {
      args.root = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--manifest' || v === '--spec') {
      args.manifest = readValue(argv, i, v);
      i += 1;
    } else if (v === '--asset-cdn-base') {
      args.assetCdnBase = readValue(argv, i, v).trim();
      i += 1;
    } else if (v === '--storefront') {
      args.storefront = readValue(argv, i, v).trim();
      i += 1;
    } else if (v === '--write-schema') {
      args.writeSchema = true;
    } else if (v === '--write-data') {
      args.writeData = true;
    } else if (v === '--allow-settings-data') {
      args.writeData = true;
      args.allowSettingsData = true;
    } else if (v === '--reset-skeleton') {
      args.resetSkeleton = true;
    } else if (v === '--prune-orphan-data') {
      args.pruneOrphanData = true;
    } else if (v === '--allow-schema-remove') {
      args.allowSchemaRemove = true;
    } else if (v === '--dry-run') {
      args.dryRun = true;
    } else if (v === '--skip-audit') {
      args.skipAudit = true;
    } else if (v === '--backup-dir') {
      args.backupDir = path.resolve(readValue(argv, i, v));
      i += 1;
    } else if (v === '--key') {
      args.key = readValue(argv, i, v).trim();
      i += 1;
    } else if (v === '--value') {
      const rawValue = readValue(argv, i, v);
      try {
        args.value = JSON.parse(rawValue);
      } catch (err) {
        throw new Error(`--value must be valid JSON (${err.message}); quote strings, e.g. --value "\"Xin chao\""`);
      }
      i += 1;
    } else if (v === '--max-key-loss') {
      args.maxKeyLoss = parseKeyLossLimit(readValue(argv, i, v));
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${v}`);
    }
  }

  return args;
}

function parseKeyLossLimit(raw) {
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`--max-key-loss must be a non-negative integer (got ${raw})`);
  }
  return limit;
}

/** Key paths of settings_data.json: root keys, with the entries of `current` expanded. */
function dataKeyPaths(data) {
  const paths = new Set();
  for (const key of Object.keys(data)) {
    if (key === 'current' && data.current && typeof data.current === 'object' && !Array.isArray(data.current)) {
      for (const inner of Object.keys(data.current)) paths.add(`current.${inner}`);
    } else {
      paths.add(key);
    }
  }
  return paths;
}

function isUnderBackupDir(candidate) {
  let resolved = path.resolve(candidate);
  try { resolved = fs.realpathSync(resolved); } catch (_) {}
  return resolved.split(/[\\/]+/).some((segment) => /backup/i.test(segment));
}

function assertNotBackupSource(candidate, label) {
  if (isUnderBackupDir(candidate)) {
    throw new Error(`Refusing ${label}: ${path.resolve(candidate)} is under a directory named like "backup". A backup holds an older settings snapshot; merging from it overwrites newer merchant values. Copy the intended keys into a fresh patch under deliverables/settings-patches/ instead.`);
  }
}

function usage() {
  console.log(`Usage:
  node settings_merge.js --manifest <ordered-manifest.json> [--root <theme-root>] [options]

Options:
  --manifest <file.json>     Ordered patch manifest JSON (REQUIRED; globs forbidden).
  --key <id> --value <json>  Single-key mode (no manifest): set one settings_data.json key. Dry-run unless --write-data.
                             Never writes the schema. Mutually exclusive with --manifest.
  --max-key-loss <n>         Abort a settings_data.json write that would remove more than n keys (default 0).
  --root, --theme <path>     Theme root directory (default: parent of cwd).
  --write-schema             Write merged config/settings_schema.json.
  --write-data               Write merged config/settings_data.json (requires user approval).
  --allow-settings-data      Same as --write-data and also the explicit permission required to persist --prune-orphan-data.
  --reset-skeleton           Before applying patches, drop schema groups made only of id-less settings (headers/paragraphs).
  --prune-orphan-data        Remove settings_data.json keys that have no schema setting id. Dry-run and schema-only runs only
                             report them; persisting needs --write-data --allow-settings-data and --backup-dir.
  --allow-schema-remove      Allow schema_remove entries to delete existing settings.
  --asset-cdn-base <url>     CDN base URL to resolve bare image_picker filenames.
  --storefront <url>         Storefront preview URL (?themeid=...) to auto-extract CDN base.
  --dry-run                  Print diff and run audit without writing files (default if no --write-*).
  --backup-dir <dir>         Directory for timestamped pre-write backups.
  --help, -h                 Show this help message.

Exit codes:
  0 = merge and post-merge settings audit succeeded
  1 = validation, layer order, image resolution, or settings audit error
  2 = usage error (missing --manifest or forbidden wildcard glob)
`);
}

function classifyPatchLayer(patchObj, patchLabel) {
  const explicit = String(patchObj?.layer || '').trim().toLowerCase();
  const baseName = path.basename(String(patchLabel || ''), '.json');

  if (explicit.startsWith('base') || /^(?:00|base|rebrand)/i.test(baseName)) {
    return { rank: 0, name: explicit || 'base-rebrand' };
  }
  if (explicit.startsWith('data-cleanup') || explicit.startsWith('cleanup') || /^D\d+/i.test(baseName)) {
    return { rank: 2, name: explicit || `data-cleanup:${baseName}` };
  }
  if (explicit.startsWith('slice') || /^(?:G\d+|S\d+)/i.test(baseName)) {
    return { rank: 1, name: explicit || `slice:${baseName}` };
  }
  return { rank: 1, name: explicit || `patch:${baseName}` };
}

function formatSettingsDataJson(dataObj, originalRawText = '') {
  const trimmed = String(originalRawText || '').trim();
  const isSingleLine = !trimmed || !trimmed.includes('\n');
  const hasUnicodeEscapes = !trimmed || /\\u[0-9a-fA-F]{4}/.test(originalRawText);

  if (isSingleLine || hasUnicodeEscapes) {
    const raw = JSON.stringify(dataObj);
    const escaped = raw.replace(/[\u007f-\uffff]/g, (ch) => (
      '\\u' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
    ));
    const trailing = originalRawText.endsWith('\r\n')
      ? '\r\n'
      : originalRawText.endsWith('\n')
      ? '\n'
      : '';
    return escaped + trailing;
  }

  return JSON.stringify(dataObj, null, 2) + '\n';
}

function isBareImageFilename(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (/^(?:https?:)?\/\//i.test(trimmed)) return false;
  if (/^data:/i.test(trimmed)) return false;
  return true;
}

function normalizeCdnBase(rawBase) {
  let base = String(rawBase || '').trim();
  if (!base) return '';
  if (base.startsWith('//')) base = 'https:' + base;
  if (!base.endsWith('/')) base += '/';
  return base;
}

async function resolveCdnBaseUrl(args, manifestObj) {
  const direct = args.assetCdnBase || (manifestObj && manifestObj.assetCdnBase) || '';
  if (direct) return normalizeCdnBase(direct);

  const storefront = args.storefront || (manifestObj && manifestObj.storefront) || '';
  if (storefront) {
    const res = await fetch(storefront, {
      headers: {
        'Cache-Control': 'no-store, no-cache',
        'User-Agent': 'RESTYLE_MASTER_KIT settings_merge/1.0'
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch storefront ${storefront} for CDN base resolution: HTTP ${res.status}`);
    }
    const html = await res.text();
    const extracted = extractCdnThemeBase(html, storefront, '', args.root);
    if (extracted) return normalizeCdnBase(extracted);
  }
  return '';
}

function loadManifestPatches(manifestPath) {
  if (!manifestPath) {
    const err = new Error('Missing required --manifest <file.json> argument.');
    err.exitCode = 2;
    throw err;
  }
  if (hasGlobChars(manifestPath)) {
    const err = new Error(`Wildcard/glob characters are forbidden in --manifest: ${manifestPath}`);
    err.exitCode = 2;
    throw err;
  }
  const absManifest = path.resolve(manifestPath);
  assertNotBackupSource(absManifest, '--manifest');
  if (!fs.existsSync(absManifest)) {
    const err = new Error(`Manifest file not found: ${absManifest}`);
    err.exitCode = 2;
    throw err;
  }

  const rawManifest = JSON.parse(fs.readFileSync(absManifest, 'utf8'));
  for (const declared of [rawManifest && rawManifest.source]) {
    if (typeof declared === 'string' && declared) assertNotBackupSource(path.resolve(path.dirname(absManifest), declared), 'manifest source');
  }
  const manifestDir = path.dirname(absManifest);

  let rawEntries = [];
  if (Array.isArray(rawManifest)) {
    rawEntries = rawManifest;
  } else if (rawManifest && Array.isArray(rawManifest.patches)) {
    rawEntries = rawManifest.patches;
  } else if (rawManifest && (rawManifest.schema_add || rawManifest.data_set || rawManifest.data || rawManifest.schema_update || rawManifest.schema_remove)) {
    rawEntries = [{ file: absManifest, inline: rawManifest }];
  } else {
    const err = new Error(`Invalid manifest structure in ${absManifest}: expected array of patch files or { "patches": [...] }`);
    err.exitCode = 2;
    throw err;
  }

  if (rawEntries.length === 0) {
    const err = new Error(`Manifest ${absManifest} contains 0 patches.`);
    err.exitCode = 2;
    throw err;
  }

  const loaded = [];
  for (let i = 0; i < rawEntries.length; i += 1) {
    const item = rawEntries[i];
    if (typeof item === 'string') {
      if (hasGlobChars(item)) {
        const err = new Error(`Wildcard/glob path forbidden in manifest at index ${i}: ${item}`);
        err.exitCode = 2;
        throw err;
      }
      const patchPath = path.resolve(manifestDir, item);
      assertNotBackupSource(patchPath, `patch file at manifest[${i}]`);
      if (!fs.existsSync(patchPath)) {
        throw new Error(`Patch file not found at manifest[${i}]: ${patchPath}`);
      }
      loaded.push({
        label: path.relative(process.cwd(), patchPath).replace(/\\/g, '/') || path.basename(patchPath),
        filePath: patchPath,
        spec: JSON.parse(fs.readFileSync(patchPath, 'utf8'))
      });
    } else if (item && typeof item === 'object') {
      if (item.inline) {
        loaded.push({
          label: path.basename(item.file || absManifest),
          filePath: item.file || absManifest,
          spec: item.inline
        });
      } else if (item.file) {
        if (hasGlobChars(item.file)) {
          const err = new Error(`Wildcard/glob path forbidden in manifest at index ${i}: ${item.file}`);
          err.exitCode = 2;
          throw err;
        }
        const patchPath = path.resolve(manifestDir, item.file);
        assertNotBackupSource(patchPath, `patch file at manifest[${i}]`);
        if (!fs.existsSync(patchPath)) {
          throw new Error(`Patch file not found at manifest[${i}]: ${patchPath}`);
        }
        const spec = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
        if (item.layer && !spec.layer) spec.layer = item.layer;
        loaded.push({
          label: path.relative(process.cwd(), patchPath).replace(/\\/g, '/') || path.basename(patchPath),
          filePath: patchPath,
          spec
        });
      } else if (item.schema_add || item.data_set || item.data || item.schema_update || item.schema_remove) {
        loaded.push({
          label: `${path.basename(absManifest)}#patches[${i}]`,
          filePath: absManifest,
          spec: item
        });
      } else {
        throw new Error(`Invalid patch entry at manifest[${i}] in ${absManifest}`);
      }
    }
  }

  return { absManifest, rawManifest, patches: loaded };
}

function stageAuditRoot(themeRoot, mergedSchemaText, mergedDataText) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restyle-settings-merge-'));
  fs.mkdirSync(path.join(tmpDir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'config', 'settings_schema.json'), mergedSchemaText, 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'config', 'settings_data.json'), mergedDataText, 'utf8');

  for (const dirName of ['layout', 'snippets', 'templates', 'sections', 'assets']) {
    const src = path.join(themeRoot, dirName);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(tmpDir, dirName);
    try {
      fs.symlinkSync(src, dest, 'junction');
    } catch (_) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }
  return tmpDir;
}

async function runSettingsMerge(rawOptions) {
  const args = {
    root: path.resolve(rawOptions.root || path.resolve(process.cwd(), '..')),
    manifest: rawOptions.manifest || rawOptions.spec || '',
    assetCdnBase: rawOptions.assetCdnBase || '',
    storefront: rawOptions.storefront || '',
    writeSchema: Boolean(rawOptions.writeSchema),
    writeData: Boolean(rawOptions.writeData || rawOptions.allowSettingsData),
    allowSettingsData: Boolean(rawOptions.allowSettingsData),
    allowSchemaRemove: Boolean(rawOptions.allowSchemaRemove),
    dryRun: Boolean(rawOptions.dryRun) || (!rawOptions.writeSchema && !rawOptions.writeData && !rawOptions.allowSettingsData),
    skipAudit: Boolean(rawOptions.skipAudit),
    resetSkeleton: Boolean(rawOptions.resetSkeleton),
    pruneOrphanData: Boolean(rawOptions.pruneOrphanData),
    backupDir: rawOptions.backupDir || '',
    key: String(rawOptions.key || '').trim(),
    hasValue: Object.prototype.hasOwnProperty.call(rawOptions, 'value'),
    value: rawOptions.value,
    maxKeyLoss: rawOptions.maxKeyLoss === undefined ? 0 : parseKeyLossLimit(rawOptions.maxKeyLoss)
  };

  if (args.pruneOrphanData && !args.dryRun && args.writeData) {
    if (!args.allowSettingsData) throw new Error('--prune-orphan-data persists settings_data.json only with --allow-settings-data');
    if (!args.backupDir) throw new Error('--prune-orphan-data persists settings_data.json only with --backup-dir <dir> (pre-write copy)');
  }
  let rawManifest = {};
  let patches;
  if (args.key) {
    if (args.manifest) {
      const err = new Error('--key and --manifest are mutually exclusive.');
      err.exitCode = 2;
      throw err;
    }
    if (!args.hasValue) {
      const err = new Error('--key requires --value <json>.');
      err.exitCode = 2;
      throw err;
    }
    if (args.writeSchema) {
      const err = new Error('--key mode never writes settings_schema.json; drop --write-schema.');
      err.exitCode = 2;
      throw err;
    }
    patches = [{ label: `--key ${args.key}`, filePath: '', spec: { data_set: { [args.key]: args.value } } }];
  } else {
    ({ rawManifest, patches } = loadManifestPatches(args.manifest));
  }

  const schemaPath = path.join(args.root, 'config', 'settings_schema.json');
  const dataPath = path.join(args.root, 'config', 'settings_data.json');

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Missing config/settings_schema.json in ${args.root}`);
  }
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Missing config/settings_data.json in ${args.root}`);
  }

  const originalSchemaRaw = fs.readFileSync(schemaPath, 'utf8');
  const originalDataRaw = fs.readFileSync(dataPath, 'utf8');
  let schema = JSON.parse(originalSchemaRaw);
  const data = JSON.parse(originalDataRaw);
  const targetData = (data && typeof data.current === 'object' && data.current !== null) ? data.current : data;
  const keysBefore = dataKeyPaths(data);

  const diffReport = [];
  if (args.resetSkeleton) {
    const before = schema.length;
    schema = schema.filter((g) => !(Array.isArray(g.settings) && g.settings.length > 0 && g.settings.every((s) => !s.id)));
    diffReport.push(`reset-skeleton: removed ${before - schema.length} group(s) made only of id-less settings`);
  }

  const groupsByName = new Map();
  for (const g of schema) {
    if (g && g.name) groupsByName.set(g.name, g);
  }

  let maxLayerRank = -1;
  let maxLayerLabel = '';
  const touchedImageDefaults = new Set();
  const touchedDataKeys = new Set();

  for (const patch of patches) {
    const layer = classifyPatchLayer(patch.spec, patch.label);
    if (layer.rank < maxLayerRank) {
      throw new Error(`Out-of-order patch layer in manifest: ${patch.label} (${layer.name}) cannot follow ${maxLayerLabel} (monotonic order: base-rebrand -> slice:G0..S8 -> data-cleanup:D*)`);
    }
    if (layer.rank > maxLayerRank) {
      maxLayerRank = layer.rank;
      maxLayerLabel = `${patch.label} (${layer.name})`;
    }

    const spec = patch.spec || {};

    // 1. schema_remove
    const removeList = Array.isArray(spec.schema_remove) ? spec.schema_remove : [];
    if (removeList.length > 0) {
      if (!args.allowSchemaRemove) {
        throw new Error(`Patch ${patch.label} specifies schema_remove (${removeList.join(', ')}) but --allow-schema-remove was not passed`);
      }
      const removeSet = new Set(removeList);
      for (const g of schema) {
        const before = (g.settings || []).length;
        g.settings = (g.settings || []).filter((s) => !removeSet.has(s.id));
        const delta = before - g.settings.length;
        if (delta > 0) {
          diffReport.push(`${patch.label}: removed ${delta} setting(s) from group "${g.name}"`);
        }
      }
      for (const remKey of removeSet) {
        delete targetData[remKey];
      }
    }

    // 2. schema_update
    const updateList = Array.isArray(spec.schema_update) ? spec.schema_update : [];
    for (let uIdx = 0; uIdx < updateList.length; uIdx += 1) {
      const upd = updateList[uIdx];
      if (!upd || typeof upd !== 'object' || !upd.id || !upd.patch || typeof upd.patch !== 'object') {
        throw new Error(`Invalid schema_update entry at ${patch.label}#schema_update[${uIdx}]: expected { "id": "...", "patch": { ... } }`);
      }
      let hit = false;
      let changed = false;
      for (const g of schema) {
        for (const s of (g.settings || [])) {
          if (s.id === upd.id) {
            const beforeJson = JSON.stringify(s);
            Object.assign(s, upd.patch);
            if (JSON.stringify(s) !== beforeJson) changed = true;
            if (s.type === 'image_picker' && upd.patch.default !== undefined) {
              touchedImageDefaults.add(s.id);
            }
            hit = true;
          }
        }
      }
      if (!hit) {
        throw new Error(`schema_update target setting id "${upd.id}" not found in ${patch.label}#schema_update[${uIdx}]`);
      }
      if (changed) diffReport.push(`${patch.label}: updated schema setting "${upd.id}"`);
    }

    // 3. schema_add
    if (spec.schema_add !== undefined) {
      if (!Array.isArray(spec.schema_add)) {
        throw new Error(`Invalid schema_add in ${patch.label}: expected array of { group, settings } objects`);
      }
      const existingIds = new Set();
      for (const g of schema) {
        for (const s of (g.settings || [])) {
          if (s.id) existingIds.add(s.id);
        }
      }

      for (let aIdx = 0; aIdx < spec.schema_add.length; aIdx += 1) {
        const entry = spec.schema_add[aIdx];
        if (!entry || typeof entry !== 'object' || typeof entry.group !== 'string' || !entry.group.trim() || !Array.isArray(entry.settings)) {
          throw new Error(`Invalid flat or malformed schema_add entry in ${patch.label} at index ${aIdx} (schema_add[${aIdx}]): entry must have "group" string and "settings" array`);
        }
        let g = groupsByName.get(entry.group);
        if (!g) {
          g = { name: entry.group, settings: [] };
          schema.push(g);
          groupsByName.set(entry.group, g);
        }
        let addedCount = 0;
        let replacedCount = 0;
        let unchangedCount = 0;
        const anonymousSignatures = new Set((g.settings || []).filter((x) => !x.id).map(settingSignature));
        for (let sIdx = 0; sIdx < entry.settings.length; sIdx += 1) {
          const s = entry.settings[sIdx];
          if (!s || typeof s !== 'object' || !s.type) {
            throw new Error(`Invalid setting object in ${patch.label}#schema_add[${aIdx}].settings[${sIdx}]: missing "type"`);
          }
          if (s.type === 'image_picker' && s.id && s.default !== undefined) {
            touchedImageDefaults.add(s.id);
          }
          if (s.id && existingIds.has(s.id)) {
            for (const gg of schema) {
              const list = gg.settings || [];
              for (let i = 0; i < list.length; i += 1) {
                if (list[i].id !== s.id) continue;
                if (JSON.stringify(list[i]) === JSON.stringify(s)) {
                  unchangedCount += 1;
                } else {
                  list[i] = s;
                  replacedCount += 1;
                }
              }
            }
          } else if (!s.id && anonymousSignatures.has(settingSignature(s))) {
            unchangedCount += 1;
          } else {
            g.settings.push(s);
            if (s.id) existingIds.add(s.id);
            else anonymousSignatures.add(settingSignature(s));
            addedCount += 1;
          }
        }
        diffReport.push(`${patch.label}: group "${entry.group}" (+${addedCount} added, ${replacedCount} updated, ${unchangedCount} unchanged)`);
      }
    }

    // 4. data_set / data
    const dataMap = spec.data_set || spec.data || {};
    if (dataMap && typeof dataMap === 'object') {
      const changedKeys = Object.keys(dataMap).filter((k) => JSON.stringify(targetData[k]) !== JSON.stringify(dataMap[k]));
      for (const k of Object.keys(dataMap)) {
        targetData[k] = dataMap[k];
        touchedDataKeys.add(k);
      }
      if (changedKeys.length > 0) {
        diffReport.push(`${patch.label}: updated ${changedKeys.length} key(s) in settings_data.json`);
      }
    }
  }

  schema = schema.filter((g) => Array.isArray(g.settings) && g.settings.length > 0);

  let prunedKeys = [];
  if (args.pruneOrphanData) {
    const schemaIds = new Set();
    for (const g of schema) {
      for (const s of (g.settings || [])) {
        if (s.id) schemaIds.add(s.id);
      }
    }
    prunedKeys = findOrphanDataKeys(targetData, schemaIds, targetData === data);
    for (const key of prunedKeys) delete targetData[key];
    diffReport.push(`orphan settings_data.json key(s) ${args.writeData ? 'pruned' : 'would be pruned (not persisted without --write-data --allow-settings-data)'}: ${prunedKeys.length}${prunedKeys.length ? ` [${prunedKeys.slice(0, 20).join(', ')}${prunedKeys.length > 20 ? ', ...' : ''}]` : ''}`);
  }

  // Collect image_picker settings and resolve bare filenames
  const imagePickerSettings = new Map();
  for (const g of schema) {
    for (const s of (g.settings || [])) {
      if (s.type === 'image_picker' && s.id) {
        imagePickerSettings.set(s.id, s);
      }
    }
  }

  const bareItems = [];
  for (const [id, s] of imagePickerSettings.entries()) {
    if (isBareImageFilename(s.default)) {
      bareItems.push({ kind: 'schema.default', id, value: s.default, setting: s });
    }
    if (isBareImageFilename(targetData[id])) {
      bareItems.push({ kind: 'settings_data', id, value: targetData[id] });
    }
  }

  let resolvedCdnBase = '';
  const resolvedUrls = [];
  if (bareItems.length > 0) {
    resolvedCdnBase = await resolveCdnBaseUrl(args, rawManifest);
    if (!resolvedCdnBase) {
      const sample = bareItems[0];
      throw new Error(`Bare image_picker filename "${sample.value}" (${sample.kind} for "${sample.id}") cannot be resolved: pass --asset-cdn-base <https://cdn.hstatic.net/themes/<org>/<theme>/<ver>/ or https://file.hstatic.net/...> or --storefront <url>`);
    }
    for (const item of bareItems) {
      const cleanFile = item.value.trim().replace(/^\.?\/?(?:assets\/)?/, '');
      const fullUrl = `${resolvedCdnBase}${cleanFile}`;
      if (item.kind === 'schema.default') {
        item.setting.default = fullUrl;
      } else {
        targetData[item.id] = fullUrl;
      }
      resolvedUrls.push({ kind: item.kind, id: item.id, from: item.value, to: fullUrl });
    }
    diffReport.push(`resolved ${resolvedUrls.length} bare image_picker filename(s) using ${resolvedCdnBase}`);
  }
  const keysAfter = dataKeyPaths(data);
  const removedKeys = [...keysBefore].filter((k) => !keysAfter.has(k));
  diffReport.push(`settings_data.json keys: ${keysBefore.size} before, ${keysAfter.size} after, ${removedKeys.length} removed (limit ${args.maxKeyLoss})`);
  const keyLossBlocked = removedKeys.length > args.maxKeyLoss;
  if (keyLossBlocked) {
    const listed = `${removedKeys.length} key(s) [${removedKeys.slice(0, 20).join(', ')}${removedKeys.length > 20 ? ', ...' : ''}]`;
    if (args.writeData && !args.dryRun) {
      throw new Error(`settings_data.json key-loss gate: merge would remove ${listed}, above --max-key-loss ${args.maxKeyLoss}. Nothing was written. Review the removals, then raise --max-key-loss to the intended count.`);
    }
    diffReport.push(`key-loss gate would abort a settings_data.json write: ${listed} above --max-key-loss ${args.maxKeyLoss}`);
  }

  const mergedSchemaText = JSON.stringify(schema, null, 2) + '\n';
  const mergedDataText = formatSettingsDataJson(data, originalDataRaw);

  // Validate round-trip equality for settings_data.json
  const roundTrip = JSON.parse(mergedDataText);
  if (JSON.stringify(roundTrip) !== JSON.stringify(data)) {
    throw new Error('settings_data.json round-trip serialization verification failed');
  }

  // Run Phase 01 audit against staged merge
  let auditResult = { errors: [], warnings: [], info: [] };
  if (!args.skipAudit) {
    const stagedRoot = stageAuditRoot(args.root, mergedSchemaText, mergedDataText);
    try {
      auditResult = runSettingsSchemaAudit(stagedRoot);
    } finally {
      try { fs.rmSync(stagedRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const themeScopedWarnings = auditResult.warnings.filter((w) => w.rule === 'image-picker-theme-scoped-url');
  const hasThemeScopedResolved = resolvedCdnBase && /cdn\.hstatic\.net\/themes\//i.test(resolvedCdnBase);

  console.log(`# Settings Merge (${args.dryRun ? 'DRY-RUN' : 'WRITE'})`);
  console.log(`Root: ${args.root}`);
  console.log(args.key ? `Key: ${args.key} (single-key mode, ${patches.length} patch)` : `Manifest: ${path.resolve(args.manifest)} (${patches.length} patch(es))`);
  for (const line of diffReport) {
    console.log(`- ${line}`);
  }

  if (themeScopedWarnings.length > 0 || (hasThemeScopedResolved && resolvedUrls.length > 0)) {
    console.warn(`WARN [image-picker-theme-scoped-url]: ${themeScopedWarnings.length || resolvedUrls.length} image_picker URL(s) use theme-scoped CDN paths (https://cdn.hstatic.net/themes/...). For cross-theme portability when assets are uploaded via Haravan Files, use --asset-cdn-base https://file.hstatic.net/<org>/file/`);
  }

  if (auditResult.warnings.length > 0) {
    console.log(`Audit warnings: ${auditResult.warnings.length}`);
    for (const w of auditResult.warnings) {
      console.log(`  [WARN] ${w.rule}: ${w.message}`);
    }
  }

  if (auditResult.errors.length > 0) {
    console.error(`Audit errors: ${auditResult.errors.length}`);
    for (const e of auditResult.errors) {
      console.error(`  [ERROR] ${e.rule}: ${e.message}`);
    }
    throw new Error(`Post-merge settings schema audit failed with ${auditResult.errors.length} error(s).`);
  }

  if (!args.dryRun) {
    if (args.backupDir) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const bk = path.join(args.backupDir, stamp);
      fs.mkdirSync(bk, { recursive: true });
      fs.writeFileSync(path.join(bk, 'settings_schema.json'), originalSchemaRaw, 'utf8');
      fs.writeFileSync(path.join(bk, 'settings_data.json'), originalDataRaw, 'utf8');
    }
    if (args.writeSchema) {
      fs.writeFileSync(schemaPath, mergedSchemaText, 'utf8');
      console.log(`Wrote: ${schemaPath}`);
    }
    if (args.writeData) {
      fs.writeFileSync(dataPath, mergedDataText, 'utf8');
      console.log(`Wrote: ${dataPath}`);
    }
  } else {
    console.log('(dry-run: no files written; pass --write-schema and/or --write-data to persist)');
  }

  return {
    ok: true,
    dryRun: args.dryRun,
    wroteSchema: !args.dryRun && args.writeSchema,
    wroteData: !args.dryRun && args.writeData,
    diffReport,
    resolvedUrls,
    auditResult,
    keyLoss: { before: keysBefore.size, after: keysAfter.size, removed: removedKeys, limit: args.maxKeyLoss, blocked: keyLossBlocked }
  };
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

  try {
    await runSettingsMerge(args);
    process.exitCode = 0;
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = err.exitCode || 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  classifyPatchLayer,
  formatSettingsDataJson,
  isBareImageFilename,
  loadManifestPatches,
  settingSignature,
  findOrphanDataKeys,
  dataKeyPaths,
  isUnderBackupDir,
  runSettingsMerge
};
