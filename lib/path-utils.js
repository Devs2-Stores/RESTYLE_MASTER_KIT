'use strict';
const fs = require('fs');
const path = require('path');

function realpathSafe(target) {
  return fs.realpathSync.native ? fs.realpathSync.native(target) : fs.realpathSync(target);
}

function resolveRealCandidate(candidate) {
  const absolute = path.resolve(candidate);
  if (fs.existsSync(absolute)) return realpathSafe(absolute);

  let probe = absolute;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (!fs.existsSync(probe)) return absolute;
  const realProbe = realpathSafe(probe);
  const suffix = path.relative(probe, absolute);
  return suffix ? path.resolve(realProbe, suffix) : realProbe;
}

function isInsideRoot(root, candidate) {
  const realRoot = resolveRealCandidate(root);
  const realCandidate = resolveRealCandidate(candidate);
  const relative = path.relative(realRoot, realCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveInsideRoot(root, relativePath, label = 'path') {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!isInsideRoot(resolvedRoot, resolved)) {
    throw new Error(`${label} escapes root: ${relativePath}`);
  }
  return resolved;
}

function buildUrl(base, pagePath) {
  return base.replace(/\/+$/, '') + (pagePath.startsWith('/') ? pagePath : `/${pagePath}`);
}

module.exports = {
  isInsideRoot,
  resolveInsideRoot,
  buildUrl
};
