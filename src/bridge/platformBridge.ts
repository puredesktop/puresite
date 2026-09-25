// The single bridge surface for PureSite. Components never call
// `bridge.call` directly; every shell capability this app uses is a named
// helper here, and method names always come from `PLATFORM_BRIDGE_METHODS`.
import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import {
  createPlatformFolder,
  deletePlatformFile,
  listPlatformFiles,
  readPlatformFileBinary,
  readPlatformFileBinaryDataUrl,
  readPlatformTextFile,
  writePlatformFileBinary,
  writePlatformTextFile,
} from '@purescience/platform-ui/bridge/fs'
import { openExternalUrl as openPlatformExternalUrl } from '@purescience/platform-ui/bridge/os'

export { bridge }

export function isStandaloneDevMode(): boolean {
  return import.meta.env.DEV && window.parent === window
}

// ---- Files ---------------------------------------------------------------

export async function readTextFile(path: string): Promise<string> {
  return readPlatformTextFile(path)
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await writePlatformTextFile(path, content)
}

/** Read a rendered frame back as a data URL so it can be decoded for encoding. */
export async function readBinaryDataUrl(
  path: string,
  maxBytes?: number,
): Promise<string> {
  return readPlatformFileBinaryDataUrl(path, maxBytes)
}

export async function writeBinaryFile(
  path: string,
  base64: string,
): Promise<void> {
  await writePlatformFileBinary(path, base64)
}

/** List a folder — used to report what is in a package's `assets/`. */
export async function listFiles(path: string): Promise<unknown> {
  return listPlatformFiles(path)
}

/** Read a file's bytes as base64, for copying an asset into a package. */
export async function readBinaryBase64(
  path: string,
  maxBytes?: number,
): Promise<{ base64: string; mimeType: string; byteLength?: number }> {
  return readPlatformFileBinary(path, maxBytes) as Promise<{
    base64: string
    mimeType: string
    byteLength?: number
  }>
}

/**
 * Make a folder, or a path of them.
 *
 * The shell makes one folder at a time and refuses a name with a slash in
 * it, so a page two deep ("winners/2025/index.html") asked for a folder that
 * could never be made and the build stopped there. Each segment is made in
 * turn instead, and one that already exists is not a failure.
 */
export async function createFolder(
  parentPath: string,
  name: string,
): Promise<void> {
  let at = parentPath
  for (const segment of name.split('/').filter(Boolean)) {
    try {
      await createPlatformFolder(at, segment)
    } catch (error) {
      // An existing folder is the state we wanted; anything else is real.
      if (!/exist/i.test(error instanceof Error ? error.message : String(error))) throw error
    }
    at = `${at}/${segment}`
  }
}

/** Delete a file in the package; a file already gone is not a failure. */
export async function deleteFileQuietly(path: string): Promise<void> {
  try {
    await deletePlatformFile(path)
  } catch {
    // An evicted snapshot that is already missing is exactly the outcome wanted.
  }
}

// ---- OS -----------------------------------------------------------------

/**
 * Hand a file to the OS, which for an .html file means the real browser.
 *
 * This is the honest check: the app's preview inlines assets so a sandboxed
 * frame can render them, and a browser opening the file from the package
 * resolves the same relative paths the published site will. If it looks right
 * here, the paths are right.
 */
export async function openPath(path: string): Promise<void> {
  await bridge.call(PLATFORM_BRIDGE_METHODS.OS_OPEN_PATH, [path])
}

export async function revealPath(path: string): Promise<void> {
  await bridge.call(PLATFORM_BRIDGE_METHODS.OS_REVEAL, [path])
}

/**
 * Hand a web URL to the real browser.
 *
 * The app runs in a sandboxed frame where a plain `target="_blank"` link goes
 * nowhere, so the live-site link routes through the shell. http(s) only — the
 * shell refuses every other scheme.
 */
export async function openExternalUrl(url: string): Promise<void> {
  await openPlatformExternalUrl(url)
}

// ---- Operations ledger ----------------------------------------------------
// Suite-wide record of user and agent interactions (root AGENTS.md
// "Operations ledger"). A publish leaves a folder behind, so it is
// recorded here as well as centrally for approval-gated tools.
import { recordPlatformOperation as recordPlatformOperationBridge } from '@purescience/platform-ui/bridge/operations'
import type {
  PlatformOperation,
  PlatformOperationInput,
} from '@purescience/platform-ui/bridge/operations'

