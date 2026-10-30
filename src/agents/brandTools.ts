/**
 * An organisation's look on the site: read a saved brand into the stylesheet,
 * and make the brand's art with the image model.
 *
 * The method — look at the reference, read the palette by role, match the
 * type, generate motifs rather than draw them, compare the render with the
 * reference — is the suite's shared "Matching a house style" skill; these are
 * the two things it needs from this app.
 */
import { formatAgentToolJson } from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandlerResult } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { parseDesignSystem, type DesignSystem } from '@purescience/platform-ui/design/brief'
import { brandsOffered, getBrand, listBrands, proposeBrand, proposeBrandSamples, type BrandDetail } from '../bridge/platformBridge'
import { brandAssets, brandBlock } from '../lib/brandStyles'
import { brandArgument, brandLine, sampleImages, siteBrandFrom, type SiteBrand } from '../lib/siteBrand'
import { analyseLayout } from '../lib/responsiveCheck'
import { AgentSiteToolError, type SiteAgentToolContext } from './catalog'

type Args = Record<string, unknown>
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
const said = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const NO_BRANDS_HERE =
  'This desktop cannot send anything to an organisation: it needs PureDesktop in an organisation that PureServer manages, on a recent version.'

/** A brand read for the site: its design system, where it lives, and what the desktop knows about it. */
export interface LoadedBrand {
  system: DesignSystem
  path: string
  /** The bridge's entry, when the desktop lists brands. */
  detail: BrandDetail | null
}

/** A brand by path or by an id from listBrands. Org brands are plain files too, read like any other. */
export async function loadBrand(context: SiteAgentToolContext, value: unknown): Promise<LoadedBrand> {
  const arg = brandArgument(value)
  if (!arg) throw new AgentSiteToolError('brand must be the absolute path of a .designsystem.json file, or a brand id from listBrands')
  const offered = brandsOffered()
  if ('id' in arg) {
    if (!offered) throw new AgentSiteToolError('this desktop does not list brands, so there are no brand ids: pass the absolute path of a .designsystem.json')
    let detail: BrandDetail
    try {
      detail = await getBrand(arg.id)
    } catch (error) {
      throw new AgentSiteToolError(`no brand ${arg.id} — call listBrands for the ids (${said(error)})`)
    }
    return { system: detail.system, path: detail.path, detail }
  }
  let system: DesignSystem
  try {
    system = parseDesignSystem(await context.brandFiles.readText(arg.path))
  } catch (error) {
    throw new AgentSiteToolError(`the brand could not be read: ${said(error)}`)
  }
  let detail: BrandDetail | null = null
  if (offered) {
    try {
      detail = await getBrand(arg.path)
    } catch {
      /* A brand outside the listed places is still a brand; it is just not one the desktop knows. */
    }
  }
  return { system, path: arg.path, detail }
}

/**
 * Put a brand on the site: its files into assets/, its block at the top of
 * styles/site.css, and the manifest told which brand it is. The one path for
 * the useBrand tool, the organisation's house style on a new site, and the
 * wizard's House style look.
 */
export async function applyBrand(
  context: SiteAgentToolContext,
  brand: LoadedBrand,
  how: SiteBrand['how'],
  base: { baseHash?: string },
  origin: 'agent' | 'manual' = 'agent',
) {
  const { system, path, detail } = brand
  const assets = brandAssets(system, path)
  for (const asset of assets) await context.brandFiles.copyIn(asset.from, asset.name)
  await context.brandFiles.refresh()
  for (const asset of assets) {
    if (asset.role === 'logo') context.setAssetRole(asset.name, 'logo')
    if (asset.role === 'reference') context.setAssetRole(asset.name, 'reference')
  }
  const block = brandBlock(system, assets)
  const record = siteBrandFrom(detail ?? { name: system.name, path }, how)
  const landed = context.writeBrand(block, record, base, origin)
  return { system, assets, block, record, landed }
}

export async function useBrandHandler(context: SiteAgentToolContext, args: Args): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) throw new AgentSiteToolError('there is no site open — save it first, so there is a package to bring the brand into')
  if (!brandArgument(args.brand))
    throw new AgentSiteToolError('brand must be the absolute path of a .designsystem.json file, or a brand id from listBrands')
  const baseHash = str(args.baseHash)
  if (!baseHash) throw new AgentSiteToolError('baseHash is required — the site hash getSiteContext or readStyles returned')
  const brand = await loadBrand(context, args.brand)
  const { system, assets, block, record, landed } = await applyBrand(context, brand, 'chosen', { baseHash })
  return {
    content: formatAgentToolJson({
      brand: system.name,
      in: brandLine(record),
      ...(record.default ? { houseStyle: true, organisation: record.organisation } : {}),
      brought: assets.map(asset => `assets/${asset.name}`),
      samples: brand.detail?.samples ?? [],
      properties: block.match(/--brand-[\w-]+/g),
      motifs: system.motifs ?? [],
      voice: system.voice ?? [],
      use: 'Write the rest of styles/site.css with these: background var(--brand-bg), text var(--brand-ink), headings in var(--brand-font-display) at var(--brand-display-weight), a second-colour line in var(--brand-accent-2), tags in var(--brand-font-mono) with var(--brand-highlight), the one primary button in var(--brand-accent) with var(--brand-radius), and the motif as background-image: var(--brand-motif) behind the hero. A motif with a description and no file: make it with makeImage. Tell the person which brand the site is in.',
      hash: landed.hash,
      changed: landed.changed,
    }),
  }
}

