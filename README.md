# TagLens

**See why a photo gets an "AI info" label, and what private data it carries.**
Free, open source, and it runs entirely in your browser. Your files are never uploaded.

**Live:** https://ai-tag.vivekbhange.tech

## What it does

- **Reads Content Credentials (C2PA).** The signed record that Adobe, OpenAI, Google, Microsoft, Leica, Samsung and others write: which tool made or edited the file, every recorded step, the signer, and whether the signature still verifies.
- **Reads the IPTC AI field.** `DigitalSourceType` values such as `trainedAlgorithmicMedia` (made by AI) and `compositeWithTrainedAlgorithmicMedia` (edited with AI).
- **Finds AI prompts in PNGs.** Stable Diffusion, ComfyUI and InvokeAI save the full prompt and settings inside the file.
- **Predicts platform labels.** What Instagram/Facebook/Threads, TikTok, YouTube, LinkedIn and X are likely to show, based on their public policies.
- **Shows private data.** GPS location, camera and lens serial numbers, owner name, device, timestamps.
- **Cleans your own photos without quality loss.** Removes EXIF, XMP, IPTC, comments and prompt text by rewriting metadata blocks only. Image data is copied byte for byte, and the colour profile and orientation are kept.
- **Maps the file.** A bar showing how much of the file is image data and how much is each kind of metadata.
- **Removes only the location** when you want to keep camera and date details (the GPS block is blanked in place, so nothing else moves).

## Pages

One engine powers every page, each with its own starting setup:

- **Tools** (`/tools/<slug>/`): photo metadata remover, remove location, EXIF remover, XMP remover, hide your AI prompt, what's in my photo, AI image checker, Content Credentials checker, photo privacy check, AI watermark check. Defined in `src/data/tools.js`.
- **Platforms** (`/platforms/<slug>/`): Instagram, TikTok, YouTube, LinkedIn, X. **AI apps** (`/ai/<slug>/`): ChatGPT, Adobe Firefly, Google Gemini, Meta AI, Stable Diffusion. Defined in `src/data/pages.js`.
- **Guides** (`/guides/`) and a generated `sitemap.xml`.

Formats: JPEG, PNG, WebP, HEIC, AVIF, MP4 and MOV can be inspected. JPEG, PNG and WebP can be cleaned.

## What it deliberately does not do

TagLens explains AI labels. It is not built to get around them.

- The cleaner **keeps Content Credentials and the IPTC AI field by default**. If you remove the XMP block, TagLens writes back a minimal XMP containing only the AI field.
- It cannot see or remove invisible watermarks such as Google SynthID or Meta Video Seal, and it never will.
- Platforms also run their own detection. A file showing "nothing found" can still be labelled.

## Run it locally

Requires Node 22.23.4 or newer (see `.nvmrc`).

```sh
npm install
npm run dev      # http://localhost:4330
npm test         # parser, cleaner and analysis tests
npm run build    # static site in dist/
```

## How it works

| File | Job |
|---|---|
| `src/lib/containers.js` | Parses JPEG segments, PNG chunks and WebP RIFF chunks into labelled blocks; rewrites files without chosen blocks (fixes PNG CRCs, WebP VP8X flags and RIFF size, keeps JPEG orientation). |
| `src/lib/analyze.js` | Turns the C2PA manifest store, XMP, EXIF and PNG text into a verdict, signals, privacy fields and platform predictions. Pure functions, unit tested. |
| `src/scripts/app.js` | Browser glue. Uses [`@contentauth/c2pa-web`](https://github.com/contentauth/c2pa-js) (WASM, loaded only when a file has credentials) and [`exifr`](https://github.com/MikeKovarik/exifr). Every value from a file is HTML-escaped before display. |
| `src/components/Checker.astro` | The drop-a-file hero (a hang tag you drop files on) and all report styles. |
| `src/pages/guides/` | Plain-English guides on AI labels and Content Credentials. |

Platform behaviour lives in `platformsFor()` in `src/lib/analyze.js`, with a `PLATFORMS_REVIEWED` date. Pull requests that update it with a source link are very welcome.

## Deploy

It's a static site. On Cloudflare Pages: build command `npm run build`, output folder `dist`, environment variable `NODE_VERSION=22.23.4`.

## Roadmap

- Video cleaning, and support for more MP4/MOV metadata
- Shareable report image
- `npx taglens photo.jpg` CLI, and a Claude Code skill
- Browser extension: right-click any image to inspect it
- Add your own Content Credentials to photos you took
- Hindi and Marathi versions

## Author

Built by **Vivek Bhange**: https://vivekbhange.tech

## Licence

MIT
