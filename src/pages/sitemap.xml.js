import { TOOLS } from '../data/tools.js';
import { PLATFORMS, AI_TOOLS } from '../data/pages.js';

const GUIDES = ['ai-tag-remover', 'ai-content-remover', 'remove-ai-metadata', 'why-instagram-says-ai-info', 'photoshop-generative-fill-ai-label', 'what-is-c2pa-content-credentials'];

export function GET({ site }) {
  const paths = [
    '/', '/tools/', '/guides/', '/privacy/',
    ...TOOLS.map((t) => `/tools/${t.slug}/`),
    ...PLATFORMS.map((p) => `/platforms/${p.slug}/`),
    ...AI_TOOLS.map((p) => `/ai/${p.slug}/`),
    ...GUIDES.map((g) => `/guides/${g}/`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${new URL(p, site).href}</loc><lastmod>2026-11-21</lastmod></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
