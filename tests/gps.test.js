import { test } from 'node:test';
import assert from 'node:assert/strict';
import exifr from 'exifr';
import { cleanFile, parseBlocks } from '../src/lib/containers.js';

const te = new TextEncoder();
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const seg = (m, pl) => cat(new Uint8Array([0xff, m, (pl.length + 2) >> 8, (pl.length + 2) & 0xff]), pl);

// Big-endian TIFF: IFD0 { Make, Model, GPS pointer } then a GPS IFD with lat/lon.
function exifWithGps() {
  const buf = new Uint8Array(400); const dv = new DataView(buf.buffer);
  buf.set([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8]);
  let p = 8; dv.setUint16(p, 3); p += 2;
  const ent = (o, tag, type, count, val) => { dv.setUint16(o, tag); dv.setUint16(o + 2, type); dv.setUint32(o + 4, count); dv.setUint32(o + 8, val); };
  const strAt = 100; buf.set(te.encode('Canon\0'), strAt); buf.set(te.encode('Canon EOS R6\0'), strAt + 8);
  ent(p, 0x010f, 2, 6, strAt); p += 12;
  ent(p, 0x0110, 2, 13, strAt + 8); p += 12;
  const gps = 160; ent(p, 0x8825, 4, 1, gps); p += 12; dv.setUint32(p, 0);
  let q = gps; dv.setUint16(q, 4); q += 2;
  const rat = 220;
  [[18, 1], [31, 1], [1234, 100], [73, 1], [51, 1], [2000, 100]].forEach(([a, b], i) => { dv.setUint32(rat + i * 8, a); dv.setUint32(rat + i * 8 + 4, b); });
  dv.setUint16(q, 1); dv.setUint16(q + 2, 2); dv.setUint32(q + 4, 2); buf.set(te.encode('N\0'), q + 8); q += 12;
  ent(q, 2, 5, 3, rat); q += 12;
  dv.setUint16(q, 3); dv.setUint16(q + 2, 2); dv.setUint32(q + 4, 2); buf.set(te.encode('E\0'), q + 8); q += 12;
  ent(q, 4, 5, 3, rat + 24); q += 12; dv.setUint32(q, 0);
  return seg(0xe1, cat(te.encode('Exif\0\0'), buf.subarray(0, 280)));
}

test('removes only the location and keeps camera details', async () => {
  const jpeg = cat(new Uint8Array([0xff, 0xd8]), exifWithGps(), new Uint8Array([0xff, 0xda, 0, 4, 1, 2, 9, 9, 0xff, 0xd9]));
  const before = await exifr.parse(jpeg, { gps: true });
  assert.ok(Math.abs(before.latitude - 18.5201) < 0.001, 'fixture has GPS');
  const { bytes, removed } = cleanFile(jpeg, { exif: false, gps: true, xmp: false, iptc: false, text: false, keepDisclosure: true });
  const after = await exifr.parse(bytes, { gps: true });
  assert.equal(after.latitude, undefined);
  assert.equal(after.Make, 'Canon');
  assert.equal(after.Model, 'Canon EOS R6');
  assert.equal(removed[0].name, 'GPS location');
  assert.equal(bytes.length, jpeg.length, 'layout untouched');
  assert.ok(parseBlocks(bytes).some((b) => b.kind === 'exif'));
});
