import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
  type BuildHandlersOptions,
} from '@purescience/platform-ui/bridge/appFunctions'
import type {
  AgentToolHandler,
  AgentToolHandlerResult,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { PURESITE_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  checkResponsiveHandler,
  listBrandsHandler,
  makeImageHandler,
  proposeBrandToOrganisationHandler,
  proposeSamplesToOrganisationHandler,
  useBrandHandler,
} from './brandTools'
import { AgentSiteToolError, type SiteAgentToolContext } from './catalog'
import { PURESITE_FUNCTIONS } from './functions'
import {
  addFormForCollectionHandler,
  addPageHandler,
  buildSiteHandler,
  checkSiteHandler,
  deleteCollectionHandler,
  deleteElementHandler,
  deletePageHandler,
  exportPageHandler,
  getSiteContextHandler,
  getSiteMapHandler,
  insertElementHandler,
  listCollectionsHandler,
  listRevisionsHandler,
  movePageHandler,
  prepareSiteHandler,
  readPageHandler,
  readStylesHandler,
  restoreRevisionHandler,
  saveSiteHandler,
  setAssetRoleHandler,
  setCollectionHandler,
  setElementSrcHandler,
  setElementTextHandler,
  setPageTitleHandler,
  writePageHandler,
  writeStylesHandler,
} from './handlers'

type AtomicRunner = (
  ctx: SiteAgentToolContext,
  args: Record<string, unknown>,
) => AgentToolHandlerResult | Promise<AgentToolHandlerResult>

const ATOMIC_RUNNERS: Record<string, AtomicRunner> = {
  getSiteContext: ctx => getSiteContextHandler(ctx),
  getSiteMap: ctx => getSiteMapHandler(ctx),
  prepareSite: (ctx, args) => prepareSiteHandler(ctx, args),
  getDrawerRequest: async ctx => ({
    content: JSON.stringify(await ctx.getDrawerRequest()),
  }),
  cancelDrawerRequest: async (ctx, args) => ({
    content: JSON.stringify(await ctx.cancelDrawerRequest(args)),
  }),
  commitDrawerRequest: async (ctx, args) => ({
    content: JSON.stringify(await ctx.commitDrawerRequest(args)),
  }),
  readPage: (ctx, args) => readPageHandler(ctx, args),
  writePage: (ctx, args) => writePageHandler(ctx, args),
  addPage: (ctx, args) => addPageHandler(ctx, args),
  deletePage: (ctx, args) => deletePageHandler(ctx, args),
  movePage: (ctx, args) => movePageHandler(ctx, args),
  setPageTitle: (ctx, args) => setPageTitleHandler(ctx, args),
  setElementText: (ctx, args) => setElementTextHandler(ctx, args),
  setElementSrc: (ctx, args) => setElementSrcHandler(ctx, args),
  insertElement: (ctx, args) => insertElementHandler(ctx, args),
  deleteElement: (ctx, args) => deleteElementHandler(ctx, args),
  readStyles: ctx => readStylesHandler(ctx),
  writeStyles: (ctx, args) => writeStylesHandler(ctx, args),
  setAssetRole: (ctx, args) => setAssetRoleHandler(ctx, args),
  listBrands: ctx => listBrandsHandler(ctx),
  useBrand: (ctx, args) => useBrandHandler(ctx, args),
  proposeBrandToOrganisation: (ctx, args) =>
    proposeBrandToOrganisationHandler(ctx, args),
  proposeSamplesToOrganisation: (ctx, args) =>
    proposeSamplesToOrganisationHandler(ctx, args),
  makeImage: (ctx, args) => makeImageHandler(ctx, args),
  checkSite: ctx => checkSiteHandler(ctx),
  saveSite: ctx => saveSiteHandler(ctx),
  buildSite: ctx => buildSiteHandler(ctx),
  exportPage: (ctx, args) => exportPageHandler(ctx, args),
  checkResponsive: (ctx, args) => checkResponsiveHandler(ctx, args),
  listCollections: ctx => listCollectionsHandler(ctx),
  setCollection: (ctx, args) => setCollectionHandler(ctx, args),
  deleteCollection: (ctx, args) => deleteCollectionHandler(ctx, args),
  addFormForCollection: (ctx, args) => addFormForCollectionHandler(ctx, args),
  listRevisions: ctx => listRevisionsHandler(ctx),
  restoreRevision: (ctx, args) => restoreRevisionHandler(ctx, args),
}

const atomicTools: AppAtomicToolDefinition<SiteAgentToolContext>[] =
  PURESITE_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<SiteAgentToolContext>({
      ...schema,
      run: async (ctx, args) => {
        const runner = ATOMIC_RUNNERS[schema.name]
        if (!runner) {
          throw new AgentSiteToolError(
            `Missing atomic tool handler for "${schema.name}".`,
          )
        }
        return runner(ctx, args)
      },
    }),
  )

/**
 * PureSite's unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 6 composite `function` workflows (`fn_*`, always exposed)
 *   - 8 core atomic tools (~23% of 35, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 27 extended specialist atomic tools (hidden by default, 100% reachable on demand)
 */
export const PURESITE_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<SiteAgentToolContext>({
    appSlug: 'site',
    appName: 'PureSite',
    functions: PURESITE_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPureSiteHandlers(
  getCtx: () => SiteAgentToolContext,
  options: BuildHandlersOptions<SiteAgentToolContext> = {},
): Record<string, AgentToolHandler> {
  return PURESITE_OPERATIONS_REGISTRY.buildHandlers(getCtx, {
    createError: message => new AgentSiteToolError(message),
    ...options,
  })
}
