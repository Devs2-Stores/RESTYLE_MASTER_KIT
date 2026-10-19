'use strict';
const https = require('https');

const ALLOWED_CHAR = /^[\p{L}\p{N}\s.,:\-()]$/u;

function extractAltAttributes(html) {
  const alts = [];
  const regex = /\balt=(["'])(.*?)\1/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    alts.push(match[2]);
  }
  return alts;
}

function extractImageSources(html) {
  const srcs = [];
  const regex = /<img\b[^>]*?\bsrc=(["'])(.*?)\1/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    srcs.push(match[2]);
  }
  return srcs;
}

function stripHtmlTags(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function checkDisallowedCharacters(text, label) {
  const disallowed = new Set();
  for (const ch of text) {
    if (!ALLOWED_CHAR.test(ch)) {
      disallowed.add(`${ch} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
    }
  }
  if (disallowed.size > 0) {
    return [`${label} contains disallowed characters (only letters, numbers, spaces, and . , : - ( ) allowed): ${Array.from(disallowed).slice(0, 10).join(', ')}`];
  }
  return [];
}

async function probeUrl(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let req;
    try {
      req = https.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => {
        resolve({ url, status: res.statusCode });
      });
    } catch (err) {
      return resolve({ url, status: 0, error: err.message });
    }
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, status: 0, error: `timeout after ${timeoutMs}ms` });
    });
    req.on('error', (err) => resolve({ url, status: 0, error: err.message }));
    req.end();
  });
}
function validateDescriptionSync(content) {
  const failures = [];
  const text = String(content || '');

  if (!text.trim()) {
    return { valid: false, failures: ['THEME_DESCRIPTION.html is empty'] };
  }

  if (/(<!doctype|<html\b|<head\b|<body\b)/i.test(text)) {
    failures.push('THEME_DESCRIPTION.html must be an editor fragment, not a full HTML document');
  }

  if (text.trim().length < 200) {
    failures.push('THEME_DESCRIPTION.html is too short (< 200 chars) - likely not filled in');
  }

  if (!/<h[1-3][^>]*>/i.test(text)) {
    failures.push('THEME_DESCRIPTION.html missing heading (h1/h2/h3)');
  }

  if (!/<ul[^>]*>/i.test(text)) {
    failures.push('THEME_DESCRIPTION.html missing feature list (<ul>)');
  }

  if (/<!--[\s\S]*?-->/.test(text)) {
    failures.push('THEME_DESCRIPTION.html contains HTML comments (not allowed by Marketplace)');
  }

  if (/&amp;/.test(text)) {
    failures.push('THEME_DESCRIPTION.html contains &amp; (write "và" instead)');
  }

  // Check visible text characters
  const visibleText = stripHtmlTags(text);
  failures.push(...checkDisallowedCharacters(visibleText, 'visible text'));

  // Check alt attribute characters
  const alts = extractAltAttributes(text);
  for (const alt of alts) {
    failures.push(...checkDisallowedCharacters(alt, `alt="${alt.slice(0, 30)}..."`));
  }

  // Check image URLs
  const images = extractImageSources(text);
  for (const src of images) {
    if (!src.startsWith('https://cdn.hstatic.net/files/')) {
      failures.push(`every <img src> must be https://cdn.hstatic.net/files/... (found: ${src})`);
    }
  }

  return {
    valid: failures.length === 0,
    failures,
    images
  };
}

async function validateDescription(content, options = {}) {
  const syncRes = validateDescriptionSync(content);
  const failures = [...syncRes.failures];
  const images = syncRes.images || [];

  // Optional network probe
  if (options.probe && images.length > 0) {
    const uniqueImages = Array.from(new Set(images));
    for (const imgUrl of uniqueImages) {
      const probeRes = await probeUrl(imgUrl, options.timeoutMs || 5000);
      if (probeRes.status !== 200) {
        failures.push(`image URL probe failed (${probeRes.status || probeRes.error}): ${imgUrl}`);
      }
    }
  }

  return {
    valid: failures.length === 0,
    failures
  };
}

module.exports = {
  validateDescription,
  validateDescriptionSync,
  probeUrl,
  ALLOWED_CHAR
};