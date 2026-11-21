// Every tool page runs the same in-browser engine with a different starting setup.
// `preset.clean` sets which cleaner boxes start ticked; `preset.focus` is the report
// section shown first. `kind` is the metadata colour used for the tool's mark.

export const GROUPS = [
  { id: 'clean', name: 'Remove private data', blurb: 'Rewrite your own photos without the details you don’t want to share. No quality loss.' },
  { id: 'check', name: 'Check a file', blurb: 'Read what a photo or video says about itself before you post or trust it.' },
  { id: 'learn', name: 'Understand labels', blurb: 'What file data can and can’t tell you about AI.' },
];

const ALL = { exif: true, gps: true, xmp: true, iptc: true, text: true };

export const TOOLS = [
  {
    slug: 'remove-metadata', group: 'clean', kind: 'exif', name: 'Photo metadata remover',
    short: 'Strip location, camera, editing history and comments in one go.',
    title: 'Remove metadata from photos online, free and private | TagLens',
    description: 'Remove EXIF, GPS, XMP, IPTC and comments from JPEG, PNG and WebP photos in your browser. No upload, no quality loss, orientation and colour kept.',
    h1: 'Remove metadata from a photo',
    intro: 'Drop a JPEG, PNG or WebP. TagLens shows everything hidden in it, then writes a clean copy without location, camera serials, dates, editing history or comments. The image itself is copied byte for byte, so nothing is re-compressed.',
    preset: { focus: 'clean', clean: ALL },
    faq: [
      ['Does removing metadata reduce quality?', 'No. TagLens only rewrites the metadata blocks around the image data. The pixels are copied exactly, unlike tools that re-save the photo.'],
      ['Why does my photo stay the right way up?', 'Phones often store rotation as a metadata flag. TagLens keeps just that one flag so the photo doesn’t turn sideways.'],
      ['Is the AI label removed too?', 'Not by default. TagLens keeps Content Credentials and the IPTC AI field so images stay honest about how they were made.'],
    ],
  },
  {
    slug: 'remove-gps-from-photo', group: 'clean', kind: 'exif', name: 'Remove location from photo',
    short: 'Delete the GPS position but keep camera and date details.',
    title: 'Remove GPS location from a photo, keep camera info | TagLens',
    description: 'Delete the GPS coordinates from a JPEG, PNG or WebP photo before you share it. Camera, lens and date stay. Runs in your browser, nothing uploaded.',
    h1: 'Remove the location from a photo',
    intro: 'Most phones save the exact spot where a photo was taken. TagLens blanks the GPS coordinates and leaves the rest of the camera data alone, so photographers keep their exposure details while the location is gone.',
    preset: { focus: 'privacy', clean: { exif: false, gps: true, xmp: false, iptc: false, text: false } },
    faq: [
      ['Do Instagram and WhatsApp remove location anyway?', 'Most big apps strip it on upload, but email, cloud links, AirDrop, Telegram files and many forums send the original file with its location intact.'],
      ['What else can reveal where I was?', 'An editing app may copy the coordinates into the XMP block. TagLens removes that copy too when it finds one.'],
    ],
  },
  {
    slug: 'exif-remover', group: 'clean', kind: 'exif', name: 'EXIF remover',
    short: 'Remove the EXIF block only: camera, serials, dates and GPS.',
    title: 'EXIF remover: delete EXIF data from photos online | TagLens',
    description: 'Delete EXIF data (camera model, serial numbers, dates, GPS) from JPEG, PNG and WebP files, privately in your browser, without re-compressing the image.',
    h1: 'Remove EXIF data from a photo',
    intro: 'EXIF is the block your camera or phone writes: the device, lens, settings, serial numbers, timestamps and often GPS. TagLens removes just that block and leaves the rest of the file as it was.',
    preset: { focus: 'clean', clean: { exif: true, gps: true, xmp: false, iptc: false, text: false } },
    faq: [
      ['What is EXIF?', 'Exchangeable Image File Format: a standard block of camera data inside JPEG, PNG, WebP, HEIC and TIFF files.'],
    ],
  },
  {
    slug: 'xmp-remover', group: 'clean', kind: 'xmp', name: 'XMP remover',
    short: 'Remove editing history, app names and document IDs.',
    title: 'XMP remover: delete XMP metadata and edit history | TagLens',
    description: 'Remove XMP metadata (Photoshop and Lightroom history, creator tool, document IDs) from JPEG, PNG and WebP files in your browser. AI disclosure is kept by default.',
    h1: 'Remove XMP metadata from a photo',
    intro: 'XMP is where Photoshop, Lightroom and other editors record what they did: the app, each save, document IDs that can link files together. TagLens removes it. If the XMP carries an AI disclosure, that one field is kept unless you turn it off.',
    preset: { focus: 'clean', clean: { exif: false, gps: false, xmp: true, iptc: false, text: false } },
    faq: [
      ['Can XMP link my photos together?', 'Yes. Document and instance IDs stay the same across exports from one original, so they can show two files came from the same source.'],
    ],
  },
  {
    slug: 'remove-prompt-from-png', group: 'clean', kind: 'aiParams', name: 'Hide your AI prompt',
    short: 'Remove the prompt and settings Stable Diffusion or ComfyUI saved in a PNG.',
    title: 'Remove the prompt from a Stable Diffusion or ComfyUI PNG | TagLens',
    description: 'Stable Diffusion, ComfyUI and InvokeAI save your full prompt, seed and workflow inside the PNG. Remove them before sharing, while keeping an honest AI disclosure.',
    h1: 'Remove your prompt from an AI-generated PNG',
    intro: 'Automatic1111, Forge, ComfyUI and InvokeAI write the prompt, negative prompt, seed, model and sometimes the whole workflow into the PNG. Anyone you send the file to can read it. TagLens removes that text and, by default, writes a standard “made by AI” field in its place so the image stays labelled honestly.',
    preset: { focus: 'privacy', clean: { exif: false, gps: false, xmp: false, iptc: false, text: true } },
    faq: [
      ['Will the image still say it was AI-generated?', 'Yes, by default. TagLens replaces the prompt block with the IPTC field DigitalSourceType = trainedAlgorithmicMedia, which platforms understand.'],
      ['Which tools save prompts?', 'Automatic1111 and Forge (“parameters”), ComfyUI (“prompt” and “workflow”), InvokeAI (“invokeai_metadata”) and several others.'],
    ],
  },
  {
    slug: 'whats-in-my-photo', group: 'check', kind: 'other', name: 'What’s in my photo?',
    short: 'See every piece of hidden data a file carries.',
    title: 'What metadata is in my photo? Free metadata viewer | TagLens',
    description: 'See all the hidden data in a photo or video: EXIF, GPS, XMP, IPTC, Content Credentials and AI prompts, with a map of the file. Runs in your browser.',
    h1: 'What is hidden in my photo?',
    intro: 'Drop any image or video and TagLens lists everything it says about itself: the device, the location, the apps that touched it, any AI declaration, and how much of the file is metadata.',
    preset: { focus: 'anatomy', clean: ALL },
    faq: [
      ['Which formats can I check?', 'JPEG, PNG, WebP, HEIC and AVIF images, plus MP4 and MOV video for Content Credentials.'],
    ],
  },
  {
    slug: 'ai-image-checker', group: 'check', kind: 'ai', name: 'AI image checker',
    short: 'Find any AI declaration: Content Credentials, IPTC field or prompt.',
    title: 'AI image checker: does this file say it was made by AI? | TagLens',
    description: 'Check whether an image declares AI in its Content Credentials (C2PA), IPTC DigitalSourceType or saved prompt, and see what Instagram, TikTok and others will show.',
    h1: 'Does this image say it was made by AI?',
    intro: 'TagLens reads the declarations AI tools write into files and tells you which one is there, which app wrote it, and what each platform is likely to show. It reads what the file declares; it doesn’t guess from the pixels.',
    preset: { focus: 'evidence', clean: ALL },
    faq: [
      ['Can TagLens tell if an image is AI just by looking at it?', 'No. Pixel-based detectors are unreliable and often wrong about real photos. TagLens reports only what the file itself declares, which is what platforms read too.'],
      ['Why does a known AI image show nothing?', 'Screenshots, re-saves and most messaging apps strip metadata. An invisible watermark may still be there, which no metadata tool can read.'],
    ],
  },
  {
    slug: 'c2pa-checker', group: 'check', kind: 'c2pa', name: 'Content Credentials checker',
    short: 'Read and verify C2PA credentials locally: tool, edits, signer.',
    title: 'C2PA checker: read Content Credentials without uploading | TagLens',
    description: 'Read and verify C2PA Content Credentials in your browser: the tool that made the file, every recorded edit, ingredients, signer and whether the signature still checks out.',
    h1: 'Check Content Credentials (C2PA)',
    intro: 'Content Credentials are a signed history inside a file. TagLens reads them with the official open-source C2PA library compiled to run in your browser, so you can verify a file without sending it anywhere.',
    preset: { focus: 'credentials', clean: ALL },
    faq: [
      ['What does “doesn’t verify” mean?', 'The file changed after it was signed, for example re-saved by an app that doesn’t support C2PA. The record is still readable but no longer proves the file is unchanged.'],
    ],
  },
  {
    slug: 'photo-privacy-check', group: 'check', kind: 'exif', name: 'Photo privacy check',
    short: 'Rate what a photo gives away: location, serials, owner name.',
    title: 'Photo privacy check: what does my photo give away? | TagLens',
    description: 'Check a photo for privacy risks before sharing: GPS location, camera serial numbers, owner name, exact time, AI prompts. Each item rated, with a one-click clean copy.',
    h1: 'What does this photo give away?',
    intro: 'Before you send a photo to a stranger, a buyer or a forum, see what it reveals. TagLens rates each item from high to low risk and can write a clean copy right away.',
    preset: { focus: 'privacy', clean: ALL },
    faq: [
      ['Why are serial numbers a risk?', 'A camera serial number in two photos ties them to the same device, and can link an anonymous account to a known one.'],
    ],
  },
  {
    slug: 'ai-watermark-check', group: 'learn', kind: 'c2pa', name: 'AI watermark check',
    short: 'What file data can show, and what invisible watermarks hide.',
    title: 'AI watermark checker: metadata vs SynthID and invisible marks | TagLens',
    description: 'Check the metadata side of AI watermarking (C2PA, IPTC) and learn what invisible watermarks like Google SynthID are, why no metadata tool can read them, and where to check.',
    h1: 'Check for AI watermarks',
    intro: 'There are two kinds of AI marking. Metadata (Content Credentials and the IPTC AI field) sits beside the image and TagLens reads it here. Invisible watermarks such as Google SynthID are woven into the pixels and can only be read by their owner’s detector.',
    preset: { focus: 'evidence', clean: ALL },
    faq: [
      ['Can TagLens detect SynthID?', 'No, and no third-party tool honestly can. Google provides its own SynthID Detector for checking content made with its models.'],
      ['Does a screenshot remove an AI watermark?', 'A screenshot drops metadata, but invisible watermarks are designed to survive screenshots, resizing and compression.'],
    ],
  },
];

export const toolBySlug = (s) => TOOLS.find((t) => t.slug === s);
