/**
 * Registering the site tools with the platform.
 *
 * Handlers read `contextRef.current`, so a tool called while a build is
 * running sees the site as it is now rather than as it was when the drawer
 * opened.
 */
import { useRef } from 'react'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  AgentSiteToolError,
  PURESITE_AGENT_LOG_LABEL,
  PURESITE_AGENT_TOOLS,
  type SiteAgentToolContext,
} from '../agents/catalog'
import {
  addPageHandler,
  buildSiteHandler,
  exportPageHandler,
  checkSiteHandler,
  saveSiteHandler,
  deleteElementHandler,
  deletePageHandler,
  getSiteContextHandler,
  getSiteMapHandler,
  insertElementHandler,
  movePageHandler,
  readPageHandler,
  readStylesHandler,
  setAssetRoleHandler,
  setElementSrcHandler,
  setElementTextHandler,
  setPageTitleHandler,
  writePageHandler,
  writeStylesHandler,
  listCollectionsHandler,
  setCollectionHandler,
  deleteCollectionHandler,
  addFormForCollectionHandler,
  listRevisionsHandler,
  restoreRevisionHandler,
} from '../agents/handlers'

export function usePureSiteAgentTools(
  ready: boolean,
  context: SiteAgentToolContext,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  usePlatformAgentTools({
    ready,
    tools: PURESITE_AGENT_TOOLS,
    logLabel: PURESITE_AGENT_LOG_LABEL,
    errorType: AgentSiteToolError,
    handlers: {
      exportPage: async invoke => exportPageHandler(contextRef.current, invoke.arguments ?? {}),
      cancelDrawerRequest: async invoke => ({
        content: JSON.stringify(
          await contextRef.current.cancelDrawerRequest(invoke.arguments ?? {}),
        ),
      }),
      prepareSite: async invoke => ({
        content: JSON.stringify(
          await contextRef.current.prepareSite(invoke.arguments ?? {}),
        ),
      }),
      getDrawerRequest: async () => ({
        content: JSON.stringify(await contextRef.current.getDrawerRequest()),
      }),
      commitDrawerRequest: async invoke => ({
        content: JSON.stringify(
          await contextRef.current.commitDrawerRequest(invoke.arguments ?? {}),
        ),
      }),
      getSiteContext: async () => getSiteContextHandler(contextRef.current),
      getSiteMap: async () => getSiteMapHandler(contextRef.current),
      readPage: async invoke =>
        readPageHandler(contextRef.current, invoke.arguments ?? {}),
      writePage: async invoke =>
        writePageHandler(contextRef.current, invoke.arguments ?? {}),
      addPage: async invoke =>
        addPageHandler(contextRef.current, invoke.arguments ?? {}),
      deletePage: async invoke =>
        deletePageHandler(contextRef.current, invoke.arguments ?? {}),
      movePage: async invoke =>
        movePageHandler(contextRef.current, invoke.arguments ?? {}),
      setPageTitle: async invoke =>
        setPageTitleHandler(contextRef.current, invoke.arguments ?? {}),
      setElementText: async invoke =>
        setElementTextHandler(contextRef.current, invoke.arguments ?? {}),
      setElementSrc: async invoke =>
        setElementSrcHandler(contextRef.current, invoke.arguments ?? {}),
      insertElement: async invoke =>
        insertElementHandler(contextRef.current, invoke.arguments ?? {}),
      deleteElement: async invoke =>
        deleteElementHandler(contextRef.current, invoke.arguments ?? {}),
      readStyles: async () => readStylesHandler(contextRef.current),
      writeStyles: async invoke =>
        writeStylesHandler(contextRef.current, invoke.arguments ?? {}),
      setAssetRole: async invoke =>
        setAssetRoleHandler(contextRef.current, invoke.arguments ?? {}),
      checkSite: async () => checkSiteHandler(contextRef.current),
      saveSite: async () => saveSiteHandler(contextRef.current),
      buildSite: async () => buildSiteHandler(contextRef.current),
      listCollections: async () => listCollectionsHandler(contextRef.current),
      setCollection: async invoke =>
        setCollectionHandler(contextRef.current, invoke.arguments ?? {}),
      deleteCollection: async invoke =>
        deleteCollectionHandler(contextRef.current, invoke.arguments ?? {}),
      addFormForCollection: async invoke =>
        addFormForCollectionHandler(contextRef.current, invoke.arguments ?? {}),
      listRevisions: async () => listRevisionsHandler(contextRef.current),
      restoreRevision: async invoke =>
        restoreRevisionHandler(contextRef.current, invoke.arguments ?? {}),
    },
  })
}