/** Every brand this person can use — the organisation's (its house style marked default), the workspace's, their own. */
export async function listBrandsHandler(context: SiteAgentToolContext): Promise<AgentToolHandlerResult> {
  const site = context.document.manifest?.brand
  const siteBrand = site ? { name: site.name, path: site.path, ...(site.id ? { id: site.id } : {}), in: brandLine(site) } : null
  if (!brandsOffered()) {
    return {
      content: formatAgentToolJson({
        offered: false,
        brands: [],
        siteBrand,
        next: 'This desktop does not list brands. Give useBrand the absolute path of a .designsystem.json (the workspace’s Brands folder often has one).',
      }),
    }
  }
  const entries = await listBrands()
  const house = entries.find(entry => entry.default)
  let houseSamples: string[] = []
  if (house) {
    try {
      houseSamples = (await getBrand(house.id)).samples
    } catch {
      /* listed but unreadable: the list still answers */
    }
  }
  return {
    content: formatAgentToolJson({
      offered: true,
      siteBrand,
      brands: entries.map(entry => ({
        id: entry.id,
        name: entry.name,
        source: entry.source,
        default: entry.default,
        ...(entry.organisation ? { organisation: entry.organisation } : {}),
        ...(entry.team ? { team: entry.team } : {}),
        path: entry.path,
        palette: entry.summary.palette.slice(0, 8).map(colour => (colour.role ? `${colour.role} ${colour.hex}` : colour.hex)),
        fonts: entry.summary.fonts,
        samples: entry.default ? houseSamples : entry.summary.samples,
      })),
      next: house
        ? `${house.name} is ${house.organisation ?? 'the organisation'}’s house style (default: true): use it whenever the person gives no other reference, brand or look. Look at its samples with view_image first, then useBrand with its id. A reference or brand the person gives you still wins. Say which brand you used.`
        : 'There is no organisation house style here. Use a brand the person names, or read the look off their reference.',
    }),
  }
}

/** Send a saved brand to the organisation, for an administrator to approve. Same path as the app's "Propose to organisation…". */
export async function proposeSiteBrand(context: SiteAgentToolContext, input: { brand?: unknown; note?: unknown }) {
  if (!brandsOffered()) throw new AgentSiteToolError(NO_BRANDS_HERE)
  const site = context.document.manifest?.brand
  const arg = brandArgument(input.brand) ?? (site ? (site.id ? { id: site.id } : { path: site.path }) : null)
  if (!arg) throw new AgentSiteToolError('brand is required: the path of a .designsystem.json or an id from listBrands (or put a brand on the site first)')
  const note = str(input.note)
  try {
    return await proposeBrand({ ...arg, ...(note ? { note } : {}) })
  } catch (error) {
    throw new AgentSiteToolError(said(error))
  }
}

/**
 * Pages of this site, captured as PNG, or images given by path, proposed as
 * samples of one of the organisation's brands (the site's own when it is one,
 * otherwise the house style).
 */
export async function proposeSiteSamples(
  context: SiteAgentToolContext,
  input: { images?: unknown; pages?: unknown; widths?: unknown; brand?: unknown; note?: unknown },
) {
  if (!brandsOffered()) throw new AgentSiteToolError(NO_BRANDS_HERE)
  let images = sampleImages(input.images)
  if (Array.isArray(input.images) && input.images.length && !images.length)
    throw new AgentSiteToolError('images must be absolute paths of PNG, JPEG or WebP files')
  if (!images.length) {
    if (!context.documentPath) throw new AgentSiteToolError('there is no site open — save it first, or pass images')
    const asked = Array.isArray(input.pages) ? input.pages.filter((page): page is string => typeof page === 'string' && !!context.document.pages[page]) : []
    if (Array.isArray(input.pages) && input.pages.length && !asked.length) throw new AgentSiteToolError('no such pages — call getSiteContext for the page paths')
    const pages = asked.length ? asked : context.pageSelection.length ? context.pageSelection : [context.selectedPage]
    const widths = Array.isArray(input.widths) ? input.widths.map(Number).filter(w => Number.isInteger(w) && w >= 320 && w <= 3840) : []
    const captured: string[] = []
    for (const page of pages)
      for (const width of widths.length ? widths : [1280]) {
        if (captured.length >= 12) break
        const result = (await context.exportPage({ format: 'png', page, width })) as { outputPath?: string } | null
        if (result?.outputPath) captured.push(result.outputPath)
      }
    if (!captured.length) throw new AgentSiteToolError('the pages could not be captured — try exportPage to see why')
    images = captured
  }
  const site = context.document.manifest?.brand
  const brand = str(input.brand) ?? (site?.source === 'organisation' && site.id ? site.id : undefined)
  const note = str(input.note)
  try {
    const answer = await proposeBrandSamples({ ...(brand ? { brand } : {}), images, ...(note ? { note } : {}) })
    return { ...answer, images }
  } catch (error) {
    throw new AgentSiteToolError(said(error))
  }
}

