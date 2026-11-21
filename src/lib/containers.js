// Reads and rewrites the metadata blocks of JPEG, PNG and WebP files without
// touching the image data, so cleaning never re-compresses a photo.
// Pure functions over Uint8Array: they run the same in the browser and in Node tests.

const te = new TextEncoder();
const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

/** @typedef {'image'|'color'|'exif'|'xmp'|'iptc'|'c2pa'|'comment'|'text'|'aiParams'|'mpf'|'other'} BlockKind */
/**
 * @typedef {object} Block
 * @property {BlockKind} kind
 * @property {string} name     human label
 * @property {number} start
 * @property {number} end      exclusive
 * @property {string} [keyword] PNG text keyword
 */

export const KIND_LABELS = {
  image: 'Image data',
  color: 'Colour profile',
  exif: 'EXIF (camera, date, location)',
  xmp: 'XMP (editing history, AI fields)',
  iptc: 'IPTC / Photoshop info',
  c2pa: 'Content Credentials (C2PA)',
  comment: 'Comment',
  text: 'Text fields',
  aiParams: 'AI generation settings (prompt)',
  mpf: 'Extra images (HDR / previews)',
  other: 'Other metadata',
};

/** Detect the container from magic bytes. */
export function sniffFormat(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand.startsWith('avi')) return 'avif';
    if (['heic', 'heix', 'mif1', 'msf1', 'heim', 'heis', 'hevc', 'hevx'].includes(brand)) return 'heic';
    return 'isobmff';
  }
  return 'unknown';
}

export const MIME = {
  jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  avif: 'image/avif', heic: 'image/heic', isobmff: 'video/mp4',
};

export const CLEANABLE = new Set(['jpeg', 'png', 'webp']);

/** Split a file into labelled blocks. Unknown formats return []. */
export function parseBlocks(b) {
  const f = sniffFormat(b);
  if (f === 'jpeg') return parseJpeg(b);
  if (f === 'png') return parsePng(b);
  if (f === 'webp') return parseWebp(b);
  return [];
}

// ---------------------------------------------------------------- JPEG

function parseJpeg(b) {
  /** @type {Block[]} */
  const out = [{ kind: 'image', name: 'Start of image', start: 0, end: 2 }];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    let m = b[i + 1];
    if (m === 0xff) { i++; continue; } // fill byte
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    if (m === 0xda || m === 0xd9) {
      out.push({ kind: 'image', name: 'Image data', start: i, end: b.length });
      return out;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    const end = Math.min(i + 2 + len, b.length);
    out.push(classifyJpegSegment(b, m, i, end));
    i = end;
  }
  if (i < b.length) out.push({ kind: 'image', name: 'Image data', start: i, end: b.length });
  return out;
}

function classifyJpegSegment(b, m, start, end) {
  const p = start + 4;
  const has = (s) => ascii(b, p, s.length) === s;
  const seg = (kind, name) => ({ kind, name, start, end });
  if (m === 0xe0) return seg('image', has('JFIF') ? 'JFIF header' : 'APP0');
  if (m === 0xe1 && has('Exif\0')) return seg('exif', 'EXIF');
  if (m === 0xe1 && has('http://ns.adobe.com/xap/1.0/\0')) return seg('xmp', 'XMP');
  if (m === 0xe1 && has('http://ns.adobe.com/xmp/extension/\0')) return seg('xmp', 'XMP (extended)');
  if (m === 0xe2 && has('ICC_PROFILE\0')) return seg('color', 'ICC colour profile');
  if (m === 0xe2 && has('MPF\0')) return seg('mpf', 'Multi-picture index');
  if (m === 0xeb) return seg('c2pa', 'Content Credentials (JUMBF)');
  if (m === 0xed) return seg('iptc', 'Photoshop / IPTC');
  if (m === 0xee) return seg('image', 'Adobe colour transform');
  if (m === 0xfe) return seg('comment', 'Comment');
  if (m >= 0xe0 && m <= 0xef) return seg('other', `APP${m - 0xe0}`);
  return seg('image', markerName(m));
}

