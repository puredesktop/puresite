import { bridge } from '@purescience/platform-ui/bridge/client'

/**
 * Whether this person can print, export and publish here: false for a guest, who has the document and nothing else.
 * Before the host has answered, it says yes, as agentsOffered does.
 */
export function outputOffered(): boolean {
  const methods = bridge.getMethods()
  return !methods.length || methods.includes('render.printHtml')
}
