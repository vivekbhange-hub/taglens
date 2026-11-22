// Browser glue: reads the dropped file, runs the parsers and renders the report.
// Every string that comes from a file is attacker-controlled, so it goes through esc().

import exifr from 'exifr';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import {
  sniffFormat, parseBlocks, cleanFile, xmpFromBlocks, xmpFromRaw, pngText, KIND_LABELS, MIME, CLEANABLE,
} from '../lib/containers.js';
import { buildReport, describeSource, PLATFORMS_REVIEWED } from '../lib/analyze.js';

const MAX_BYTES = 300 * 1024 * 1024;
const KIND_COLOR = {
  image: 'var(--k-image)', color: 'var(--k-color)', exif: 'var(--k-exif)', xmp: 'var(--k-xmp)', iptc: 'var(--k-iptc)',
  c2pa: 'var(--k-c2pa)', comment: 'var(--k-text)', text: 'var(--k-text)', aiParams: 'var(--k-ai)', mpf: 'var(--k-color)', other: 'var(--k-other)',
};
const DEFAULT_CLEAN = { exif: true, gps: true, xmp: true, iptc: true, text: true };
const ORDER = ['platforms', 'evidence', 'credentials', 'anatomy', 'privacy', 'clean'];

let c2paPromise = null;
let previewUrl = null;
let current = null; // { file, bytes, format, blocks, report, texts }
let preset = { focus: null, clean: DEFAULT_CLEAN };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kb = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mount() {
  try {
    const p = JSON.parse($('checker')?.dataset.preset || '{}');
    preset = { focus: p.focus || null, clean: { ...DEFAULT_CLEAN, ...(p.clean || {}) } };
  } catch { /* keep defaults */ }

  const input = $('file');
  input.addEventListener('change', () => input.files[0] && handle(input.files[0]));

  // Accept a drop anywhere on the page; the tag (or a veil, after a result) shows it's armed.
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (f) handle(f);
  });
  window.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f) handle(f);
  });
}

function status(msg, isError = false) {
  const s = $('status');
  s.textContent = msg;
  s.classList.toggle('error', isError);
}

async function getC2pa() {
  if (!c2paPromise) {
    c2paPromise = import('@contentauth/c2pa-web').then(async (mod) => ({ mod, c2pa: await mod.createC2pa({ wasmSrc }) }));
  }
  return c2paPromise;
}

async function readCredentials(file, bytes, format) {
  try {
    const { mod, c2pa } = await getC2pa();
    const mime = MIME[format] || file.type || 'application/octet-stream';
    const reader = await mod.Reader.fromBlob(c2pa, mime, new Blob([bytes], { type: mime }));
    if (!reader) return { store: null, error: null };
    const store = await reader.manifestStore();
    await reader.free();
    return { store, error: null };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/JumbfNotFound|no.*manifest|ManifestNotFound|NotFound/i.test(msg)) return { store: null, error: null };
    return { store: null, error: msg.slice(0, 200) };
  }
}

async function readExif(bytes, format, blocks) {
  const opts = { tiff: true, ifd0: true, exif: true, gps: true, iptc: true, xmp: false, icc: false, mergeOutput: true };
  try {
    if (format === 'webp') {
      const ex = blocks.find((b) => b.kind === 'exif');
      if (!ex) return null;
      let tiff = bytes.subarray(ex.start + 8, ex.end);
      if (tiff[0] === 0x45 && tiff[1] === 0x78) tiff = tiff.subarray(6); // optional "Exif\0\0"
      return (await exifr.parse(tiff, opts)) || null;
    }
    return (await exifr.parse(bytes, opts)) || null;
  } catch {
    return null;
  }
}

