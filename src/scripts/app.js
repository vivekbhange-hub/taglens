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

let c2paPromise = null;
let previewUrl = null;
let current = null; // { file, bytes, format, blocks, report }

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kb = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

export function mount() {
  const drop = $('drop');
  const input = $('file');
  input.addEventListener('change', () => input.files[0] && handle(input.files[0]));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) handle(f); });
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
  $('results').hidden = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = sniffFormat(bytes);
    if (format === 'unknown') { status('That doesn’t look like a supported image or video file.', true); return; }
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
    current = { file, bytes, format, blocks, report, texts };
    render(note);
    status('');
  } catch (err) {
    console.error(err);
    status(`Couldn’t read that file: ${err?.message || err}`, true);
  }
}

// ---------------------------------------------------------------- render

function render(note) {
  const { file, bytes, format, blocks, report } = current;
  const el = $('results');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  const isVideo = format === 'isobmff' || file.type.startsWith('video/');
  const thumb = isVideo
    ? `<video src="${previewUrl}" muted playsinline preload="metadata"></video>`
    : `<img src="${previewUrl}" alt="Your file" onerror="this.replaceWith(document.createTextNode('No preview for this format'))" />`;

  el.innerHTML = `
    ${note ? `<p class="pill" style="margin-bottom:14px">${esc(note)}</p>` : ''}
    <div class="r-top">
      <div class="thumb">${thumb}</div>
      <div>
        <div class="verdict tone-${report.verdict.tone}">
          <span class="badge">${esc(badgeText(report.verdict.key))}</span>
          <h2>${esc(report.verdict.title)}</h2>
          <p>${esc(report.verdict.summary)}</p>
        </div>
        <p class="fileline">${esc(file.name)} · ${format.toUpperCase()} · ${kb(bytes.length)}</p>
        <div class="actions"><button class="btn ghost" id="copy">Copy summary</button><button class="btn ghost" id="again">Check another file</button></div>
      </div>
    </div>
    ${platformsHtml(report)}
    ${signalsHtml(report)}
    ${credentialsHtml(report)}
    ${blocks.length ? anatomyHtml(blocks, bytes.length) : ''}
    ${privacyHtml(report, current.texts)}
    ${cleanerHtml()}
  `;
  el.hidden = false;
  $('again').onclick = () => { $('file').value = ''; $('file').click(); };
  $('copy').onclick = copySummary;
  wireCleaner();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function badgeText(k) {
  return { generated: 'AI declared', aiEdited: 'AI edit declared', enhanced: 'Enhanced', hint: 'AI tool named', algorithmic: 'Algorithmic', camera: 'Camera', credentials: 'Credentials', none: 'No AI declared' }[k] || k;
}

function platformsHtml(r) {
  return `<div class="r-section"><h3>What platforms will likely do <small>from file data alone</small></h3>
    <div class="platforms">${r.platforms.map((p) => `
      <div class="card plat lv-${p.level}"><h4>${esc(p.name)}</h4><span class="out">${esc(p.outcome)}</span><p>${esc(p.note)}</p></div>`).join('')}
    </div>
    <p class="reviewed">Based on each platform’s public policy, reviewed ${PLATFORMS_REVIEWED}. Platforms can also label content using invisible watermarks or their own detection, which no file inspector can see.</p></div>`;
}

function signalsHtml(r) {
  if (!r.signals.length) {
    return `<div class="r-section"><h3>Signals found</h3><div class="card">No AI declarations, AI tool names or generation settings were found in this file.</div></div>`;
  }
  return `<div class="r-section"><h3>Signals found <small>${r.signals.length}</small></h3><ul class="signals">${r.signals.map((s) => `
    <li class="card"><span class="tag ${s.strength}">${s.strength === 'declared' ? 'Declared' : 'Hint'}</span>
      <div><strong>${esc(s.title)}</strong><span class="d">${esc(s.detail)}</span><small>${esc(s.source)}</small></div></li>`).join('')}
  </ul></div>`;
}

function credentialsHtml(r) {
  const c = r.credentials;
  if (!c) return '';
  const steps = c.actions.map((a) => {
    const src = a.digitalSourceType ? ` — ${describeSource(a.digitalSourceType).label}` : '';
    const when = a.when ? ` <span class="mono">${esc(a.when.slice(0, 10))}</span>` : '';
    return `<li>${esc(prettyAction(a.action))}${a.softwareAgent ? ` with <strong>${esc(a.softwareAgent)}</strong>` : ''}${esc(src)}${when}${a.depth ? ' <small>(earlier version)</small>' : ''}</li>`;
  }).join('');
  const ings = c.ancestry.map((g) => `<li class="ing">Ingredient: ${esc(g.title)} <small>(${esc(g.relationship)}${g.hasCredentials ? ', has its own credentials' : ''})</small></li>`).join('');
  const stateText = { Trusted: 'Valid, signed by a trusted issuer', Valid: 'Valid signature', Invalid: 'Does not verify — the file changed after signing' }[c.state] || c.state;
  return `<div class="r-section"><h3>Content Credentials</h3><div class="card">
    <dl class="kv">
      ${c.generator ? `<dt>Made with</dt><dd>${esc(c.generator)}</dd>` : ''}
      ${c.issuer ? `<dt>Signed by</dt><dd>${esc(c.issuer)}</dd>` : ''}
      ${c.signedAt ? `<dt>Signed on</dt><dd>${esc(c.signedAt.replace('T', ' ').slice(0, 19))}</dd>` : ''}
      <dt>Status</dt><dd>${esc(stateText)}</dd>
      <dt>History</dt><dd>${c.manifestCount} signed step${c.manifestCount === 1 ? '' : 's'}</dd>
    </dl>
    ${c.problems.length && c.state === 'Invalid' ? `<p class="reviewed">${c.problems.map(esc).join('<br />')}</p>` : ''}
    ${steps || ings ? `<ul class="timeline">${steps}${ings}</ul>` : ''}
    <p class="reviewed">Cross-check on the official <a href="https://contentcredentials.org/verify" rel="noopener">Content Credentials verify site</a> (that one uploads the file).</p>
  </div></div>`;
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
  return `<div class="r-section"><h3>Inside the file <small>${kb(meta)} of metadata in ${kb(total)}</small></h3>
    <div class="anatomy" role="img" aria-label="File layout">${merged.map((m, i) => `<span style="--c:${KIND_COLOR[m.kind]};flex:${(w[i] / sum).toFixed(4)}" title="${esc(KIND_LABELS[m.kind])}: ${kb(m.size)}"></span>`).join('')}</div>
    <div class="legend">${kinds.map((k) => {
      const n = blocks.filter((b) => b.kind === k).reduce((a, b) => a + b.end - b.start, 0);
      return `<span><i style="--c:${KIND_COLOR[k]}"></i>${esc(KIND_LABELS[k])} · ${kb(n)}</span>`;
    }).join('')}</div></div>`;
}

function privacyHtml(r, texts) {
  const rows = r.privacy.map((p) => `<tr><td>${esc(p.field)}</td><td>${esc(p.value)}</td><td><span class="risk ${p.risk}">${p.risk}</span></td></tr>`);
  const prompts = texts.filter((t) => t.kind === 'aiParams');
  const other = texts.filter((t) => t.kind !== 'aiParams');
  for (const t of prompts) {
    rows.push(`<tr><td>AI prompt (“${esc(t.keyword)}”)</td><td>${t.text ? `<div class="prompt">${esc(t.text.slice(0, 4000))}</div>` : 'Compressed text'}</td><td><span class="risk high">high</span></td></tr>`);
  }
  if (other.length) {
    // Tools like ImageMagick copy EXIF into dozens of PNG text fields; fold them into one row.
    const sensitive = other.some((t) => /serial|gps|owner|artist|author|location|latitude/i.test(t.keyword));
    const list = other.map((t) => `${esc(t.keyword)}: ${esc((t.text || 'compressed').slice(0, 160))}`).join('\n');
    rows.push(`<tr><td>Text fields (${other.length})</td><td><details><summary>${esc(other.slice(0, 4).map((t) => t.keyword).join(', '))}${other.length > 4 ? '…' : ''}</summary><div class="prompt">${list}</div></details></td><td><span class="risk ${sensitive ? 'high' : 'low'}">${sensitive ? 'high' : 'low'}</span></td></tr>`);
  }
  if (!rows.length) return `<div class="r-section"><h3>Private data</h3><div class="card">No location, serial numbers, owner names or hidden text found.</div></div>`;
  return `<div class="r-section"><h3>Private data <small>anyone with the original file can read this</small></h3>
    <div class="card" style="padding:8px 14px"><table class="priv"><tbody>${rows.join('')}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------- cleaner

function cleanerHtml() {
  const { format, blocks, report } = current;
  if (!CLEANABLE.has(format)) {
    return `<div class="r-section cleaner"><h3>Privacy cleaner</h3><div class="card">Cleaning ${esc(format.toUpperCase())} files isn’t supported yet. Export as JPEG first, or use your phone’s “remove location” option when sharing.</div></div>`;
  }
  const has = (k) => blocks.some((b) => b.kind === k);
  const opt = (id, on, enabled, title, sub) => `
    <label class="opt${enabled ? '' : ' disabled'}"><input type="checkbox" id="${id}" ${on && enabled ? 'checked' : ''} ${enabled ? '' : 'disabled'} />
      <span><strong>${title}</strong><small>${sub}</small></span></label>`;
  const hasAi = report.signals.some((s) => s.strength === 'declared' && ['generated', 'aiEdited'].includes(s.group));
  return `<div class="r-section cleaner"><h3>Privacy cleaner <small>for your own photos · no quality loss</small></h3><div class="card">
    <div class="opts">
      ${opt('o-exif', true, has('exif'), 'Location, camera and dates', has('exif') ? 'EXIF: GPS, serial numbers, device, timestamps. Orientation is kept.' : 'No EXIF in this file.')}
      ${opt('o-xmp', true, has('xmp'), 'Editing history and software', has('xmp') ? 'XMP: apps used, edit history, document IDs.' : 'No XMP in this file.')}
      ${opt('o-iptc', true, has('iptc'), 'IPTC / Photoshop info', has('iptc') ? 'Captions, keywords, creator contact details.' : 'No IPTC block in this file.')}
      ${opt('o-text', true, has('comment') || has('text') || has('aiParams'), 'Comments, text and AI prompts', has('aiParams') ? 'Includes the prompt and settings saved by your AI image tool.' : 'Comments and text fields.')}
      <label class="opt keep"><input type="checkbox" id="o-keep" checked />
        <span><strong>Keep AI disclosure and Content Credentials</strong><small>Recommended. Keeps the signed history and the standard AI field so the image stays honest about how it was made.${hasAi ? ' This file declares AI.' : ''}</small></span></label>
    </div>
    <div id="clean-warn"></div>
    <div class="actions"><button class="btn" id="clean">Clean and download</button></div>
    <div id="clean-done" class="done"></div>
  </div></div>`;
}

function readOpts() {
  const v = (id) => Boolean($(id)?.checked);
  return { exif: v('o-exif'), xmp: v('o-xmp'), iptc: v('o-iptc'), text: v('o-text'), keepDisclosure: v('o-keep'), digitalSourceType: current.report.carryDigitalSourceType };
}

function wireCleaner() {
  const btn = $('clean');
  if (!btn) return;
  const update = () => {
    const o = readOpts();
    const hasCred = current.blocks.some((b) => b.kind === 'c2pa');
    const removing = o.exif || o.xmp || o.iptc || o.text;
    const hasAi = current.report.signals.some((s) => s.strength === 'declared' && ['generated', 'aiEdited'].includes(s.group));
    let msg = '';
    if (o.keepDisclosure && hasCred && removing) {
      msg = 'Heads up: Content Credentials are signed over the whole file. Removing other metadata keeps the record but it will show as “does not verify”.';
    } else if (!o.keepDisclosure && hasAi) {
      msg = 'You’re removing this file’s AI disclosure. If the image was made or edited with AI, most platforms require you to say so when you post it, and invisible watermarks may still be detected.';
    }
    $('clean-warn').innerHTML = msg ? `<div class="warnbox">${esc(msg)}</div>` : '';
    btn.disabled = !removing && o.keepDisclosure;
  };
  document.querySelectorAll('.cleaner input').forEach((i) => i.addEventListener('change', update));
  update();
  btn.onclick = () => {
    try {
      const { bytes, removed, added } = cleanFile(current.bytes, readOpts());
      const name = current.file.name.replace(/(\.[^.]+)?$/, (ext) => `-clean${ext || '.' + current.format}`);
      const blob = new Blob([bytes], { type: MIME[current.format] });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const saved = current.bytes.length - bytes.length;
      $('clean-done').innerHTML = `<p><strong>Saved ${esc(name)}.</strong> Removed ${removed.length} block${removed.length === 1 ? '' : 's'} (${kb(Math.max(saved, 0))}).${added.length ? ` Kept: ${added.map(esc).join('; ')}.` : ''}</p>
        <button class="btn ghost" id="recheck">Check the cleaned file</button>`;
      $('recheck').onclick = () => handle(new File([blob], name, { type: MIME[current.format] }), 'Showing the cleaned file');
    } catch (err) {
      $('clean-done').innerHTML = `<p class="status error">${esc(err?.message || err)}</p>`;
    }
  };
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
    'Checked with https://ai-tag.vivekbhange.tech/',
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    $('copy').textContent = 'Copied';
  } catch {
    $('copy').textContent = 'Copy failed';
  }
  setTimeout(() => { const b = $('copy'); if (b) b.textContent = 'Copy summary'; }, 1800);
}
