'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { walkTheme } = require('./theme-walk');

const DEFAULT_SETTINGS_AUDIT_SCRIPT = 'C:/Users/Admin/.claude/skills/haravan-settings-schema/scripts/audit-settings-schema.mjs';

function resolveSettingsAuditScript(customPath) {
  const raw = customPath || process.env.HARAVAN_SETTINGS_AUDIT || DEFAULT_SETTINGS_AUDIT_SCRIPT;
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Settings schema audit script not found at ${resolved} (configured via HARAVAN_SETTINGS_AUDIT=${process.env.HARAVAN_SETTINGS_AUDIT || '<default>'}).`);
  }
  return resolved;
}

const WORKSPACE_CONTEXT_FILE = '.workspace-context.json';
const WORKSPACE_CONTEXT_ANCESTORS = 3;
const SETTINGS_MODES = ['legacy', 'schema', 'auto'];

function normalizeSettingsMode(value) {
  const mode = String(value === undefined || value === null || value === '' ? 'auto' : value).trim().toLowerCase();
  if (!SETTINGS_MODES.includes(mode)) {
    throw new Error(`Invalid settings mode: ${value} (expected one of ${SETTINGS_MODES.join(', ')})`);
  }
  return mode;
}

/** Reads `settingsMode` from the nearest `.workspace-context.json` at the theme root or up to three parents. */
function readWorkspaceSettingsMode(root) {
  let dir = path.resolve(root);
  for (let depth = 0; depth <= WORKSPACE_CONTEXT_ANCESTORS; depth += 1) {
    const file = path.join(dir, WORKSPACE_CONTEXT_FILE);
    if (fs.existsSync(file)) {
      let declared;
      try {
        declared = JSON.parse(fs.readFileSync(file, 'utf8')).settingsMode;
      } catch (err) {
        if (depth === 0) throw new Error(`${file} is not valid JSON: ${err.message}`);
        declared = undefined;
      }
      const mode = String(declared || '').trim().toLowerCase();
      if (mode === 'legacy' || mode === 'schema') return { mode, file };
      return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** An explicit legacy/schema wins; auto reads `.workspace-context.json` and defaults to schema. */
function resolveSettingsMode(root, requested) {
  const mode = normalizeSettingsMode(requested);
  if (mode !== 'auto') return { mode, source: 'flag' };
  const declared = readWorkspaceSettingsMode(root);
  if (declared) return { mode: declared.mode, source: declared.file };
  return { mode: 'schema', source: 'default' };
}

function legacyFinding(rule, message, line = 1) {
  return { rule, message, file: 'config/settings.html', line };
}

/** Audit of a theme whose merchant controls live in config/settings.html (no settings_schema.json shape checks). */
function auditLegacySettingsHtml(root, resolved) {
  const errors = [];
  const warnings = [];
  const htmlFile = path.join(root, 'config', 'settings.html');
  if (!fs.existsSync(htmlFile)) {
    errors.push(legacyFinding('missing-file', `legacy settings mode needs ${htmlFile}`));
  } else {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const declared = new Set([...html.matchAll(/\bname=["']([A-Za-z0-9_-]+)["']/g)].map((m) => m[1]));
    if (declared.size === 0) {
      errors.push(legacyFinding('legacy-settings-empty', 'config/settings.html declares no name="..." control'));
    }
    const reported = new Set();
    for (const file of walkTheme(root, { dirs: ['layout', 'snippets', 'templates', 'sections'], ext: /\.liquid$/i })) {
      const relFile = path.relative(root, file).replace(/\\/g, '/');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((text, index) => {
        for (const match of text.matchAll(/\bsettings\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          const id = match[1];
          if (declared.has(id) || reported.has(id) || declared.size === 0) continue;
          reported.add(id);
          errors.push({ rule: 'missing-setting', message: `${relFile}:${index + 1} references settings.${id} but config/settings.html has no control named ${id}`, file: relFile, line: index + 1, id });
        }
      });
    }
  }
  const byRule = {};
  for (const finding of [...errors, ...warnings]) byRule[finding.rule] = (byRule[finding.rule] || 0) + 1;
  const raw = { settingsMode: 'legacy', settingsModeSource: resolved.source, errors, warnings, info: [], byRule };
  return {
    status: errors.length > 0 ? 1 : 0,
    summary: { settingsMode: 'legacy', settingsModeSource: resolved.source },
    counts: { errors: errors.length, warnings: warnings.length, info: 0 },
    byRule,
    errors,
    warnings,
    info: [],
    raw
  };
}

function runSettingsSchemaAudit(themeRoot, options = {}) {
  const root = path.resolve(themeRoot);
  const resolvedMode = resolveSettingsMode(root, options.settingsMode);
  if (resolvedMode.mode === 'legacy') return auditLegacySettingsHtml(root, resolvedMode);
  const scriptPath = resolveSettingsAuditScript(options.scriptPath || options.auditScriptPath);
  const args = [scriptPath, root, '--json', `--settings-mode=${resolvedMode.mode}`];

  if (options.maxColors != null) {
    args.push('--max-colors', String(options.maxColors));
  }
  if (Array.isArray(options.residueWords) && options.residueWords.length > 0) {
    args.push('--residue-words', options.residueWords.join(','));
  } else if (typeof options.residueWords === 'string' && options.residueWords.trim()) {
    args.push('--residue-words', options.residueWords.trim());
  }
  if (options.residueFile) {
    args.push('--residue-file', path.resolve(options.residueFile));
  }
  if (options.probeUrls) {
    args.push('--probe-urls');
  }

  const nodeBin = /^node(?:\.exe)?$/i.test(path.basename(process.execPath || '')) ? process.execPath : 'node';
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 30000;
  const res = spawnSync(nodeBin, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024
  });

  const stderr = String(res.stderr || '').trim();
  const stdout = String(res.stdout || '').trim();

  if (res.error) {
    throw new Error(`Settings schema audit (${scriptPath}, env HARAVAN_SETTINGS_AUDIT) failed to spawn or timed out: ${res.error.message}${stderr ? ` | stderr: ${stderr}` : ''}`);
  }
  if (res.signal) {
    throw new Error(`Settings schema audit (${scriptPath}, env HARAVAN_SETTINGS_AUDIT) killed by signal ${res.signal}${stderr ? ` | stderr: ${stderr}` : ''}`);
  }
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(`Settings schema audit (${scriptPath}, env HARAVAN_SETTINGS_AUDIT) exited with unexpected code ${res.status}${stderr ? ` | stderr: ${stderr}` : (stdout ? ` | stdout: ${stdout.slice(0, 300)}` : '')}`);
  }
  if (!stdout) {
    throw new Error(`Settings schema audit (${scriptPath}, env HARAVAN_SETTINGS_AUDIT) produced empty stdout (exit ${res.status})${stderr ? ` | stderr: ${stderr}` : ''}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Settings schema audit (${scriptPath}, env HARAVAN_SETTINGS_AUDIT) produced unparsable JSON (${err.message})${stderr ? ` | stderr: ${stderr}` : ` | stdout: ${stdout.slice(0, 300)}`}`);
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.errors) || !Array.isArray(parsed.warnings)) {
    throw new Error(`Settings schema audit (${scriptPath}, env HARAVAN_SETTINGS_AUDIT) returned malformed JSON contract (missing errors[]/warnings[])${stderr ? ` | stderr: ${stderr}` : ''}`);
  }

  const errors = parsed.errors;
  const warnings = parsed.warnings;
  const info = Array.isArray(parsed.info) ? parsed.info : [];

  if (res.status === 1 && errors.length === 0) {
    throw new Error(`Settings schema audit (${scriptPath}, env HARAVAN_SETTINGS_AUDIT) exited with status 1 but 0 errors in JSON${stderr ? ` | stderr: ${stderr}` : ''}`);
  }

  return {
    status: res.status,
    summary: parsed.summary || {},
    counts: parsed.counts || { errors: errors.length, warnings: warnings.length, info: info.length },
    byRule: parsed.byRule || {},
    errors,
    warnings,
    info,
    raw: parsed
  };
}
module.exports = {
  DEFAULT_SETTINGS_AUDIT_SCRIPT,
  SETTINGS_MODES,
  normalizeSettingsMode,
  readWorkspaceSettingsMode,
  resolveSettingsMode,
  resolveSettingsAuditScript,
  runSettingsSchemaAudit
};