async function handle(file, note = '') {
  if (file.size > MAX_BYTES) { status(`That file is ${kb(file.size)}. TagLens handles files up to ${kb(MAX_BYTES)}.`, true); return; }
  status(`Reading ${file.name}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = sniffFormat(bytes);
    if (format === 'unknown') { status('That isn’t a supported image or video. Try a JPEG, PNG, WebP, HEIC, AVIF, MP4 or MOV file.', true); return; }
    const blocks = parseBlocks(bytes);
    const c2paBlock = blocks.some((b) => b.kind === 'c2pa');
    const needC2pa = c2paBlock || !CLEANABLE.has(format);
    if (needC2pa) status('Checking Content Credentials…');
    const [cred, exif] = await Promise.all([
      needC2pa ? readCredentials(file, bytes, format) : { store: null, error: null },
      readExif(bytes, format, blocks),
    ]);
    const xmp = CLEANABLE.has(format) ? xmpFromBlocks(bytes, blocks) : xmpFromRaw(bytes);
    const texts = blocks.filter((b) => ['text', 'aiParams', 'comment'].includes(b.kind) && b.keyword)
      .map((b) => ({ keyword: b.keyword, text: pngText(bytes, b), kind: b.kind }));
    const report = buildReport({
      format, c2pa: cred.store, c2paError: cred.error, c2paBlock: c2paBlock || Boolean(cred.store), xmp, exif, pngText: texts,
    });
    current = { file, bytes, format, blocks, report, texts, exif };
    status('');
    show(note);
  } catch (err) {
    console.error(err);
    status(`Couldn’t read that file: ${err?.message || err}`, true);
  }
}

/** Swap in the report. The drop tag morphs into the result tag where View Transitions exist. */
function show(note) {
  const apply = () => {
    render(note);
    $('checker')?.classList.add('has-result');
    document.body.classList.add('result-mode');
  };
  const after = () => {
    const top = $('results').getBoundingClientRect().top + scrollY - 76;
    scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    // The drop zone that had focus is gone; move focus to the verdict so keyboard
    // and screen-reader users land on the result.
    $('verdict')?.focus({ preventScroll: true });
  };
  if (document.startViewTransition && !reducedMotion()) {
    scrollTo({ top: 0 });
    document.startViewTransition(apply).finished.finally(after);
  } else {
    apply(); after();
  }
}

// ---------------------------------------------------------------- render

const STAMP = {
  generated: ['AI declared', 'ai'], aiEdited: ['AI edit declared', 'ai'], enhanced: ['Enhanced', 'warn'],
  promptOnly: ['Prompt saved', 'warn'], hint: ['AI tool named', 'warn'], algorithmic: ['Algorithmic', 'info'],
  camera: ['Camera capture', 'ok'], credentials: ['Credentials', 'info'], none: ['No AI declared', 'ok'],
};

function render(note) {
  const { file, bytes, format, blocks, report } = current;
  const el = $('results');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  const isVideo = format === 'isobmff' || file.type.startsWith('video/');
  const media = isVideo
    ? `<video src="${previewUrl}" muted playsinline preload="metadata"></video>`
    : `<img src="${previewUrl}" alt="Your file" />`;
  const [stampText, stampTone] = STAMP[report.verdict.key] || [report.verdict.key, 'info'];
  const c = report.credentials;
  const SHORT = { generated: 'Made by AI', aiEdited: 'Edited with AI', enhanced: 'Enhanced by an algorithm', camera: 'Camera capture', algorithmic: 'Made by an algorithm' };
  const declared = report.signals.find((s) => s.strength === 'declared');
  const source = declared && { title: declared.source === 'PNG text' ? 'AI prompt saved' : SHORT[declared.group] || declared.title };
  const shortName = file.name.length > 30 ? `${file.name.slice(0, 16)}…${file.name.slice(-11)}` : file.name;
  const tagRows = [
    ['File', shortName],
    ['Type', `${format.toUpperCase()}, ${kb(bytes.length)}`],
    c?.generator && ['Made with', c.generator],
    source && ['Says', source.title],
    c?.issuer && ['Signed by', c.issuer],
    report.privacy.some((p) => p.field === 'GPS location') && ['Location', 'Included'],
  ].filter(Boolean);

  const has = (k) => blocks.some((b) => b.kind === k);
  const found = !CLEANABLE.has(format) ? [] : [
    report.privacy.some((p) => p.field === 'GPS location') && 'your GPS location',
    has('exif') && 'camera details',
    has('xmp') && 'editing history',
    has('iptc') && 'captions and contact details',
    has('aiParams') && 'your AI prompt',
    (has('text') || has('comment')) && 'hidden text fields',
  ].filter(Boolean);

  const aiDeclared = report.carryDigitalSourceType || report.signals.some((x) => x.strength === 'declared' && ['generated', 'aiEdited'].includes(x.group));
  const keepNote = aiDeclared ? ' and keeps the AI disclosure' : has('c2pa') ? ' and keeps the Content Credentials' : '';

  const sections = {
    platforms: platformsHtml(report),
    evidence: signalsHtml(report),
    credentials: credentialsHtml(report),
    anatomy: blocks.length ? anatomyHtml(blocks, bytes.length) : '',
    privacy: privacyHtml(report, current.texts),
    clean: cleanerHtml(),
  };
  const order = preset.focus ? [preset.focus, ...ORDER.filter((k) => k !== preset.focus)] : ORDER;
  const body = order.map((k) => (k === preset.focus ? sections[k].replace('class="part', 'class="part focus') : sections[k])).join('');

  el.innerHTML = `
    <div class="exhibit">
      <div class="specimen">
        <div class="print">${media}</div>
        <div class="tag" aria-label="File tag">
          <dl>${tagRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          <span class="stamp ${stampTone}">${esc(stampText)}</span>
        </div>
      </div>
      <div class="reading">
        ${note ? `<p class="note-pill">${esc(note)}</p>` : ''}
        <h2 id="verdict" tabindex="-1">${esc(report.verdict.title)}</h2>
        <p class="sum">${esc(report.verdict.summary)}</p>
        <div class="acts">
          ${found.length ? '<button class="btn" id="quick-clean"><svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Download private copy</button>' : ''}
          <button class="btn ${found.length ? 'quiet' : ''}" id="again">Check another file</button>
          <button class="btn quiet" id="copy">Copy summary</button>
        </div>
        ${found.length
          ? `<div class="quick-note" id="quick-done">This file contains ${esc(listJoin(found))}. The download removes ${found.length === 1 ? 'it' : 'them'}${keepNote}. <a href="#cleaner">Choose what to remove</a></div>`
          : CLEANABLE.has(format) ? '<div class="quick-note">Nothing private to remove: no location, camera details, editing history or hidden text.</div>' : ''}
      </div>
    </div>
    ${body}
  `;
  const img = el.querySelector('.print img');
  if (img) img.addEventListener('error', () => { img.outerHTML = '<div class="noprev">Your browser can’t preview this format, but the file was read.</div>'; });
  el.hidden = false;
  $('again').onclick = () => { $('file').value = ''; $('file').click(); };
  $('copy').onclick = copySummary;
  wireCleaner();
}

function listJoin(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function platformsHtml(r) {
  return `<section class="part"><h2>What each platform will likely do <small>based on the file alone</small></h2>
    <table class="ledger"><tbody>${r.platforms.map((p) => `
      <tr><td>${esc(p.name)}</td><td class="lv-${p.level}"><span class="mk" aria-hidden="true"></span>${esc(p.outcome)}</td><td>${esc(p.note)}</td></tr>`).join('')}
    </tbody></table>
    <p class="aside">From each platform’s public policy, last reviewed ${PLATFORMS_REVIEWED}. Platforms can also label a post from invisible watermarks or their own detection, which no file reader can see.</p></section>`;
}

function signalsHtml(r) {
  if (!r.signals.length) {
    return `<section class="part"><h2>Evidence</h2><p class="empty">No AI declarations, AI tool names or generation settings in this file.</p></section>`;
  }
  return `<section class="part"><h2>Evidence <small>${r.signals.length} found</small></h2><ul class="findings">${r.signals.map((s) => `
    <li><span class="kind ${s.strength}">${s.strength === 'declared' ? 'Declared' : 'Hint'}</span>
      <div><strong>${esc(s.title)}</strong><span class="d">${esc(s.detail)}</span><span class="src">Found in: ${esc(s.source)}</span></div></li>`).join('')}
  </ul></section>`;
}

function credentialsHtml(r) {
  const c = r.credentials;
  if (!c) {
    return preset.focus === 'credentials'
      ? `<section class="part"><h2>Content Credentials</h2><p class="empty">This file has no Content Credentials. They may never have been added, or a screenshot, re-save or upload removed them.</p></section>`
      : '';
  }
  const steps = c.actions.map((a) => {
    const src = a.digitalSourceType ? `. ${describeSource(a.digitalSourceType).label}` : '';
    const when = a.when ? ` <small>${esc(a.when.slice(0, 10))}</small>` : '';
    return `<li>${esc(prettyAction(a.action))}${a.softwareAgent ? ` in <strong>${esc(a.softwareAgent)}</strong>` : ''}${esc(src)}${when}${a.depth ? ' <small>(earlier version)</small>' : ''}</li>`;
  }).join('');
  const ings = c.ancestry.map((g) => `<li class="ing">Used “${esc(g.title)}” <small>${esc(relName(g.relationship))}${g.hasCredentials ? ', with its own credentials' : ''}</small></li>`).join('');
  const state = { Trusted: ['Valid, from a trusted signer', 'good'], Valid: ['Valid signature', 'good'], Invalid: ['Doesn’t verify: the file changed after signing', 'bad'] }[c.state] || [c.state, ''];
  return `<section class="part"><h2>Content Credentials</h2><div class="cred">
    <dl class="facts">
      ${c.generator ? `<dt>Made with</dt><dd>${esc(c.generator)}</dd>` : ''}
      ${c.issuer ? `<dt>Signed by</dt><dd>${esc(c.issuer)}</dd>` : ''}
      ${c.signedAt ? `<dt>Signed on</dt><dd>${esc(c.signedAt.replace('T', ' ').slice(0, 16))}</dd>` : ''}
      <dt>Signature</dt><dd class="${state[1]}">${esc(state[0])}</dd>
      <dt>History</dt><dd>${c.manifestCount} signed step${c.manifestCount === 1 ? '' : 's'}</dd>
    </dl>
    <div>${steps || ings ? `<ul class="steps">${steps}${ings}</ul>` : '<p class="empty">No edit history recorded.</p>'}</div>
  </div>
  <p class="aside">To double-check, use the official <a href="https://contentcredentials.org/verify" rel="noopener">Content Credentials verify site</a>. Unlike TagLens, it uploads your file.</p></section>`;
}

function relName(r) {
  return { parentOf: 'as the starting image', componentOf: 'as a part', inputTo: 'as an input' }[r] || r;
}

function prettyAction(a) {
  return String(a || 'Action').replace(/^c2pa\./, '').replace(/[_.]/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
}

function anatomyHtml(blocks, total) {
  const merged = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    const size = b.end - b.start;
    if (last && last.kind === b.kind) last.size += size; else merged.push({ kind: b.kind, size });
  }
  // Square-root scale so small metadata blocks stay visible next to image data.
  const w = merged.map((m) => Math.sqrt(m.size));
  const sum = w.reduce((a, x) => a + x, 0);
  const kinds = [...new Set(blocks.map((b) => b.kind))];
  const meta = blocks.filter((b) => b.kind !== 'image').reduce((a, b) => a + b.end - b.start, 0);
  return `<section class="part"><h2>Inside the file <small>${kb(meta)} of hidden data in a ${kb(total)} file, in file order</small></h2>
    <div class="strip" role="img" aria-label="File layout">${merged.map((m, i) => `<span style="--c:${KIND_COLOR[m.kind]};flex:${(w[i] / sum).toFixed(4)}" title="${esc(KIND_LABELS[m.kind])}: ${kb(m.size)}"></span>`).join('')}</div>
    <div class="key">${kinds.map((k) => {
      const n = blocks.filter((b) => b.kind === k).reduce((a, b) => a + b.end - b.start, 0);
      return `<span><i style="--c:${KIND_COLOR[k]}"></i>${esc(KIND_LABELS[k])}, ${kb(n)}</span>`;
    }).join('')}</div></section>`;
}

function privacyHtml(r, texts) {
  const ex = current.exif;
  const rows = r.privacy.map((p) => {
    const map = p.field === 'GPS location' && ex
      ? ` <a href="https://www.openstreetmap.org/?mlat=${Number(ex.latitude).toFixed(5)}&mlon=${Number(ex.longitude).toFixed(5)}#map=15/${Number(ex.latitude).toFixed(5)}/${Number(ex.longitude).toFixed(5)}" target="_blank" rel="noopener noreferrer" title="Opens OpenStreetMap, which will receive these coordinates">Show on a map</a>`
      : '';
    return `<tr><td>${esc(p.field)}</td><td>${esc(p.value)}${map}</td><td class="risk-${p.risk}">${p.risk}</td></tr>`;
  });
  const prompts = texts.filter((t) => t.kind === 'aiParams');
  const other = texts.filter((t) => t.kind !== 'aiParams');
  for (const t of prompts) {
    rows.push(`<tr><td>AI prompt (“${esc(t.keyword)}”)</td><td>${t.text ? `<div class="typed">${esc(t.text.slice(0, 4000))}</div>` : 'Compressed text'}</td><td class="risk-high">high</td></tr>`);
  }
  if (other.length) {
    // Tools like ImageMagick copy EXIF into dozens of PNG text fields; fold them into one row.
    const sensitive = other.some((t) => /serial|gps|owner|artist|author|location|latitude/i.test(t.keyword));
    const list = other.map((t) => `${esc(t.keyword)}: ${esc((t.text || 'compressed').slice(0, 160))}`).join('\n');
    rows.push(`<tr><td>Text fields (${other.length})</td><td><details><summary>${esc(other.slice(0, 3).map((t) => t.keyword).join(', '))}${other.length > 3 ? ' and more' : ''}</summary><div class="typed">${list}</div></details></td><td class="risk-${sensitive ? 'high' : 'low'}">${sensitive ? 'high' : 'low'}</td></tr>`);
  }
  if (!rows.length) return `<section class="part"><h2>Private data</h2><p class="empty">No location, serial numbers, owner names or hidden text in this file.</p></section>`;
  const high = rows.filter((x) => x.includes('risk-high')).length;
  return `<section class="part"><h2>Private data <small>${high ? `${high} high-risk item${high === 1 ? '' : 's'}. ` : ''}Anyone with the original file can read this.</small></h2>
    <table class="priv"><tbody>${rows.join('')}</tbody></table></section>`;
}

// ---------------------------------------------------------------- cleaner

function cleanerHtml() {
  const { format, blocks, report } = current;
  if (!CLEANABLE.has(format)) {
    return `<section class="part cleaner"><h2>Clean private data</h2><p class="empty">TagLens can’t rewrite ${esc(format.toUpperCase())} files yet. Export a JPEG copy first, or use your phone’s “remove location” option when sharing.</p></section>`;
  }
  const has = (k) => blocks.some((b) => b.kind === k);
  const pc = preset.clean;
  const opt = (id, on, enabled, title, sub, cls = '') => `
    <label class="opt${enabled ? '' : ' off'}${cls}"><input type="checkbox" id="${id}" ${on && enabled ? 'checked' : ''} ${enabled ? '' : 'disabled'} />
      <span><strong>${title}</strong><small>${sub}</small></span></label>`;
  const hasAi = report.signals.some((s) => s.strength === 'declared' && ['generated', 'aiEdited'].includes(s.group));
  const hasGps = report.privacy.some((p) => p.field === 'GPS location');
  const hasText = has('comment') || has('text') || has('aiParams');
  return `<section class="part cleaner" id="cleaner"><h2>Clean private data <small>for your own photos, with no quality loss</small></h2>
    <div class="opts">
      ${opt('o-exif', pc.exif, has('exif'), 'All camera data', has('exif') ? 'Location, device, serial numbers and timestamps. Orientation is kept.' : 'Not in this file.')}
      ${opt('o-gps', pc.gps, has('exif') && hasGps, 'Only the location', hasGps ? 'Keep camera and date details, remove just the GPS position.' : 'No GPS location in this file.', ' sub')}
      ${opt('o-xmp', pc.xmp, has('xmp'), 'Editing history and software', has('xmp') ? 'Apps used, edit history and document IDs.' : 'Not in this file.')}
      ${opt('o-iptc', pc.iptc, has('iptc'), 'Captions and contact details', has('iptc') ? 'IPTC and Photoshop info: captions, keywords, creator contact.' : 'Not in this file.')}
      ${opt('o-text', pc.text, hasText, 'Comments, text and AI prompts', has('aiParams') ? 'Includes the prompt and settings your AI image tool saved.' : hasText ? 'Comments and text fields.' : 'Not in this file.')}
      <label class="opt keep"><input type="checkbox" id="o-keep" checked />
        <span><strong>Keep the AI disclosure and Content Credentials</strong><small>Recommended. The image stays honest about how it was made.${hasAi ? ' This file declares AI.' : ''}</small></span></label>
    </div>
    <div id="clean-warn"></div>
    <button class="btn" id="clean">Clean and download</button>
    <div id="clean-done" class="done"></div>
  </section>`;
}

function readOpts() {
  const v = (id) => Boolean($(id)?.checked);
  return {
    exif: v('o-exif'), gps: v('o-gps'), xmp: v('o-xmp'), iptc: v('o-iptc'), text: v('o-text'),
    keepDisclosure: v('o-keep'), digitalSourceType: current.report.carryDigitalSourceType,
  };
}

function wireCleaner() {
  const btn = $('clean');
  if (!btn) return;
  const gps = $('o-gps');
  const gpsAvailable = gps && !gps.disabled;
  const update = () => {
    // "Only the location" is a lighter alternative to removing all camera data.
    if (gpsAvailable) {
      const all = $('o-exif').checked;
      gps.disabled = all;
      gps.closest('.opt').classList.toggle('off', all);
    }
    const o = readOpts();
    const gpsOnly = o.gps && !o.exif;
    const hasCred = current.blocks.some((b) => b.kind === 'c2pa');
    const removing = o.exif || gpsOnly || o.xmp || o.iptc || o.text;
    const hasAi = current.report.signals.some((s) => s.strength === 'declared' && ['generated', 'aiEdited'].includes(s.group));
    let msg = '';
    if (o.keepDisclosure && hasCred && removing) {
      msg = 'Content Credentials are signed over the whole file. Removing other data keeps the record, but it will show as “doesn’t verify”.';
    } else if (!o.keepDisclosure && hasAi) {
      msg = 'You’re removing this file’s AI disclosure. If the image was made or edited with AI, most platforms expect you to say so when you post, and invisible watermarks may still be detected.';
    }
    $('clean-warn').innerHTML = msg ? `<p class="caution">${esc(msg)}</p>` : '';
    btn.disabled = !removing && o.keepDisclosure;
    const quick = $('quick-clean');
    if (quick) {
      quick.disabled = btn.disabled;
      quick.title = btn.disabled ? 'Nothing to remove with the current settings' : '';
    }
  };
  document.querySelectorAll('.cleaner input').forEach((i) => i.addEventListener('change', update));
  update();
  btn.onclick = () => cleanAndDownload($('clean-done'));
  const quick = $('quick-clean');
  if (quick) quick.onclick = () => cleanAndDownload($('quick-done'));
}

/** Clean with the cleaner's current settings, download, and report into `out`. */
function cleanAndDownload(out) {
  {
    try {
      const o = readOpts();
      const { bytes, removed, added } = cleanFile(current.bytes, { ...o, gps: o.gps && !o.exif });
      const name = current.file.name.replace(/(\.[^.]+)?$/, (ext) => `-clean${ext || '.' + current.format}`);
      const blob = new Blob([bytes], { type: MIME[current.format] });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const what = [...new Set(removed.map((r) => (r.name === 'GPS location' ? 'GPS location' : KIND_LABELS[r.kind])))];
      out.innerHTML = `<p><strong>Downloaded ${esc(name)}.</strong> Removed: ${esc(what.join(', ') || 'nothing')}.${added.length ? ` Kept: ${added.map(esc).join('; ')}.` : ''}</p>
        <button class="btn quiet recheck">Check the cleaned file</button>${out.id === 'quick-done' ? ' <a href="#cleaner">Change what’s removed</a>' : ''}`;
      out.querySelector('.recheck').onclick = () => handle(new File([blob], name, { type: MIME[current.format] }), 'Showing the cleaned file');
    } catch (err) {
      out.innerHTML = `<p class="status error">${esc(err?.message || err)}</p>`;
    }
  }
}

async function copySummary() {
  const r = current.report;
  const lines = [
    `TagLens report for ${current.file.name}`,
    `Verdict: ${r.verdict.title}`,
    ...r.signals.map((s) => `- [${s.strength}] ${s.title} (${s.source}): ${s.detail}`),
    ...(r.credentials ? [`Content Credentials: ${r.credentials.generator || 'unknown tool'}, ${r.credentials.state}`] : []),
    'Platforms:',
    ...r.platforms.map((p) => `- ${p.name}: ${p.outcome}`),
    'Checked with https://taglens.vivekbhange.tech/',
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    $('copy').textContent = 'Copied';
  } catch {
    $('copy').textContent = 'Copy failed';
  }
  setTimeout(() => { const b = $('copy'); if (b) b.textContent = 'Copy summary'; }, 1800);
}
