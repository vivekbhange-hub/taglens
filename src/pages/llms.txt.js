// /llms.txt: a plain summary of TagLens for AI search and answer engines, following the llms.txt proposal.
import { TOOLS } from '../data/tools.js';
import { PLATFORMS, AI_TOOLS } from '../data/pages.js';

const ORIGIN = 'https://taglens.vivekbhange.tech';
const u = (p) => new URL(p, ORIGIN).href;
const GUIDES = [
  ['why-instagram-says-ai-info', 'Why Instagram says "AI info" on a photo'],
  ['photoshop-generative-fill-ai-label', 'Photoshop Generative Fill and the AI label'],
  ['what-is-c2pa-content-credentials', 'What C2PA Content Credentials are'],
];

export function GET() {
  const lines = [
    '# TagLens',
    '',
    '> TagLens is a free, open-source tool that shows why a photo or video gets an "AI info" label on Instagram, Facebook, Threads, TikTok, YouTube, LinkedIn or X. It reads Content Credentials (C2PA), IPTC DigitalSourceType AI fields, EXIF, XMP and AI prompts saved in PNG files, and removes private data such as GPS location and camera serial numbers. Everything runs in the browser; files are never uploaded.',
    '',
    'Key facts:',
    '- Price: free. Licence: MIT. Source: https://github.com/vivekbhange-hub/taglens',
    '- Privacy: files are read and cleaned on the device with WebAssembly; nothing is sent to a server.',
    '- Reads: JPEG, PNG, WebP, HEIC, AVIF, MP4 and MOV. Cleans: JPEG, PNG and WebP, without re-encoding the image.',
    '- It does not remove AI labels or AI disclosure; it keeps them by default. It cannot detect invisible watermarks such as Google SynthID.',
    '- Made by Vivek Bhange (https://vivekbhange.tech), a Full-Stack AI Engineer.',
    '',
    '## Tools',
    '',
    ...TOOLS.map((t) => `- [${t.name}](${u(`/tools/${t.slug}/`)}): ${t.description}`),
    '',
    '## AI labels by platform',
    '',
    ...PLATFORMS.map((p) => `- [${p.name}](${u(`/platforms/${p.slug}/`)}): ${p.description}`),
    '',
    '## AI apps and the metadata they write',
    '',
    ...AI_TOOLS.map((p) => `- [${p.name}](${u(`/ai/${p.slug}/`)}): ${p.description}`),
    '',
    '## Guides',
    '',
    ...GUIDES.map(([s, t]) => `- [${t}](${u(`/guides/${s}/`)})`),
    '',
    '## Optional',
    '',
    `- [Privacy](${u('/privacy/')}): what the site does and does not collect.`,
    '- [Author portfolio](https://vivekbhange.tech/work/taglens/): the case study for TagLens.',
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
