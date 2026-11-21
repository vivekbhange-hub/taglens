import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sniffFormat, parseBlocks, cleanFile, jpegOrientation, xmpFromBlocks, pngText, crc32,
} from '../src/lib/containers.js';
import { parseXmp } from '../src/lib/analyze.js';

const te = new TextEncoder();
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const seg = (m, payload) => cat(new Uint8Array([0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload);
const AI = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description xmp:CreatorTool="Adobe Firefly" Iptc4xmpExt:DigitalSourceType="${AI}"/></rdf:RDF></x:xmpmeta>`;

function exifWithOrientation(o) {
  return cat(te.encode('Exif\0\0'), new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, o, 0, 0, 0, 0, 0, 0, 0]));
}

function makeJpeg() {
  const scan = new Uint8Array([0xff, 0xda, 0, 4, 1, 2, 9, 9, 9, 9, 0xff, 0xd9]);
  return cat(
    new Uint8Array([0xff, 0xd8]),
    seg(0xe0, te.encode('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    seg(0xe1, exifWithOrientation(6)),
    seg(0xe1, cat(te.encode('http://ns.adobe.com/xap/1.0/\0'), te.encode(XMP))),
    seg(0xe2, te.encode('ICC_PROFILE\0\x01\x01fakeicc')),
    seg(0xeb, te.encode('JP\0\0fake-c2pa-jumbf')),
    seg(0xfe, te.encode('a comment')),
    seg(0xdb, new Uint8Array(65)),
    scan,
  );
}

test('sniffs formats', () => {
  assert.equal(sniffFormat(makeJpeg()), 'jpeg');
  assert.equal(sniffFormat(makePng()), 'png');
  assert.equal(sniffFormat(makeWebp()), 'webp');
  assert.equal(sniffFormat(cat(new Uint8Array([0, 0, 0, 24]), te.encode('ftypheic'))), 'heic');
  assert.equal(sniffFormat(new Uint8Array([1, 2, 3])), 'unknown');
});

test('parses JPEG blocks and orientation', () => {
  const b = makeJpeg();
  const kinds = parseBlocks(b).map((x) => x.kind);
  for (const k of ['exif', 'xmp', 'color', 'c2pa', 'comment', 'image']) assert.ok(kinds.includes(k), k);
  assert.equal(jpegOrientation(b, parseBlocks(b)), 6);
  const x = parseXmp(xmpFromBlocks(b, parseBlocks(b)));
  assert.equal(x.digitalSourceType, AI);
  assert.equal(x.creatorTool, 'Adobe Firefly');
});

test('JPEG clean keeps disclosure, orientation, colour and image bytes', () => {
  const b = makeJpeg();
  const { bytes, removed, added } = cleanFile(b, { exif: true, xmp: true, iptc: true, text: true, keepDisclosure: true, digitalSourceType: AI });
  const blocks = parseBlocks(bytes);
  assert.ok(blocks.some((x) => x.kind === 'c2pa'), 'credentials kept');
  assert.ok(blocks.some((x) => x.kind === 'color'), 'ICC kept');
  assert.ok(!blocks.some((x) => x.kind === 'comment'), 'comment removed');
  assert.equal(jpegOrientation(bytes, blocks), 6, 'orientation survives');
  const x = parseXmp(xmpFromBlocks(bytes, blocks));
  assert.equal(x.digitalSourceType, AI, 'AI field carried over');
  assert.equal(x.creatorTool, null, 'rest of XMP removed');
  assert.ok(removed.length >= 3);
  assert.equal(added.length, 2);
  const tail = (u) => Buffer.from(u.subarray(u.length - 12)).toString('hex');
  assert.equal(tail(bytes), tail(b), 'scan data byte-identical');
});

test('JPEG clean without disclosure drops credentials and AI field', () => {
  const { bytes } = cleanFile(makeJpeg(), { exif: true, xmp: true, iptc: true, text: true, keepDisclosure: false, digitalSourceType: AI });
  const blocks = parseBlocks(bytes);
  assert.ok(!blocks.some((x) => x.kind === 'c2pa'));
  assert.equal(xmpFromBlocks(bytes, blocks), null);
});

function chunk(type, data) {
  const body = cat(te.encode(type), data);
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(8 + data.length, crc32(body));
  return out;
}
function makePng() {
  return cat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', new Uint8Array(13)),
    chunk('tEXt', te.encode('parameters\0a cat in space, Steps: 20, Sampler: Euler')),
    chunk('tEXt', te.encode('Author\0someone')),
    chunk('IDAT', new Uint8Array([1, 2, 3, 4])),
    chunk('IEND', new Uint8Array(0)),
  );
}
function validCrcs(b) {
  for (const blk of parseBlocks(b).slice(1)) {
    const body = b.subarray(blk.start + 4, blk.end - 4);
    const crc = new DataView(b.buffer, b.byteOffset + blk.end - 4, 4).getUint32(0);
    if (crc !== crc32(body)) return false;
  }
  return true;
}

test('parses PNG AI prompt text', () => {
  const b = makePng();
  const ai = parseBlocks(b).find((x) => x.kind === 'aiParams');
  assert.equal(ai.keyword, 'parameters');
  assert.match(pngText(b, ai), /a cat in space/);
});

test('PNG clean removes prompt but writes the AI field when disclosure is kept', () => {
  const { bytes, added } = cleanFile(makePng(), { exif: true, xmp: true, iptc: true, text: true, keepDisclosure: true, digitalSourceType: AI });
  const blocks = parseBlocks(bytes);
  assert.ok(!blocks.some((x) => x.kind === 'aiParams' || x.kind === 'text'));
  assert.equal(parseXmp(xmpFromBlocks(bytes, blocks)).digitalSourceType, AI);
  assert.deepEqual(added, ['AI disclosure field (IPTC DigitalSourceType)']);
  assert.ok(validCrcs(bytes), 'all CRCs valid');
});

function riff(type, data) {
  const pad = data.length & 1 ? new Uint8Array(1) : new Uint8Array(0);
  const h = new Uint8Array(8);
  h.set(te.encode(type));
  new DataView(h.buffer).setUint32(4, data.length, true);
  return cat(h, data, pad);
}
function makeWebp() {
  const vp8x = new Uint8Array(10); vp8x[0] = 0x08 | 0x04;
  const body = cat(te.encode('WEBP'), riff('VP8X', vp8x), riff('VP8 ', new Uint8Array([1, 2, 3])), riff('EXIF', exifWithOrientation(1).subarray(6)), riff('XMP ', te.encode(XMP)));
  const h = cat(te.encode('RIFF'), new Uint8Array(4));
  new DataView(h.buffer).setUint32(4, body.length, true);
  return cat(h, body);
}

test('WebP clean updates flags and RIFF size', () => {
  const { bytes } = cleanFile(makeWebp(), { exif: true, xmp: true, iptc: true, text: true, keepDisclosure: true, digitalSourceType: AI });
  const blocks = parseBlocks(bytes);
  assert.ok(!blocks.some((x) => x.kind === 'exif'));
  assert.ok(blocks.some((x) => x.kind === 'xmp'), 'XMP kept for disclosure');
  const vp = blocks.find((x) => x.name === 'VP8X');
  assert.equal(bytes[vp.start + 8], 0x04);
  assert.equal(new DataView(bytes.buffer).getUint32(4, true), bytes.length - 8);
});

test('refuses formats it cannot rewrite', () => {
  assert.throws(() => cleanFile(cat(new Uint8Array([0, 0, 0, 24]), te.encode('ftypheic')), { exif: true }), /isn't supported/);
});
