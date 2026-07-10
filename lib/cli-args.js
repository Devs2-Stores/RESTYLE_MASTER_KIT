'use strict';

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function normalizeEnum(value, flag, allowed) {
  if (!allowed.includes(value)) throw new Error(`Invalid ${flag} value: ${value}`);
  return value;
}

function readEnum(argv, index, flag, allowed) {
  return normalizeEnum(readValue(argv, index, flag), flag, allowed);
}

function parseFiniteNumber(value, flag) {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error(`Invalid numeric value for ${flag}: ${value}`);
  return num;
}

function parseCsv(raw, mapFn = (value) => value) {
  return String(raw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(mapFn);
}

module.exports = {
  readValue,
  normalizeEnum,
  readEnum,
  parseFiniteNumber,
  parseCsv
};
