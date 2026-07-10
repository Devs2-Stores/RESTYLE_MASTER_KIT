'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readPngInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 33) throw new Error('PNG too short');
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < sig.length; i += 1) {
    if (buffer[i] !== sig[i]) throw new Error('not a valid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let sawIHDR = false;
  let sawIEND = false;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.slice(offset, offset + 4).toString('ascii'); offset += 4;
    if (offset + length + 4 > buffer.length) throw new Error(`truncated PNG chunk: ${type}`);
    const data = buffer.slice(offset, offset + length);
    offset += length;
    offset += 4;

    if (type === 'IHDR') {
      if (length < 13) throw new Error('IHDR too short');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      sawIHDR = true;
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      sawIEND = true;
      break;
    }
  }

  if (!sawIHDR) throw new Error('missing IHDR chunk');
  if (!idatChunks.length) throw new Error('missing IDAT chunk');
  if (!sawIEND) throw new Error('missing IEND chunk');
  try {
    zlib.inflateSync(Buffer.concat(idatChunks));
  } catch (error) {
    throw new Error(`corrupt PNG image data: ${error.message}`);
  }
  return { kind: 'png', width, height, bitDepth, colorType };
}

function readJpegInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('not a JPEG');
  let i = 2;
  while (i < buffer.length) {
    while (buffer[i] !== 0xff && i < buffer.length) i += 1;
    while (buffer[i] === 0xff && i < buffer.length) i += 1;
    const marker = buffer[i];
    i += 1;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { kind: 'jpeg', height: buffer.readUInt16BE(i + 3), width: buffer.readUInt16BE(i + 5) };
    }
    const len = buffer.readUInt16BE(i);
    i += len;
  }
  throw new Error('JPEG size marker not found');
}

function readSvgInfo(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const openTag = (text.match(/<svg\b([^>]*)>/i) || [])[1] || '';
  const width = (openTag.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i) || [])[1];
  const height = (openTag.match(/\bheight=["']([0-9.]+)(?:px)?["']/i) || [])[1];
  return {
    kind: 'svg',
    width: width ? Number(width) : null,
    height: height ? Number(height) : null
  };
}

function getImageInfo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return readPngInfo(filePath);
  if (ext === '.jpg' || ext === '.jpeg') return readJpegInfo(filePath);
  if (ext === '.svg') return readSvgInfo(filePath);
  throw new Error(`unsupported image type: ${ext || 'unknown'}`);
}

module.exports = {
  readPngInfo,
  readJpegInfo,
  readSvgInfo,
  getImageInfo
};
