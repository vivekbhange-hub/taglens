// Turns raw provenance data (C2PA manifest store, XMP text, EXIF fields, PNG text)
// into a plain-English report: a verdict, the signals behind it, the privacy fields
// and what each platform is likely to do. Pure: no DOM, no network.

export const IPTC_DST = 'http://cv.iptc.org/newscodes/digitalsourcetype/';

/** What each IPTC / C2PA digital source type means, grouped by how platforms treat it. */
export const SOURCE_TYPES = {
  trainedAlgorithmicMedia: { group: 'generated', label: 'Created by generative AI' },
  trainedAlgorithmicData: { group: 'generated', label: 'Created by generative AI' },
  compositeWithTrainedAlgorithmicMedia: { group: 'aiEdited', label: 'Edited with generative AI (part of the image was generated)' },
  compositeSynthetic: { group: 'aiEdited', label: 'Composite that includes synthetic elements' },
  algorithmicallyEnhanced: { group: 'enhanced', label: 'Enhanced by an algorithm (for example AI denoise or upscale)' },
  algorithmicMedia: { group: 'algorithmic', label: 'Made by an algorithm without training data (procedural)' },
  dataDrivenMedia: { group: 'info', label: 'Made from data (for example a chart or a scan)' },
  digitalCapture: { group: 'camera', label: 'Captured with a digital camera' },
  computationalCapture: { group: 'camera', label: 'Captured with a phone camera using computational photography' },
  compositeCapture: { group: 'camera', label: 'Composite of several camera captures' },
  negativeFilm: { group: 'camera', label: 'Scanned from film negative' },
  positiveFilm: { group: 'camera', label: 'Scanned from slide film' },
  print: { group: 'camera', label: 'Scanned from a print' },
  minorHumanEdits: { group: 'info', label: 'Captured, with minor human edits' },
  humanEdits: { group: 'info', label: 'Edited by a person' },
  composite: { group: 'info', label: 'Composite of several elements' },
  digitalArt: { group: 'info', label: 'Digital art made by a person' },
  digitalCreation: { group: 'info', label: 'Created digitally by a person' },
  softwareImage: { group: 'info', label: 'Rendered by software' },
  virtualRecording: { group: 'info', label: 'Recorded in a virtual environment' },
  screenCapture: { group: 'info', label: 'Screenshot' },
  empty: { group: 'info', label: 'No source declared' },
};

export function sourceTerm(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const t = uri.trim().replace(/\/+$/, '').split('/').pop();
  return t || null;
}
export function describeSource(uri) {
  const t = sourceTerm(uri);
  return (t && SOURCE_TYPES[t]) || { group: 'info', label: t ? `Declared source: ${t}` : 'Unknown' };
}

/** Tool names that hint at AI involvement when they appear in software fields. */
export const AI_TOOL_HINTS = [
  'firefly', 'generative fill', 'generative expand', 'generative remove', 'generative', 'dall-e', 'dall·e', 'dalle',
  'openai', 'chatgpt', 'gpt-4o', 'sora', 'midjourney', 'stable diffusion', 'stablediffusion', 'sdxl', 'comfyui',
  'automatic1111', 'invokeai', 'fooocus', 'imagen', 'gemini', 'google ai', 'magic editor', 'best take',
  'bing image creator', 'image creator', 'microsoft designer', 'leonardo', 'ideogram', 'flux', 'runway',
  'kling', 'magic media', 'grok', 'aurora', 'meta ai', 'imagine with meta', 'galaxy ai', 'generative edit',
  'photoroom', 'remini', 'lensa', 'picsart ai', 'canva ai', 'nano banana',
];

export function aiToolHint(s) {
  if (!s || typeof s !== 'string') return null;
  const low = s.toLowerCase();
  return AI_TOOL_HINTS.find((h) => low.includes(h)) || null;
}

// ---------------------------------------------------------------- XMP

/** Pull the provenance-relevant fields out of an XMP packet. */
export function parseXmp(xmp) {
  if (!xmp) return null;
  const one = (name) => {
    const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"|<${name}>\\s*([^<]*?)\\s*</${name}>`);
    const m = xmp.match(re);
    return m ? decodeXml(m[1] ?? m[2]) : null;
  };
  const all = (name) => {
    const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"|<${name}>\\s*([^<]*?)\\s*</${name}>`, 'g');
    return [...xmp.matchAll(re)].map((m) => decodeXml(m[1] ?? m[2])).filter(Boolean);
  };
  const credit = one('photoshop:Credit');
  return {
    digitalSourceType: one('Iptc4xmpExt:DigitalSourceType') || one('[A-Za-z0-9]+:DigitalSourceType'),
    creatorTool: one('xmp:CreatorTool') || one('xap:CreatorTool'),
    history: [...new Set(all('stEvt:softwareAgent'))],
    credit,
    hasC2paRef: /c2pa|contentcredentials/i.test(xmp),
  };
}

