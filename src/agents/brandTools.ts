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
import { parseDesignSystem } from '@purescience/platform-ui/design/brief'
import { brandAssets, brandBlock, withBrandBlock } from '../lib/brandStyles'
import { AgentSiteToolError, type SiteAgentToolContext } from './catalog'

type Args = Record<string, unknown>
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image'

export async function useBrandHandler(context: SiteAgentToolContext, args: Args): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) throw new AgentSiteToolError('there is no site open — save it first, so there is a package to bring the brand into')
  const path = str(args.brand)
  if (!path || !path.startsWith('/') || !path.endsWith('.designsystem.json'))
    throw new AgentSiteToolError('brand must be the absolute path of a .designsystem.json file')
  const baseHash = str(args.baseHash)
  if (!baseHash) throw new AgentSiteToolError('baseHash is required — the site hash getSiteContext or readStyles returned')
  let system
  try {
    system = parseDesignSystem(await context.brandFiles.readText(path))
  } catch (error) {
    throw new AgentSiteToolError(`the brand could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  const assets = brandAssets(system, path)
  for (const asset of assets) await context.brandFiles.copyIn(asset.from, asset.name)
  await context.brandFiles.refresh()
  for (const asset of assets) {
    if (asset.role === 'logo') context.setAssetRole(asset.name, 'logo')
    if (asset.role === 'reference') context.setAssetRole(asset.name, 'reference')
  }
  const block = brandBlock(system, assets)
  const result = context.writeStyles(withBrandBlock(context.document.styles, block), { baseHash })
  return {
    content: formatAgentToolJson({
      brand: system.name,
      brought: assets.map(asset => `assets/${asset.name}`),
      properties: block.match(/--brand-[\w-]+/g),
      motifs: system.motifs ?? [],
      voice: system.voice ?? [],
      use: 'Write the rest of styles/site.css with these: background var(--brand-bg), text var(--brand-ink), headings in var(--brand-font-display) at var(--brand-display-weight), a second-colour line in var(--brand-accent-2), tags in var(--brand-font-mono) with var(--brand-highlight), the one primary button in var(--brand-accent) with var(--brand-radius), and the motif as background-image: var(--brand-motif) behind the hero. A motif with a description and no file: make it with makeImage.',
      hash: result.hash,
      changed: result.changed,
    }),
  }
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
