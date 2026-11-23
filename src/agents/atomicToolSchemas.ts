import type {
  AppOperationExposure,
  AppOperationRisk,
} from '@purescience/platform-ui/bridge/appFunctions'

export interface AtomicToolSchemaSpec {
  name: string
  exposure: AppOperationExposure
  category: string
  risk: AppOperationRisk
  requiresApproval: boolean
  releaseButton?: string
  deletesPermanently?: boolean
  riskWhen?: Record<string, 'write' | 'destructive' | 'external' | 'release'>
  requiresCapabilities?: Array<'vision'>
  description: string
  inputSchema: Record<string, unknown> & { type: 'object' }
}

/**
 * All 35 atomic PureSite tools with 3-tier exposure metadata:
 *   - "always" (8): core ~23% read/write/review/save/build verbs exposed directly in plugin.json
 *   - "extended" (27): specialist tools discoverable via discoverAppTools and
 *     callable via callExtendedReadTool / callExtendedTool with zero loss of functionality.
 */
export const PURESITE_ATOMIC_TOOL_SCHEMAS: readonly AtomicToolSchemaSpec[] = [
  // ---- Core Always-Exposed Atomic Tools (8 / 35 = 22.9%) ----
  {
    name: 'getSiteContext',
    exposure: 'always',
    category: 'site',
    risk: 'read',
    requiresApproval: false,
    description:
      "Return the open site: title, package path, the site hash, every page with its URL path, title and its own hash, the nav order, the stylesheet, the files attached and what each is for, the user's current selection when they have clicked an element in the preview, the verification state (verified / checking / failed, with reasons in plain words), how many revision snapshots exist, and where the site is published. Call this first, always — a page path or element path guessed without it is usually wrong. Every write takes baseHash: a page's hash for page tools, the site hash for writeStyles, movePage and the collection tools.",
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'readPage',
    exposure: 'always',
    category: 'pages',
    risk: 'read',
    requiresApproval: false,
    description:
      'Call getSiteContext first to get exact page paths. Return the full HTML of one page with its hash. Pass that hash as baseHash (with page) to writePage or to an element tool on that page.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          description: 'Page path, e.g. index.html or work/index.html',
        },
      },
      required: ['page'],
      additionalProperties: false,
    },
  },
  {
    name: 'writePage',
    exposure: 'always',
    category: 'pages',
    risk: 'write',
    requiresApproval: true,
    description:
      'Replace one page\'s HTML. Requires baseHash — the page hash from readPage; refused with "changed since your read" when the page moved meanwhile, in which case call readPage again and redo the edit. The previous site is snapshotted first (listRevisions / restoreRevision). Lay content out in flow — never position children absolutely at fixed offsets, or they overlap when text wraps at a different width. Link the stylesheet with the right number of ../ for the page\'s depth: a wrong link previews unstyled because it ships unstyled.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        html: {
          type: 'string',
          description: 'The whole document, doctype to </html>',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['baseHash', 'html', 'page'],
      additionalProperties: false,
    },
  },
  {
    name: 'addPage',
    exposure: 'always',
    category: 'pages',
    risk: 'write',
    requiresApproval: true,
    description:
      "Call getSiteContext first for existing pages and site baseHash. Add a page to the open site. A name without .html becomes a folder with an index.html, so 'about' serves at /about/.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
        title: {
          type: 'string',
        },
        html: {
          type: 'string',
          description: 'Optional full document; a starter page is written when absent',
        },
        baseHash: {
          type: 'string',
          description:
            'The site hash from getSiteContext. Refused when the site changed since your read — call getSiteContext again and redo the edit.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'writeStyles',
    exposure: 'always',
    category: 'styles',
    risk: 'write',
    requiresApproval: true,
    description:
      'Replace the site stylesheet. One stylesheet governs the whole site, so a change here changes every page. Requires baseHash — the site hash from readStyles or getSiteContext; refused when the site changed since your read.',
    inputSchema: {
      type: 'object',
      properties: {
        css: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            'The site hash from getSiteContext. Refused when the site changed since your read — call getSiteContext again and redo the edit.',
        },
      },
      required: ['baseHash', 'css'],
      additionalProperties: false,
    },
  },
  {
    name: 'exportPage',
    exposure: 'always',
    category: 'review',
    risk: 'write',
    requiresApproval: true,
    description:
      'Export a page from the open site to a PDF or full-page PNG for review. Defaults to the current page. Saves a new file under the site package reviews/ folder and returns outputPath and artifactPaths. Does not publish or send anything. Drafts can be exported. Call getSiteContext first.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['pdf', 'png'],
        },
        page: {
          type: 'string',
          description: 'Exact page path returned by getSiteContext; defaults to current page.',
        },
        width: {
          type: 'integer',
          minimum: 320,
          maximum: 3840,
          description:
            'PNG layout width in CSS pixels. Defaults to current preview width. PDF uses A4 browser pagination.',
        },
      },
      required: ['format'],
      additionalProperties: false,
    },
  },
  {
    name: 'saveSite',
    exposure: 'always',
    category: 'site',
    risk: 'write',
    requiresApproval: true,
    description:
      'Save the current site into its app-managed .site package and return the durable artifact path. Call this after site edits before completing a mission.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'buildSite',
    exposure: 'always',
    category: 'build',
    risk: 'write',
    requiresApproval: true,
    description:
      'Write build/ — every page, the stylesheet and the assets in use — and return the manifest of files with their sizes. Refused, with the reasons, while the site is not verified: a blocking finding from checkSite, a page that scrolls sideways, or a preview not yet measured (it re-checks first). Publishing is NOT a tool: the person publishes from the Publish dialog, which runs the same check.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },

  // ---- Extended Specialist Atomic Tools (27 / 35 = 77.1%) ----
  {
    name: 'getSiteMap',
    exposure: 'extended',
    category: 'navigation',
    risk: 'read',
    requiresApproval: false,
    description:
      'The site as its links draw it: every page with what it links to and what links to it, every page the writing PROMISES but nobody has built (with the sentences that promised it and a brief taken only from them), and every page nothing points at. A promised page is not an error — the build keeps the words and drops the anchor, so no reader meets a dead end. Read this before adding a page: the site usually already says what it needs.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'movePage',
    exposure: 'extended',
    category: 'navigation',
    risk: 'write',
    requiresApproval: true,
    description: 'Reorder the nav. Pure reorder — the page itself does not change.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'number',
        },
        to: {
          type: 'number',
        },
        baseHash: {
          type: 'string',
          description:
            'The site hash from getSiteContext. Refused when the site changed since your read — call getSiteContext again and redo the edit.',
        },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'deletePage',
    exposure: 'extended',
    category: 'pages',
    risk: 'destructive',
    requiresApproval: true,
    description: 'Delete a page. Refuses to delete the last one.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['page'],
      additionalProperties: false,
    },
  },
  {
    name: 'setPageTitle',
    exposure: 'extended',
    category: 'pages',
    risk: 'write',
    requiresApproval: true,
    description: "Set a page's <title>, which is also its name in the rail and the nav.",
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        title: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['page', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'setElementText',
    exposure: 'extended',
    category: 'elements',
    risk: 'write',
    requiresApproval: true,
    description:
      "Retype one element's text. Only a leaf can be retyped: setting text on a container would delete every element inside it.",
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        path: {
          type: 'string',
          description: "Child indices from <body>, e.g. 0/2/1 — from getSiteContext's selection",
        },
        text: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['page', 'path', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'setElementSrc',
    exposure: 'extended',
    category: 'elements',
    risk: 'write',
    requiresApproval: true,
    description:
      'Point an image at a file in assets/, or put one into an empty box — the box is kept and the image fills it.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        path: {
          type: 'string',
        },
        src: {
          type: 'string',
          description: 'assets/<file name>',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['page', 'path', 'src'],
      additionalProperties: false,
    },
  },
  {
    name: 'insertElement',
    exposure: 'extended',
    category: 'elements',
    risk: 'write',
    requiresApproval: true,
    description:
      'Insert markup into a page in flow, before or after an existing element. There is no x/y: order is the only position, which is what keeps a page from overlapping itself at another width.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        markup: {
          type: 'string',
        },
        beforePath: {
          type: 'string',
        },
        afterPath: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['page', 'markup'],
      additionalProperties: false,
    },
  },
  {
    name: 'deleteElement',
    exposure: 'extended',
    category: 'elements',
    risk: 'destructive',
    requiresApproval: true,
    description: 'Remove one element from a page.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        path: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['page', 'path'],
      additionalProperties: false,
    },
  },
  {
    name: 'readStyles',
    exposure: 'extended',
    category: 'styles',
    risk: 'read',
    requiresApproval: false,
    description:
      'Return the site stylesheet every page shares, with the site hash to pass as baseHash to writeStyles.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'setAssetRole',
    exposure: 'extended',
    category: 'assets',
    risk: 'write',
    requiresApproval: true,
    description:
      'Say what an attached file is for: content to place on a page, a design reference to read a look from and never show, or the logo.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
        role: {
          type: 'string',
          enum: ['content', 'reference', 'logo'],
        },
      },
      required: ['name', 'role'],
      additionalProperties: false,
    },
  },
  {
    name: 'makeImage',
    exposure: 'extended',
    category: 'assets',
    risk: 'write',
    requiresApproval: true,
    description:
      "Generate a picture for the site with the desktop's image model (best quality): the brand's motif or texture (a network of glowing nodes, a grain, a light field), hero or conceptual art. Required whenever the reference has such art — call it BEFORE composing the page (before prepareSite or writeStyles), then use the file in the stylesheet: never imitate it with CSS shapes or SVG line art. SVG or CSS is only a fallback when this tool reports no image model, or for exact diagrams and charts. Prompt from the reference (what it is, its light, density, colours, the brand palette as hex); pass reference (an asset name or absolute path) so the model matches it. Background art is asked for wide and calm with quiet areas for text and no text in it. Saved as assets/<name>.png; the picture comes back so you can judge it. Reuse one motif across the site.",
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
        },
        name: {
          type: 'string',
        },
        reference: {
          type: 'string',
        },
        size: {
          type: 'string',
          enum: ['1536x1024', '1024x1024', '1024x1536'],
        },
        background: {
          type: 'boolean',
          description: 'Background-safe art with quiet areas for text (default true).',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'listBrands',
    exposure: 'extended',
    category: 'brand',
    risk: 'read',
    requiresApproval: false,
    description:
      "Every brand this person can put on the site: the organisation's (its house style marked default: true, with its sample image paths), the workspace's Brands folder and their own, each with id, name, source, path, palette, fonts and sample count, plus the brand the site is in now. With an organisation house style, it is the look whenever the person gives no other reference, brand or look: view its samples with view_image first, then useBrand with its id. On a desktop that does not list brands it says so; useBrand then takes a path.",
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'useBrand',
    exposure: 'extended',
    category: 'brand',
    risk: 'write',
    requiresApproval: true,
    description:
      "Put a saved brand on the site: the organisation's house style, a workspace brand or the person's own (listBrands names them all), or any .designsystem.json (the suite's shared brand format, saved by PureSlides' saveLookAsBrand, Canvas or PureDesign) with its fonts, logos, motif art and reference images beside it. Its files are copied into assets/ (fonts self-hosted, logos and references marked), and a managed block at the top of styles/site.css gets the @font-face rules and --brand-* custom properties (bg, surface, ink, muted, accent, on-accent, accent-2, highlight, line, font-display, font-body, font-mono, display-weight, heading-case, radius, motif). Re-applying replaces only that block; the site remembers which brand it is in. Then write the rest of the stylesheet with those properties, and tell the person which brand you used.",
    inputSchema: {
      type: 'object',
      properties: {
        brand: {
          type: 'string',
          description:
            "A brand id from listBrands (an organisation brand's id works), or the absolute path of a .designsystem.json file.",
        },
        baseHash: {
          type: 'string',
          description: 'The site hash from getSiteContext or readStyles.',
        },
      },
      required: ['brand', 'baseHash'],
      additionalProperties: false,
    },
  },
  {
    name: 'proposeBrandToOrganisation',
    exposure: 'extended',
    category: 'brand',
    risk: 'write',
    requiresApproval: true,
    description:
      "Call getSiteContext first. Propose a saved brand (a .designsystem.json with its .brand/ folder) to the organisation's PureServer, for an administrator to approve as one of its brands. It must carry at least one sample image (reference). Use it when the person says a brand they made should be the organisation's. Without brand, the brand the site is in. Errors come back in plain words (not in an organisation; no sample images): pass them on. Nothing changes until an administrator approves.",
    inputSchema: {
      type: 'object',
      properties: {
        brand: {
          type: 'string',
          description:
            "A brand id from listBrands, or the absolute path of a .designsystem.json. Defaults to the site's brand.",
        },
        note: {
          type: 'string',
          description: 'A line for the administrator: why this brand.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'proposeSamplesToOrganisation',
    exposure: 'extended',
    category: 'brand',
    risk: 'write',
    requiresApproval: true,
    description:
      "Call getSiteContext first. Propose sample images to the organisation for one of its brands (the site's brand when it is the organisation's, otherwise its house style): once an administrator approves, they join the brand's samples that every design agent looks at first. Without images, the site's own pages are captured as PNG (the ticked pages, or the one on screen; at 1280 wide unless widths are given; at most 12 images). Use it when the person says this site shows the house style well.",
    inputSchema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Absolute paths of PNG, JPEG or WebP images (at most 12), e.g. ones exportPage made. Leave out to capture pages.',
        },
        pages: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Page paths to capture when no images are given.',
        },
        widths: {
          type: 'array',
          items: {
            type: 'integer',
          },
          description: 'Widths to capture each page at (320–3840), e.g. [1280, 390].',
        },
        brand: {
          type: 'string',
          description: "The organisation brand's id from listBrands; defaults as above.",
        },
        note: {
          type: 'string',
          description: 'A line for the administrator.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'checkSite',
    exposure: 'extended',
    category: 'audit',
    risk: 'read',
    requiresApproval: false,
    description:
      'Report what will be wrong once the site is live: links that go nowhere, images referenced but never added, a stylesheet linked with the wrong number of ../, pages nothing reaches, pages with no title — plus the verification state of the preview. Run this before buildSite.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'checkResponsive',
    exposure: 'extended',
    category: 'audit',
    risk: 'read',
    requiresApproval: false,
    description:
      "Measure a page at phone and tablet widths (default 390 and 768): buttons whose text wraps or overflows, the headline's line count (at most 3), elements closer than 16px (24px on tablets) to the screen edge, text under 14px, empty vertical bands, section headings that switch between centred and left, headings tracked tighter than -0.035em, sideways scrolling, and header links a reader cannot reach with no working menu or other link in their place (nav-links-hidden; nav-check-incomplete when it could not tell, which is never clean). It only reads: menus are opened in its measuring copy, never in the site's files. It also returns copyNotes (advice, never part of clean) for cards holding only a word or two: give each a claim from the brief or remove it. Run it after every draft or stylesheet change and fix every finding, then export a PNG at 390 and look at it with view_image before calling the site done. PureSite must be on screen for the measurement.",
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
        },
        widths: {
          type: 'array',
          items: {
            type: 'integer',
            minimum: 320,
            maximum: 1920,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'listCollections',
    exposure: 'extended',
    category: 'collections',
    risk: 'read',
    requiresApproval: false,
    description:
      'Return what this site can store: each collection, its fields and types, and who may read, insert, update and delete. Empty when the site holds no records.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'setCollection',
    exposure: 'extended',
    category: 'collections',
    risk: 'write',
    requiresApproval: true,
    description:
      'Create or replace a collection of records. Names are lowercase identifiers. Access defaults to insert public and read owner — anyone may submit, only the owner reads back — which is what a form wants; widen it deliberately. Records need an account-owned site on here.now.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Lowercase identifier, e.g. enquiries',
        },
        fields: {
          type: 'array',
          description: 'The fields a record may carry.',
          items: {
            type: 'object',
            required: ['name', 'type'],
            properties: {
              name: {
                type: 'string',
              },
              type: {
                type: 'string',
                enum: [
                  'string',
                  'number',
                  'integer',
                  'boolean',
                  'url',
                  'email',
                  'datetime',
                  'array',
                  'object',
                ],
              },
              required: {
                type: 'boolean',
              },
              maxLength: {
                type: 'number',
                description: 'Strings, arrays and objects',
              },
              minimum: {
                type: 'number',
              },
              maximum: {
                type: 'number',
              },
              trim: {
                type: 'boolean',
              },
            },
          },
        },
        access: {
          type: 'object',
          description: 'public, owner or none per action. Omit for the safe default.',
          properties: {
            read: {
              type: 'string',
              enum: ['public', 'owner', 'none'],
            },
            insert: {
              type: 'string',
              enum: ['public', 'owner', 'none'],
            },
            update: {
              type: 'string',
              enum: ['public', 'owner', 'none'],
            },
            delete: {
              type: 'string',
              enum: ['public', 'owner', 'none'],
            },
          },
        },
        rateLimit: {
          type: 'string',
          description: '"<number>/hour/ip" or "<number>/minute/ip"',
        },
        baseHash: {
          type: 'string',
          description:
            'The site hash from getSiteContext. Refused when the site changed since your read — call getSiteContext again and redo the edit.',
        },
      },
      required: ['name', 'fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'deleteCollection',
    exposure: 'extended',
    category: 'collections',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Stop the site storing a kind of record. Records already held by the host are not deleted by this — it changes what the site declares.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            'The site hash from getSiteContext. Refused when the site changed since your read — call getSiteContext again and redo the edit.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'addFormForCollection',
    exposure: 'extended',
    category: 'collections',
    risk: 'write',
    requiresApproval: true,
    description:
      "Insert a working form into a page that submits to one of this site's collections. The markup and its script are generated from the collection, so the form and what the host will accept cannot disagree. No key is involved: public insert works because the request comes from the site itself.",
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
        },
        page: {
          type: 'string',
          description: 'Defaults to the page on screen',
        },
        beforePath: {
          type: 'string',
        },
        afterPath: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
          description:
            "The page's hash from readPage (or getSiteContext's pages[].hash). Checked against that page only; refused when the page changed since your read — read it again and redo the edit.",
        },
      },
      required: ['collection'],
      additionalProperties: false,
    },
  },
  {
    name: 'listRevisions',
    exposure: 'extended',
    category: 'revisions',
    risk: 'read',
    requiresApproval: false,
    description:
      "List the site's revision snapshots, newest first. A snapshot is the WHOLE site as it was before a change: every ask from the prompt box, every agent write, every import and every restore copies the previous version into the package's history/ folder first (12 kept). Each entry reports file, at, reason, scope, textChars and byteSize — compare textChars across entries to see where content went missing. Where the site is published is never part of a snapshot. Call this before restoreRevision.",
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'restoreRevision',
    exposure: 'extended',
    category: 'revisions',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Put a revision snapshot back as the open site — the same restore as the UI\'s Undo and History list. Use it when a rewrite (yours or an earlier one) lost content the user wanted kept: a write result reports textRemoved when a large share of the visible text vanished. The current site is snapshotted first (reason "restore"), so a restore is itself undoable; the site\'s published record (host, URL, claim token) is kept as it is now, never taken from the snapshot. Pass the file name exactly as listRevisions reports it, then call getSiteContext for the new hashes.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: "The snapshot's file name from listRevisions.",
        },
      },
      required: ['file'],
      additionalProperties: false,
    },
  },
  {
    name: 'prepareSite',
    exposure: 'extended',
    category: 'drawer',
    risk: 'write',
    requiresApproval: true,
    description:
      'Save the current site brief as a composition request. No model call. Returns only the request identity: requestId, baseHash, path, kind, status and counts. Then call getDrawerRequest for the saved HTML, styles, design guide and files, compose here, commitDrawerRequest with that requestId and baseHash, then checkSite and buildSite.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          description: 'Optional creation brief; defaults to the saved brief.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'getDrawerRequest',
    exposure: 'extended',
    category: 'drawer',
    risk: 'read',
    requiresApproval: false,
    description:
      'Read the saved request, exact HTML/baseHash, edit scope, assets and design guide.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'commitDrawerRequest',
    exposure: 'extended',
    category: 'drawer',
    risk: 'write',
    requiresApproval: true,
    description:
      'Commit the saved request once. Draft/edit: supply complete pages and styles preserving everything outside the saved selection. Describe: supply descriptions only from actual image pixels. Returns persisted status, not layout certification.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string',
        },
        baseHash: {
          type: 'string',
        },
        title: {
          type: 'string',
        },
        descriptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
              description: {
                type: 'string',
              },
            },
            required: ['name', 'description'],
          },
        },
        pages: {
          type: 'object',
          additionalProperties: {
            type: 'string',
          },
        },
        styles: {
          type: 'string',
        },
      },
      required: ['requestId', 'baseHash'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancelDrawerRequest',
    exposure: 'extended',
    category: 'drawer',
    risk: 'destructive',
    requiresApproval: true,
    description:
      'Cancel the saved pending request by ID. Subsequent commits are refused. Does not undo a completed save.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string',
        },
      },
      required: ['requestId'],
      additionalProperties: false,
    },
  },
] as const