function markerName(m) {
  if (m === 0xdb) return 'Quantisation tables';
  if (m === 0xc4) return 'Huffman tables';
  if (m >= 0xc0 && m <= 0xcf) return 'Frame header';
  if (m === 0xdd) return 'Restart interval';
  return `Marker 0x${m.toString(16)}`;
}

/** EXIF Orientation (1–8) from a JPEG EXIF segment, or 1. */
export function jpegOrientation(b, blocks) {
  const ex = blocks.find((x) => x.kind === 'exif');
  if (!ex) return 1;
  const t = ex.start + 10; // FFE1 len(2) "Exif\0\0"
  if (t + 8 > ex.end) return 1;
  const le = b[t] === 0x49;
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24 : b[o] * 2 ** 24 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
  const ifd = t + u32(t + 4);
  if (ifd + 2 > ex.end) return 1;
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > ex.end) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** An EXIF segment holding only Orientation, so cleaned photos don't rotate. */
function minimalExifSegment(orientation) {
  const payload = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0, 0, // Exif\0\0
    0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, // big-endian TIFF, IFD0 at 8
    0, 1, // one entry
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, // Orientation SHORT
    0, 0, 0, 0, // no next IFD
  ]);
  return jpegSegment(0xe1, payload);
}

function jpegSegment(marker, payload) {
  const len = payload.length + 2;
  const out = new Uint8Array(len + 2);
  out.set([0xff, marker, len >> 8, len & 0xff]);
  out.set(payload, 4);
  return out;
}

// ---------------------------------------------------------------- PNG

const AI_PNG_KEYWORDS = new Set([
  'parameters', 'prompt', 'workflow', 'negative_prompt', 'dream', 'sd-metadata',
  'invokeai_metadata', 'invokeai_graph', 'generation_data', 'ai_metadata',
]);

function parsePng(b) {
  /** @type {Block[]} */
  const out = [{ kind: 'image', name: 'PNG signature', start: 0, end: 8 }];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    const end = Math.min(i + 12 + len, b.length);
    const blk = { kind: 'image', name: type, start: i, end };
    if (type === 'eXIf') Object.assign(blk, { kind: 'exif', name: 'EXIF' });
    else if (type === 'caBX') Object.assign(blk, { kind: 'c2pa', name: 'Content Credentials (caBX)' });
    else if (['iCCP', 'sRGB', 'gAMA', 'cHRM', 'cICP'].includes(type)) blk.kind = 'color';
    else if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const kw = readKeyword(b, i + 8, i + 8 + len);
      blk.keyword = kw;
      if (kw === 'XML:com.adobe.xmp') Object.assign(blk, { kind: 'xmp', name: 'XMP' });
      else if (AI_PNG_KEYWORDS.has(kw.toLowerCase())) Object.assign(blk, { kind: 'aiParams', name: `Text “${kw}”` });
      else if (/^comment$/i.test(kw)) Object.assign(blk, { kind: 'comment', name: `Text “${kw}”` });
      else Object.assign(blk, { kind: 'text', name: `Text “${kw}”` });
    } else if (type === 'tIME') Object.assign(blk, { kind: 'text', name: 'Last-modified time' });
    out.push(blk);
    i = end;
    if (type === 'IEND') break;
  }
  if (i < b.length) out.push({ kind: 'other', name: 'Data after end', start: i, end: b.length });
  return out;
}

function readKeyword(b, s, e) {
  let k = s;
  while (k < e && k < s + 80 && b[k] !== 0) k++;
  return latin1.decode(b.subarray(s, k));
}

