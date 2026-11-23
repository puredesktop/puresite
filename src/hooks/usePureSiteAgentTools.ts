/**
 * Registering PureSite's exposed operations with the platform:
 *   - 6 composite `fn_*` functions (always exposed)
 *   - 8 core atomic tools (~23% of 35, always exposed)
 *   - 3 universal escape-hatch meta-tools (`discoverAppTools`,
 *     `callExtendedReadTool`, `callExtendedTool`) giving full on-demand access
 *     to all 27 specialist atomic tools.
 *
 * Handlers read `contextRef.current`, so a tool called while a build is
 * running sees the site as it is now rather than as it was when the drawer
 * opened.
 */
import { useMemo, useRef } from 'react'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  AgentSiteToolError,
  EXPOSED_TOOL_NAMES,
  PURESITE_AGENT_LOG_LABEL,
  type SiteAgentToolContext,
} from '../agents/catalog'
import { buildPureSiteHandlers } from '../agents/operationsRegistry'

export function usePureSiteAgentTools(
  ready: boolean,
  context: SiteAgentToolContext,
): void {
  const contextRef = useRef(context)
  contextRef.current = context

  const registryHandlers = useMemo(
    () => buildPureSiteHandlers(() => contextRef.current),
    [],
  )

  // Statically key-preserving registration so `scripts/check-manifests.mjs`
  // can verify every manifest tool has a live registered handler at build time.
  const handlers = useMemo(
    () =>
      Object.fromEntries(
        EXPOSED_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) =>
            registryHandlers[name]!(invoke),
        ]),
      ),
    [registryHandlers],
  )

  usePlatformAgentTools({
    ready,
    tools: EXPOSED_TOOL_NAMES,
    logLabel: PURESITE_AGENT_LOG_LABEL,
    errorType: AgentSiteToolError,
    handlers,
  })
}