export type { PlatformOperation, PlatformOperationInput }

/** Record one interaction into the ledger (the shell pins appSlug to this app). */
export async function recordOperation(
  input: PlatformOperationInput,
): Promise<PlatformOperation | null> {
  if (isStandaloneDevMode()) return null
  return recordPlatformOperationBridge(input)
}

// ---- Network ---------------------------------------------------------------
// Publishing talks to a host directly. `networkFetch` allows any https host,
// method and headers, and carries a base64 body — which is what lets a raw
// PUT of file bytes to a presigned URL happen here at all.
import { networkFetch } from '@purescience/platform-ui/bridge/network'

export async function fetchJson(request: {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}): Promise<unknown> {
  const response = (await networkFetch({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })) as { ok?: boolean; status?: number; body?: string }
  const text = response?.body ?? ''
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }
  if (!response?.ok) {
    const detail =
      (parsed as { message?: string; error?: string })?.message ??
      (parsed as { error?: string })?.error ??
      text.slice(0, 200)
    throw new Error(`${request.method} ${request.url} failed (${response?.status ?? 0}): ${detail}`)
  }
  return parsed
}

/**
 * PUT a file's bytes somewhere, exactly as they are.
 *
 * No JSON wrapper: a presigned upload URL expects the file itself, and the
 * signature covers the headers it was given, so those are passed through
 * untouched rather than merged with any of ours.
 */
export async function fetchRaw(request: {
  url: string
  method: string
  headers: Record<string, string>
  body: string
  encoding: 'text' | 'base64'
}): Promise<void> {
  const response = (await networkFetch({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
    ...(request.encoding === 'base64' ? { bodyEncoding: 'base64' } : {}),
  })) as { ok?: boolean; status?: number; body?: string }
  if (!response?.ok) {
    throw new Error(
      `Upload failed (${response?.status ?? 0}): ${(response?.body ?? '').slice(0, 200)}`,
    )
  }
}

/**
 * Read one page of the published site, as a reader would get it.
 *
 * The truth about what is live is the live site, not a copy kept here: a
 * publish from another machine counts, and so does a host that rewrote
 * something on the way out. Failure is ordinary — offline, moved, not
 * published yet — so it answers with null rather than throwing.
 */
export async function fetchLivePage(url: string): Promise<string | null> {
  try {
    const response = (await networkFetch({ url, method: 'GET', headers: {} })) as {
      ok?: boolean
      body?: string
    }
    return response?.ok ? (response.body ?? '') : null
  } catch {
    return null
  }
}

/**
 * The tools the user has.
 *
 * No args array: the handler reads arg0 as its input, so passing an empty
 * one is not the same as passing none — it was enough to make the call come
 * back empty and every publishing service look missing.
 */
export async function listMyTools(): Promise<unknown> {
  return bridge.call(PLATFORM_BRIDGE_METHODS.MYTOOLS_LIST)
}

// Review exports use the platform renderer and native save dialog.
export async function chooseReviewExportPath(defaultName: string, format: 'pdf' | 'png'): Promise<string | null> {
  const result = await bridge.call<{ path?: string | null }>(
    PLATFORM_BRIDGE_METHODS.DIALOG_SAVE_FILE,
    [{ defaultName, filters: [{ name: format.toUpperCase(), extensions: [format] }] }],
  )
  return result?.path || null
}

export async function renderReviewPage(htmlPath: string, outputPath: string, format: 'pdf' | 'png', width: number): Promise<void> {
  if (format === 'pdf') {
    await bridge.call(PLATFORM_BRIDGE_METHODS.RENDER_PRINT_HTML, [{
      htmlPath, outputPath, paginate: 'browser', pageSize: 'A4',
      loadingMessage: 'Exporting page to PDF…',
    }])
  } else {
    await bridge.call(PLATFORM_BRIDGE_METHODS.RENDER_CAPTURE_HTML_IMAGE, [{
      htmlPath, outputPath, width, loadingMessage: 'Exporting full page to PNG…',
    }])
  }
}
