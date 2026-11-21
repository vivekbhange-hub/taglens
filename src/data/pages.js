// Platform and AI-tool landing pages. Claims stay at the level of each company's
// public announcements; anything uncertain is worded as "check your own file".

export const PLATFORMS = [
  {
    slug: 'instagram', name: 'Instagram', also: 'Facebook and Threads',
    title: 'Why does Instagram say “AI info”? Check your photo | TagLens',
    description: 'Instagram, Facebook and Threads add “AI info” when a file declares AI in its metadata or carries an invisible watermark. See which field your photo has.',
    h1: 'Why Instagram adds “AI info” to a post',
    points: [
      ['What it reads', 'Meta reads C2PA Content Credentials and the IPTC DigitalSourceType field, and looks for invisible watermarks from AI tools.'],
      ['Generated images', 'Files declared as fully AI-generated get “AI info” shown on the post.'],
      ['AI-edited photos', 'Real photos with an AI edit (for example Generative Fill) get the note in the post menu instead of on the image.'],
      ['Your own disclosure', 'Meta asks you to label realistic AI video and audio yourself, and may add a label if you don’t.'],
    ],
  },
  {
    slug: 'tiktok', name: 'TikTok',
    title: 'Why did TikTok label my video “AI-generated”? | TagLens',
    description: 'TikTok reads Content Credentials to auto-label AI-generated content. Check whether your image or video carries them before you post.',
    h1: 'How TikTok labels AI-generated content',
    points: [
      ['What it reads', 'TikTok reads C2PA Content Credentials to automatically label content made with AI tools on other platforms.'],
      ['Creator labels', 'TikTok requires you to label realistic AI-generated content yourself using its AI-generated toggle.'],
      ['Its own effects', 'Content made with TikTok’s own AI effects is labelled automatically.'],
    ],
  },
  {
    slug: 'youtube', name: 'YouTube',
    title: 'YouTube “altered or synthetic content” and Captured with a camera | TagLens',
    description: 'YouTube asks creators to disclose realistic AI content and can show “Captured with a camera” for videos with valid Content Credentials. Check your file.',
    h1: 'How YouTube handles AI and Content Credentials',
    points: [
      ['Disclosure', 'When you upload, YouTube asks whether the content is “altered or synthetic” and looks realistic. Saying yes adds a label.'],
      ['Labels it adds itself', 'YouTube may add the label for sensitive topics even if you didn’t.'],
      ['Captured with a camera', 'Videos with valid C2PA camera credentials can show a “Captured with a camera” note.'],
    ],
  },
  {
    slug: 'linkedin', name: 'LinkedIn',
    title: 'What is the “CR” icon on LinkedIn images? | TagLens',
    description: 'LinkedIn shows a small CR icon on images with Content Credentials. Clicking it reveals the source, including any AI tool. Check what your image will show.',
    h1: 'The “CR” icon on LinkedIn',
    points: [
      ['What it shows', 'Images with C2PA Content Credentials get a small CR icon in the corner.'],
      ['What people see on click', 'The source app and, if declared, that AI was used to make or edit the image.'],
    ],
  },
  {
    slug: 'x-twitter', name: 'X (Twitter)',
    title: 'Does X (Twitter) label AI images? | TagLens',
    description: 'X does not publicly label posts from C2PA or IPTC metadata. Community Notes can still flag AI media. Check what your file declares anyway.',
    h1: 'Does X label AI-generated images?',
    points: [
      ['From file data', 'X has not announced automatic labels based on Content Credentials or the IPTC AI field.'],
      ['Community Notes', 'Readers can add notes that flag an image as AI-generated or manipulated.'],
      ['Metadata on upload', 'Like most large platforms, X strips most metadata from uploaded images, so other people downloading your post won’t see it.'],
    ],
  },
];

export const AI_TOOLS = [
  {
    slug: 'chatgpt', name: 'ChatGPT images',
    title: 'Do ChatGPT images have metadata? C2PA in OpenAI images | TagLens',
    description: 'Images made with ChatGPT and OpenAI’s image models carry C2PA Content Credentials that say they were AI-generated. Check a file and see what platforms will show.',
    h1: 'What ChatGPT writes into your images',
    points: [
      ['Content Credentials', 'OpenAI adds C2PA Content Credentials to images from ChatGPT and its API, declaring them as AI-generated.'],
      ['What platforms do', 'Platforms that read C2PA, such as Instagram, TikTok and LinkedIn, can label these images automatically.'],
      ['When it disappears', 'Screenshots and many messaging apps strip the credentials, so a copy may show nothing.'],
    ],
  },
  {
    slug: 'adobe-firefly', name: 'Adobe Firefly and Photoshop',
    title: 'Adobe Firefly and Photoshop Generative Fill metadata | TagLens',
    description: 'Adobe Firefly and Photoshop generative features add Content Credentials declaring AI. See exactly what your export says and how platforms will treat it.',
    h1: 'What Adobe Firefly and Photoshop record',
    points: [
      ['Firefly images', 'Images generated in Firefly carry Content Credentials declaring them as AI-generated.'],
      ['Generative edits', 'Using Generative Fill, Expand or Remove in Photoshop records the AI edit in the file’s credentials.'],
      ['Classic tools', 'Non-generative edits like healing, masks and adjustments don’t declare AI.'],
    ],
  },
  {
    slug: 'google-gemini', name: 'Google Gemini and Imagen',
    title: 'Google Gemini and Imagen images: SynthID and metadata | TagLens',
    description: 'Images from Google’s AI models carry an invisible SynthID watermark, and some Google products also add metadata. See what your file declares.',
    h1: 'What Google’s AI tools leave in an image',
    points: [
      ['SynthID', 'Google embeds an invisible SynthID watermark in content made with its AI models. Only Google’s detector can read it.'],
      ['Metadata', 'Some Google products also write Content Credentials or IPTC fields, for example AI edits on Pixel phones. Drop your file to see what it has.'],
    ],
  },
  {
    slug: 'meta-ai', name: 'Meta AI',
    title: 'Meta AI images: labels, watermarks and metadata | TagLens',
    description: 'Images made with Meta AI carry visible and invisible markers plus IPTC metadata, so Meta’s apps can label them. Check what your file declares.',
    h1: 'What Meta AI puts in its images',
    points: [
      ['Markers', 'Meta has said images from its AI tools carry invisible watermarks and IPTC metadata, alongside visible labels in its apps.'],
      ['On Instagram and Facebook', 'These markers let Meta’s apps add “AI info” when the image is shared.'],
    ],
  },
  {
    slug: 'stable-diffusion', name: 'Stable Diffusion and ComfyUI',
    title: 'Stable Diffusion and ComfyUI PNG metadata: your prompt is in the file | TagLens',
    description: 'Automatic1111, Forge, ComfyUI and InvokeAI save the prompt, seed and workflow inside the PNG. See exactly what yours contains and remove it before sharing.',
    h1: 'Your Stable Diffusion prompt is inside the PNG',
    points: [
      ['What’s saved', 'Automatic1111 and Forge write a “parameters” text block; ComfyUI saves “prompt” and the full “workflow”; InvokeAI saves its own metadata block.'],
      ['Who can read it', 'Anyone with the original PNG. Many image sites and Discord keep these blocks intact.'],
      ['Labels', 'These blocks aren’t a standard AI declaration, so platforms may not label the image from them. TagLens can replace them with the standard IPTC AI field.'],
    ],
  },
];