export async function proposeBrandToOrganisationHandler(context: SiteAgentToolContext, args: Args): Promise<AgentToolHandlerResult> {
  const answer = await proposeSiteBrand(context, args)
  return { content: formatAgentToolJson({ ...answer, next: 'Tell the person in plain words: an administrator decides; nothing changes until then.' }) }
}

export async function proposeSamplesToOrganisationHandler(context: SiteAgentToolContext, args: Args): Promise<AgentToolHandlerResult> {
  const answer = await proposeSiteSamples(context, args)
  return { content: formatAgentToolJson({ ...answer, next: 'Tell the person in plain words: an administrator decides; once approved the images join the brand’s samples.' }) }
}

/** Generate a picture for the site with the desktop's image model: the brand's motif, a texture, hero or conceptual art. */
export async function makeImageHandler(context: SiteAgentToolContext, args: Args): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) throw new AgentSiteToolError('there is no site open — save it first')
  const prompt = str(args.prompt)
  if (!prompt) throw new AgentSiteToolError('prompt is required: what the picture is, its light, colours and composition, read from the reference')
  if (!context.generateImage)
    throw new AgentSiteToolError(
      'this desktop has no image model. Tell the person (Settings › Models › Images). Only then fall back to a CSS or SVG treatment, and say it is a fallback.',
    )
  const sourceImages: { base64: string; mimeType: string; name?: string }[] = []
  const reference = str(args.reference)
  if (reference) {
    const path = reference.startsWith('/') ? reference : `${context.documentPath}/assets/${reference.replace(/^assets\//, '')}`
    const read = await context.brandFiles.readBase64(path)
    sourceImages.push({ base64: read.base64, mimeType: read.mimeType || 'image/png', name: path.split('/').pop() })
  }
  const background = args.background !== false
  const fullPrompt = `${prompt}${
    background
      ? ' This is background art for a web page section in an organisation’s brand: wide, calm, with large quiet areas where headlines and text will sit, detail and light toward the edges.'
      : ''
  } No text, letters, numbers, logos, watermarks or user interface. Match the reference image’s style, light and colour exactly when one is given.`
  const size = args.size === '1024x1024' || args.size === '1024x1536' ? args.size : '1536x1024'
  const made = await context.generateImage({ prompt: fullPrompt, size, quality: 'high', outputFormat: 'png', ...(sourceImages.length ? { sourceImages } : {}) })
  const name = `${slug(str(args.name) ?? 'image')}.png`
  await context.brandFiles.writeAsset(name, made.base64)
  await context.brandFiles.refresh()
  return {
    content: formatAgentToolJson({
      file: `assets/${name}`,
      model: made.modelId,
      use: 'Reference it from styles/site.css as url("../assets/' + name + '") (or --brand-motif) or from a page as assets/' + name + '. Judge the picture against the reference; make it again with a sharper prompt if it is off. Use one motif consistently.',
    }),
    ...(made.mimeType === 'image/png' || made.mimeType === 'image/jpeg' ? { images: [{ mimeType: made.mimeType as 'image/png' | 'image/jpeg', data: made.base64 }] } : {}),
  }
}

/**
 * The page at a phone's and a tablet's width, measured: buttons that wrap,
 * the headline's line count, gutters, small text, empty bands, mixed
 * alignment, tight tracking, sideways scroll. Clean means no findings.
 */
export async function checkResponsiveHandler(context: SiteAgentToolContext, args: Args): Promise<AgentToolHandlerResult> {
  const page = str(args.page) ?? context.selectedPage
  if (!context.document.pages[page]) throw new AgentSiteToolError(`no page called ${page}`)
  const asked = Array.isArray(args.widths) ? args.widths.map(Number).filter(w => Number.isInteger(w) && w >= 320 && w <= 1920) : []
  const widths = asked.length ? asked.slice(0, 4) : [390, 768]
  const measured = await context.checkResponsive(page, widths)
  const results = measured.map(({ width, read, why }) => {
    if (!read) return { width, measured: false, why: why ?? 'the page could not be measured (is PureSite visible?)' }
    const findings = analyseLayout(read)
    const h1 = read.boxes.find(box => box.kind === 'h1')
    return {
      width,
      measured: true,
      headline: h1 ? { text: h1.text.slice(0, 80), lines: h1.lines, fontSize: Math.round(h1.fontSize) } : null,
      clean: findings.length === 0,
      findings: findings.map(({ code, message, fix }) => ({ code, message, fix })),
    }
  })
  const clean = results.every(result => 'clean' in result && result.clean)
  return {
    content: formatAgentToolJson({
      page,
      clean,
      results,
      next: clean
        ? 'Now exportPage with format png at width 390 and look at it with view_image: the numbers do not see everything.'
        : 'Fix every finding in styles/site.css (the foundation tokens: --gutter, --space-*, --step-*), then run checkResponsive again until it is clean, then exportPage png at 390 and look at it with view_image.',
    }),
  }
}
