'use strict';
const fs = require('fs');
const path = require('path');

const SOURCE_DIRS = ['assets', 'config', 'layout', 'snippets', 'templates'];

const SKIP_DIRS = new Set([
  '.git',
  '.stitch',
  'artifacts',
  'final-showcase',
  'node_modules',
  'output',
  'RESTYLE_MASTER_KIT',
  'scratch',
  'test'
]);

function walk(dir, extPattern, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extPattern, out);
    else if (extPattern.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Walk theme source directories and collect matching files.
 * @param {string} root - Theme root path.
 * @param {{ dirs?: string[], ext?: RegExp }} [opts]
 * @returns {string[]}
 */
function walkTheme(root, opts = {}) {
  const dirs = opts.dirs != null ? opts.dirs : SOURCE_DIRS;
  const ext = opts.ext != null ? opts.ext : /\.(liquid|js|css|html|json)$/i;
  const files = [];
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (fs.existsSync(full)) walk(full, ext, files);
  }
  return files;
}

module.exports = { walkTheme, walk, SKIP_DIRS, SOURCE_DIRS };