/** Readable text of an uncompressed tEXt / iTXt chunk (zTXt returns null). */
export function pngText(b, blk) {
  const type = ascii(b, blk.start + 4, 4);
  const s = blk.start + 8;
  const e = blk.end - 4;
  let k = s;
  while (k < e && b[k] !== 0) k++;
  if (type === 'tEXt') return latin1.decode(b.subarray(k + 1, e));
  if (type === 'iTXt') {
    const compressed = b[k + 1] === 1;
    if (compressed) return null;
    let p = k + 3;
    while (p < e && b[p] !== 0) p++; // language tag
    p++;
    while (p < e && b[p] !== 0) p++; // translated keyword
    return utf8.decode(b.subarray(p + 1, e));
  }
  return null;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(te.encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function pngXmpChunk(xmp) {
  const kw = te.encode('XML:com.adobe.xmp');
  const text = te.encode(xmp);
  const data = new Uint8Array(kw.length + 5 + text.length);
  data.set(kw, 0); // then \0, compression flag 0, method 0, empty lang \0, empty translated \0
  data.set(text, kw.length + 5);
  return pngChunk('iTXt', data);
}

let CRC_TABLE;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- WebP

function parseWebp(b) {
  /** @type {Block[]} */
  const out = [{ kind: 'image', name: 'RIFF header', start: 0, end: 12 }];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    const end = Math.min(i + 8 + size + (size & 1), b.length);
    const blk = { kind: 'image', name: type.trim(), start: i, end };
    if (type === 'EXIF') Object.assign(blk, { kind: 'exif', name: 'EXIF' });
    else if (type === 'XMP ') Object.assign(blk, { kind: 'xmp', name: 'XMP' });
    else if (type === 'C2PA') Object.assign(blk, { kind: 'c2pa', name: 'Content Credentials' });
    else if (type === 'ICCP') Object.assign(blk, { kind: 'color', name: 'ICC colour profile' });
    else if (!['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF'].includes(type)) blk.kind = 'other';
    out.push(blk);
    i = end;
  }
  return out;
}

// ---------------------------------------------------------------- shared

/** Text of the first XMP packet found in the blocks (or null). */
export function xmpFromBlocks(b, blocks) {
  const parts = blocks.filter((x) => x.kind === 'xmp').map((x) => utf8.decode(b.subarray(x.start, x.end)));
  if (!parts.length) return null;
  const joined = parts.join('\n');
  const s = joined.indexOf('<x:xmpmeta');
  return s >= 0 ? joined.slice(s) : joined;
}

/** Last-resort XMP search over the raw file (HEIC, AVIF, video). */
export function xmpFromRaw(b, limit = 64 * 1024 * 1024) {
  const text = latin1.decode(b.length > limit ? b.subarray(0, limit) : b);
  const s = text.indexOf('<x:xmpmeta');
  if (s < 0) return null;
  const e = text.indexOf('</x:xmpmeta>', s);
  const raw = text.slice(s, e < 0 ? s + 200000 : e + 12);
  return utf8.decode(Uint8Array.from(raw, (ch) => ch.charCodeAt(0)));
}

export function minimalXmp(digitalSourceType) {
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">'
    + `<Iptc4xmpExt:DigitalSourceType>${escapeXml(digitalSourceType)}</Iptc4xmpExt:DigitalSourceType>`
    + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

/**
 * @typedef {object} CleanOptions
 * @property {boolean} exif       remove EXIF (location, camera, serial, dates)
 * @property {boolean} xmp        remove XMP (editing history, creator tool)
 * @property {boolean} iptc       remove IPTC / Photoshop block
 * @property {boolean} text       remove comments, PNG text fields and AI prompt settings
 * @property {boolean} keepDisclosure keep Content Credentials and the IPTC AI field
 * @property {string|null} [digitalSourceType] AI field to carry over when XMP is removed
 */

/**
 * Rewrite a file without the chosen metadata. Image data is copied byte for byte.
 * @returns {{ bytes: Uint8Array, removed: Block[], added: string[] }}
 */
export function cleanFile(b, opts) {
  const f = sniffFormat(b);
  if (!CLEANABLE.has(f)) throw new Error(`Cleaning ${f.toUpperCase()} files isn't supported yet.`);
  const blocks = parseBlocks(b);
  const drop = (blk) => {
    switch (blk.kind) {
      case 'exif': return opts.exif;
      case 'xmp': return opts.xmp;
      case 'iptc': return opts.iptc;
      case 'comment': case 'text': case 'aiParams': return opts.text;
      case 'c2pa': return !opts.keepDisclosure;
      default: return false; // image data, colour, MPF and unknown blocks always stay
    }
  };
  // Write a minimal XMP with the AI field when disclosure must be kept but no XMP survives.
  const xmpSurvives = blocks.some((x) => x.kind === 'xmp' && !drop(x));
  const dst = opts.keepDisclosure && !xmpSurvives ? opts.digitalSourceType || null : null;
  if (f === 'jpeg') return cleanJpeg(b, blocks, drop, dst);
  if (f === 'png') return cleanPng(b, blocks, drop, dst);
  return cleanWebp(b, blocks, drop, dst);
}

const DISCLOSURE_NOTE = 'AI disclosure field (IPTC DigitalSourceType)';

function cleanJpeg(b, blocks, drop, dst) {
  const parts = [];
  const removed = [];
  const added = [];
  const orientation = jpegOrientation(b, blocks);
  let exifDone = false;
  let xmpDone = !dst;
  const xmpSeg = () => jpegSegment(0xe1, concat([te.encode('http://ns.adobe.com/xap/1.0/\0'), te.encode(minimalXmp(dst))]));
  for (const blk of blocks) {
    // Insert the disclosure XMP before the image data if no XMP slot came up earlier.
    if (!xmpDone && blk.kind === 'image' && blk.name === 'Image data') {
      parts.push(xmpSeg()); added.push(DISCLOSURE_NOTE); xmpDone = true;
    }
    if (!drop(blk)) {
      parts.push(b.subarray(blk.start, blk.end));
      if (!xmpDone && blk.name === 'JFIF header') { parts.push(xmpSeg()); added.push(DISCLOSURE_NOTE); xmpDone = true; }
      continue;
    }
    removed.push(blk);
    if (blk.kind === 'exif' && !exifDone && orientation !== 1) {
      parts.push(minimalExifSegment(orientation));
      added.push(`Orientation (${orientation}) so the photo stays the right way up`);
      exifDone = true;
    }
    if (blk.kind === 'xmp' && !xmpDone) {
      parts.push(xmpSeg()); added.push(DISCLOSURE_NOTE); xmpDone = true;
    }
  }
  return { bytes: concat(parts), removed, added };
}

function cleanPng(b, blocks, drop, dst) {
  const parts = [];
  const removed = [];
  const added = [];
  let xmpDone = !dst;
  for (const blk of blocks) {
    if (!drop(blk)) {
      parts.push(b.subarray(blk.start, blk.end));
      if (!xmpDone && blk.name === 'IHDR') { parts.push(pngXmpChunk(minimalXmp(dst))); added.push(DISCLOSURE_NOTE); xmpDone = true; }
      continue;
    }
    removed.push(blk);
  }
  return { bytes: concat(parts), removed, added };
}

function cleanWebp(b, blocks, drop0, dst) {
  // WebP: when the AI field must be kept, keep the original XMP chunk whole.
  const drop = (blk) => (blk.kind === 'xmp' && dst ? false : drop0(blk));
  const kept = blocks.slice(1).filter((x) => !drop(x));
  const removed = blocks.filter((x) => drop(x));
  const body = concat(kept.map((x) => b.subarray(x.start, x.end)));
  // Update VP8X flags for EXIF (0x08) and XMP (0x04) to match what's left.
  const vp = kept.findIndex((x) => x.name === 'VP8X');
  if (vp >= 0) {
    let off = 0;
    for (let k = 0; k < vp; k++) off += kept[k].end - kept[k].start;
    let flags = body[off + 8];
    if (!kept.some((x) => x.kind === 'exif')) flags &= ~0x08;
    if (!kept.some((x) => x.kind === 'xmp')) flags &= ~0x04;
    body[off + 8] = flags;
  }
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  const added = dst && blocks.some((x) => x.kind === 'xmp') ? ['Kept XMP so the AI disclosure field stays'] : [];
  return { bytes: concat([head, body]), removed, added };
}

// ---------------------------------------------------------------- helpers

function ascii(b, s, n) {
  let r = '';
  for (let i = s; i < s + n && i < b.length; i++) r += String.fromCharCode(b[i]);
  return r;
}
function u32be(b, o) { return b[o] * 2 ** 24 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); }
function u32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24; }
function concat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
