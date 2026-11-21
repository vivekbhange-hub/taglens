import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, describeSource, aiToolHint, privacyFields } from '../src/lib/analyze.js';

const D = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
const base = { format: 'jpeg', c2pa: null, c2paError: null, c2paBlock: false, xmp: null, exif: null, pngText: [] };

function store(dst, generator = 'Adobe Firefly') {
  return {
    active_manifest: 'urn:a',
    validation_state: 'Valid',
    manifests: {
      'urn:a': {
        claim_generator_info: [{ name: generator, version: '3.0' }],
        signature_info: { issuer: 'Adobe Inc.', time: '2026-10-01T10:00:00Z' },
        assertions: [{ label: 'c2pa.actions.v2', data: { actions: [{ action: 'c2pa.created', digitalSourceType: dst, softwareAgent: { name: generator } }] } }],
        ingredients: [],
      },
    },
  };
}

test('classifies source types', () => {
  assert.equal(describeSource(`${D}trainedAlgorithmicMedia`).group, 'generated');
  assert.equal(describeSource(`${D}compositeWithTrainedAlgorithmicMedia`).group, 'aiEdited');
  assert.equal(describeSource(`${D}digitalCapture`).group, 'camera');
  assert.equal(describeSource('http://c2pa.org/digitalsourcetype/trainedAlgorithmicData').group, 'generated');
});

test('C2PA generated → AI label on Meta and TikTok', () => {
  const r = buildReport({ ...base, c2pa: store(`${D}trainedAlgorithmicMedia`), c2paBlock: true });
  assert.equal(r.verdict.key, 'generated');
  assert.equal(r.credentials.generator, 'Adobe Firefly 3.0');
  assert.equal(r.platforms[0].level, 'label');
  assert.equal(r.platforms[1].level, 'label');
  assert.equal(r.platforms[3].level, 'badge');
});

test('XMP composite → AI info in menu', () => {
  const xmp = `<x:xmpmeta><rdf:Description><Iptc4xmpExt:DigitalSourceType>${D}compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></rdf:Description></x:xmpmeta>`;
  const r = buildReport({ ...base, xmp });
  assert.equal(r.verdict.key, 'aiEdited');
  assert.equal(r.platforms[0].level, 'menu');
  assert.equal(r.carryDigitalSourceType, `${D}compositeWithTrainedAlgorithmicMedia`);
});

test('PNG prompt → prompt-only verdict, no platform label, cleaner carries the AI field', () => {
  const r = buildReport({ ...base, format: 'png', pngText: [{ keyword: 'parameters', text: 'a cat' }] });
  assert.equal(r.verdict.key, 'promptOnly');
  assert.equal(r.platforms[0].level, 'none');
  assert.equal(r.carryDigitalSourceType, `${D}trainedAlgorithmicMedia`);
});

test('camera credentials → captured-with-camera badge on YouTube', () => {
  const r = buildReport({ ...base, c2pa: store(`${D}digitalCapture`, 'Leica M11-P') });
  assert.equal(r.verdict.key, 'camera');
  assert.equal(r.platforms[2].level, 'badge');
});

test('tool hint without declaration', () => {
  assert.equal(aiToolHint('Adobe Photoshop 26.0 (Generative Fill)'), 'generative fill');
  const r = buildReport({ ...base, exif: { Software: 'Midjourney v7' } });
  assert.equal(r.verdict.key, 'hint');
});

test('nothing found', () => {
  const r = buildReport(base);
  assert.equal(r.verdict.key, 'none');
  assert.equal(r.signals.length, 0);
  assert.ok(r.platforms.every((p) => p.level === 'none'));
});

test('privacy fields flag GPS and serials', () => {
  assert.equal(privacyFields({ Make: 'Canon', Model: 'Canon EOS R6' })[0].value, 'Canon EOS R6');
  const p = privacyFields({ latitude: 18.52, longitude: 73.85, BodySerialNumber: 'X123', Make: 'Canon', Model: 'R6' });
  assert.equal(p.find((x) => x.field === 'GPS location').risk, 'high');
  assert.ok(p.some((x) => x.field === 'Camera serial number'));
  assert.equal(p.find((x) => x.field === 'Device').value, 'Canon R6');
});