function decodeXml(s) {
  return s == null ? s : s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------- C2PA

/** Flatten a C2PA manifest store into the parts a person cares about. */
export function digestC2pa(store) {
  if (!store || !store.manifests || !store.active_manifest) return null;
  const m = store.manifests[store.active_manifest];
  if (!m) return null;
  const seen = new Set();
  const actions = [];
  const ancestry = [];

  const walk = (label, depth) => {
    const man = store.manifests[label];
    if (!man || seen.has(label) || depth > 8) return;
    seen.add(label);
    for (const a of man.assertions || []) {
      if (!String(a.label).startsWith('c2pa.actions')) continue;
      for (const act of a.data?.actions || []) {
        actions.push({
          depth,
          action: act.action,
          when: act.when || null,
          softwareAgent: agentName(act.softwareAgent),
          digitalSourceType: act.digitalSourceType || null,
          description: act.description || null,
        });
      }
    }
    for (const ing of man.ingredients || []) {
      ancestry.push({
        depth,
        title: ing.title || 'Untitled',
        relationship: ing.relationship || 'componentOf',
        digitalSourceType: ing.digital_source_type || null,
        hasCredentials: Boolean(ing.active_manifest),
      });
      if (ing.active_manifest) walk(ing.active_manifest, depth + 1);
    }
  };
  walk(store.active_manifest, 0);

  const gen = (m.claim_generator_info && m.claim_generator_info[0]) || null;
  const errors = (store.validation_status || []).filter((s) => s.success !== true);
  return {
    generator: gen ? [gen.name, gen.version].filter(Boolean).join(' ') : prettyGenerator(m.claim_generator),
    title: m.title || null,
    issuer: m.signature_info?.issuer || m.signature_info?.common_name || null,
    signedAt: m.signature_info?.time || null,
    state: store.validation_state || (errors.length ? 'Invalid' : 'Valid'),
    problems: errors.map((e) => e.explanation || e.code).slice(0, 5),
    actions,
    ancestry,
    manifestCount: Object.keys(store.manifests).length,
  };
}

function agentName(a) {
  if (!a) return null;
  if (typeof a === 'string') return a;
  return [a.name, a.version].filter(Boolean).join(' ') || null;
}
function prettyGenerator(s) {
  if (!s) return null;
  return s.split(' ')[0].replace(/_/g, ' ').replace(/\//g, ' ');
}

// ---------------------------------------------------------------- EXIF / privacy

/** Privacy-relevant fields from an exifr result (merged output). */
export function privacyFields(exif) {
  if (!exif) return [];
  const out = [];
  const add = (field, value, risk) => {
    if (value === undefined || value === null || value === '') return;
    out.push({ field, value: formatValue(value), risk });
  };
  if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
    add('GPS location', `${exif.latitude.toFixed(5)}, ${exif.longitude.toFixed(5)}`, 'high');
  }
  add('Altitude', exif.GPSAltitude != null ? `${Math.round(exif.GPSAltitude)} m` : null, 'high');
  add('Camera serial number', exif.BodySerialNumber || exif.SerialNumber || exif.InternalSerialNumber, 'high');
  add('Lens serial number', exif.LensSerialNumber, 'high');
  add('Owner name', exif.OwnerName || exif.CameraOwnerName, 'high');
  add('Artist / creator', exif.Artist || exif.creator, 'medium');
  add('Copyright', exif.Copyright || exif.rights, 'low');
  const model = exif.Model && exif.Make && String(exif.Model).toLowerCase().startsWith(String(exif.Make).toLowerCase()) ? exif.Model : [exif.Make, exif.Model].filter(Boolean).join(' ');
  add('Device', model, 'medium');
  add('Lens', exif.LensModel, 'low');
  add('Taken on', exif.DateTimeOriginal || exif.CreateDate, 'medium');
  add('Software', exif.Software || exif.CreatorTool, 'low');
  add('Host computer', exif.HostComputer, 'medium');
  add('Unique image ID', exif.ImageUniqueID, 'medium');
  return out;
}

function formatValue(v) {
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// ---------------------------------------------------------------- report

const RANK = { generated: 6, aiEdited: 5, enhanced: 4, hint: 3, algorithmic: 2, camera: 1, info: 0 };

/**
 * @param {object} input
 * @param {string} input.format
 * @param {object|null} input.c2pa         manifest store from the C2PA reader
 * @param {string|null} input.c2paError    reader error, if any
 * @param {boolean} input.c2paBlock        a C2PA block exists in the file
 * @param {string|null} input.xmp          XMP packet text
 * @param {object|null} input.exif         exifr merged output
 * @param {{keyword:string,text:string|null}[]} input.pngText
 */
export function buildReport(input) {
  const signals = [];
  const cred = digestC2pa(input.c2pa);
  const xmp = parseXmp(input.xmp);

  if (cred) {
    for (const a of cred.actions) {
      if (!a.digitalSourceType) continue;
      const d = describeSource(a.digitalSourceType);
      signals.push({
        source: 'Content Credentials', strength: 'declared', group: d.group,
        title: d.label,
        detail: `${a.depth ? 'An earlier version' : 'This file'} records “${prettyAction(a.action)}”${a.softwareAgent ? ` by ${a.softwareAgent}` : ''}.`,
      });
    }
    for (const g of cred.ancestry) {
      if (!g.digitalSourceType) continue;
      const d = describeSource(g.digitalSourceType);
      signals.push({ source: 'Content Credentials', strength: 'declared', group: d.group, title: d.label, detail: `Ingredient “${g.title}”.` });
    }
    const tool = aiToolHint(cred.generator) || cred.actions.map((a) => aiToolHint(a.softwareAgent)).find(Boolean);
    if (tool && !signals.some((s) => RANK[s.group] >= RANK.enhanced)) {
      signals.push({ source: 'Content Credentials', strength: 'hint', group: 'hint', title: 'Made or edited in an AI-capable tool', detail: `The credentials name “${cred.generator || tool}”, but no AI source type is declared.` });
    }
  } else if (input.c2paBlock) {
    signals.push({
      source: 'Content Credentials', strength: 'hint', group: 'info',
      title: 'Content Credentials block found but could not be read',
      detail: input.c2paError || 'The block may be damaged or use a newer format.',
    });
  }

  if (xmp?.digitalSourceType) {
    const d = describeSource(xmp.digitalSourceType);
    signals.push({ source: 'IPTC field (XMP)', strength: 'declared', group: d.group, title: d.label, detail: `DigitalSourceType = ${sourceTerm(xmp.digitalSourceType)}` });
  }
  for (const s of [xmp?.creatorTool, xmp?.credit, ...(xmp?.history || []), input.exif?.Software].filter(Boolean)) {
    const h = aiToolHint(s);
    if (h) signals.push({ source: 'Software field', strength: 'hint', group: 'hint', title: 'AI tool named in the file', detail: `“${s}”` });
  }
  for (const t of input.pngText || []) {
    if (/^(parameters|prompt|workflow|negative_prompt|dream|sd-metadata|invokeai_metadata|invokeai_graph|generation_data|ai_metadata)$/i.test(t.keyword)) {
      signals.push({
        source: 'PNG text', strength: 'declared', group: 'generated',
        title: 'AI generation settings saved in the file',
        detail: `Field “${t.keyword}” looks like Stable Diffusion / ComfyUI output${t.text ? ' and may include your prompt' : ''}.`,
      });
    }
  }

  const dedup = [];
  const keys = new Set();
  for (const s of signals) {
    const k = `${s.source}|${s.title}|${s.detail}`;
    if (!keys.has(k)) { keys.add(k); dedup.push(s); }
  }
  dedup.sort((a, b) => RANK[b.group] - RANK[a.group]);

  const top = dedup[0]?.group || 'none';
  // Platforms act on standard declarations (C2PA, IPTC), not on tool-specific prompt blocks.
  const standardTop = dedup.find((x) => x.source !== 'PNG text')?.group || 'none';
  const promptOnly = top === 'generated' && !['generated', 'aiEdited'].includes(standardTop);
  return {
    verdict: promptOnly ? verdictFor('promptOnly', cred) : verdictFor(top, cred),
    signals: dedup,
    credentials: cred,
    xmp,
    privacy: privacyFields(input.exif),
    platforms: platformsFor(standardTop, Boolean(cred)),
    // The IPTC AI field the cleaner must carry over when "keep AI disclosure" is on:
    // the file's own XMP value, or a generated-by-AI value when the only declaration
    // is a Stable Diffusion / ComfyUI prompt block that is being removed.
    carryDigitalSourceType: xmp?.digitalSourceType
      || (dedup.some((s) => s.source === 'PNG text') ? `${IPTC_DST}trainedAlgorithmicMedia` : null),
  };
}

function prettyAction(a) {
  return String(a || 'action').replace(/^c2pa\./, '').replace(/_/g, ' ');
}

function verdictFor(group, cred) {
  switch (group) {
    case 'promptOnly':
      return { key: 'promptOnly', tone: 'warn', title: 'AI generator settings are saved in this file', summary: 'The prompt and settings show it came from an image generator like Stable Diffusion or ComfyUI. These aren’t a standard AI declaration, so platforms may not label it from the file alone.' };
    case 'generated':
      return { key: 'generated', tone: 'ai', title: 'This file says it was made by AI', summary: 'It carries a standard "AI-generated" declaration. Platforms that read these fields will label it.' };
    case 'aiEdited':
      return { key: 'aiEdited', tone: 'ai', title: 'This file says AI was used to edit it', summary: 'Part of the image is declared as generated, for example with Generative Fill or Magic Editor. Most platforms show a softer "AI info" note for this.' };
    case 'enhanced':
      return { key: 'enhanced', tone: 'warn', title: 'This file says an algorithm enhanced it', summary: 'Declared as algorithmically enhanced (such as AI denoise or upscale). Platforms usually do not label this, but rules change.' };
    case 'hint':
      return { key: 'hint', tone: 'warn', title: 'An AI tool is named, but nothing is declared', summary: 'The file mentions an AI-capable app in its software fields. That alone rarely triggers a label, but it explains why someone might suspect AI.' };
    case 'algorithmic':
      return { key: 'algorithmic', tone: 'info', title: 'Made by an algorithm, not generative AI', summary: 'Declared as procedural or computer-generated without training data.' };
    case 'camera':
      return { key: 'camera', tone: 'ok', title: 'This file says it came from a camera', summary: cred ? 'Signed Content Credentials declare a camera capture. Some platforms show this as a "captured with a camera" badge.' : 'A camera capture is declared in its metadata.' };
    default:
      return cred
        ? { key: 'credentials', tone: 'info', title: 'Content Credentials, but no AI declared', summary: 'The file has a signed history and none of it declares AI. LinkedIn and some others show a small "CR" icon for this.' }
        : { key: 'none', tone: 'ok', title: 'No AI declaration found in this file', summary: 'Nothing in the file data would make a platform add an AI label. A label can still come from an invisible watermark, the platform’s own detection, or your own disclosure when you post.' };
  }
}

/**
 * What each platform is likely to show, based on their public policies.
 * Platforms change these rules; keep REVIEWED up to date.
 */
export const PLATFORMS_REVIEWED = 'November 2026';

export function platformsFor(group, hasCredentials) {
  const ai = group === 'generated' || group === 'aiEdited';
  const generated = group === 'generated';
  return [
    {
      name: 'Instagram, Facebook, Threads',
      level: generated ? 'label' : ai ? 'menu' : 'none',
      outcome: generated ? '“AI info” label on the post' : ai ? '“AI info” in the post menu' : 'No label from file data',
      note: 'Meta reads C2PA and IPTC AI fields. Fully generated content gets a visible label; AI-edited content gets the note in the menu. Meta also checks invisible watermarks and asks you to disclose realistic AI video and audio.',
    },
    {
      name: 'TikTok',
      level: ai ? 'label' : 'none',
      outcome: ai ? '“AI-generated” label likely' : 'No label from file data',
      note: 'TikTok reads Content Credentials to auto-label AI content and requires creators to label realistic AI content themselves.',
    },
    {
      name: 'YouTube',
      level: ai ? 'disclose' : group === 'camera' && hasCredentials ? 'badge' : 'none',
      outcome: ai ? 'You must disclose if it looks realistic' : group === 'camera' && hasCredentials ? '“Captured with a camera” possible' : 'No label from file data',
      note: 'YouTube asks creators to tick “altered or synthetic content” for realistic AI media and may add the label itself. Videos with valid camera credentials can show “Captured with a camera”.',
    },
    {
      name: 'LinkedIn',
      level: hasCredentials ? 'badge' : 'none',
      outcome: hasCredentials ? '“CR” Content Credentials icon' : 'No icon',
      note: 'LinkedIn shows a small CR icon on images with Content Credentials; clicking it shows the source, including any AI tool.',
    },
    {
      name: 'X (Twitter)',
      level: 'none',
      outcome: 'No automatic label from file data',
      note: 'X does not publicly label posts from C2PA or IPTC fields. Community Notes can still flag AI media.',
    },
  ];
}
