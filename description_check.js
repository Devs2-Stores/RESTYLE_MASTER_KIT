#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readValue, parseFiniteNumber } = require('./lib/cli-args');
const { validateDescription } = require('./lib/description-validator');

function parseArgs(argv) {
  const args = {
    file: null,
    probe: false,
    timeout: 5000,
    help: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--file') { args.file = path.resolve(readValue(argv, i, '--file')); i += 1; }
    else if (value === '--probe') args.probe = true;
    else if (value === '--timeout') { args.timeout = parseFiniteNumber(readValue(argv, i, '--timeout'), '--timeout'); i += 1; }
    else throw new Error(`Unknown argument: ${value}`);
  }

  if (!args.file && !args.help) {
    // Default fallback to ./final-showcase/THEME_DESCRIPTION.html or ./THEME_DESCRIPTION.html
    const candidates = [
      path.resolve(process.cwd(), 'final-showcase', 'THEME_DESCRIPTION.html'),
      path.resolve(process.cwd(), 'THEME_DESCRIPTION.html')
    ];
    args.file = candidates.find((f) => fs.existsSync(f)) || candidates[0];
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node description_check.js --file <THEME_DESCRIPTION.html> [--probe] [--timeout <ms>]

Validates THEME_DESCRIPTION.html against Haravan Marketplace and Partners requirements:
  - Editor fragment (no <!doctype>, <html>, <head>, <body>)
  - At least 200 characters non-empty
  - Contains h1-h3 heading and <ul> feature list
  - No HTML comments <!-- ... -->
  - No &amp; (write "và" instead)
  - Visible text and alt attributes restricted to:
    letters (including Vietnamese), digits, spaces, and . , : - ( )
    (no emoji, bullets, arrows, em dashes, curly quotes)
  - All <img src> must point to https://cdn.hstatic.net/files/...
  - --probe: performs HTTP HEAD 200 checks on all images with timeout`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return 0;
  }

  if (!fs.existsSync(args.file)) {
    console.error(`ERROR: File not found: ${args.file}`);
    return 1;
  }

  const content = fs.readFileSync(args.file, 'utf8');
  console.log(`Checking THEME_DESCRIPTION: ${args.file}`);
  const result = await validateDescription(content, {
    probe: args.probe,
    timeoutMs: args.timeout
  });

  if (!result.valid) {
    console.error(`FAIL: ${result.failures.length} issue(s) detected:`);
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  console.log('PASS: THEME_DESCRIPTION.html satisfies all Haravan Partners constraints.');
  return 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
