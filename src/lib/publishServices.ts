/**
 * Where a site can be published to.
 *
 * The list is not hard-coded. It is read from the tools the user actually
 * has — the same shape PureResearch uses to find its search tools — so a
 * service added to MyTools tomorrow appears here without this app shipping
 * again, and a service turned off disappears.
 *
 * A publish service is recognised by what its operations look like rather
 * than by its name: something that takes a list of files and gives back
 * somewhere to put them. That is the capability; the brand is incidental.
 */
import { listMyTools } from '../bridge/platformBridge'

/** One of the three publish steps: where it goes and how it is asked. */
export interface PublishEndpoint {
  method: string
  /** May carry a `{slug}` placeholder, filled in per request. */
  url: string
}

/**
 * Where a service's three steps go.
 *
 * Composed from the tool's own operations — an operation's absolute
 * `urlTemplate`, or the tool's `baseUrl` plus the operation's `path` — so
 * pointing a tool at a different host redirects the publish without this app
 * shipping again. The built-in service fills anything its tool does not say
 * from the defaults it ships with.
 */
export interface PublishEndpoints {
  create?: PublishEndpoint
  update?: PublishEndpoint
  finalize?: PublishEndpoint
}

export interface PublishService {
  /** Tool id, as MyTools knows it. */
  id: string
  name: string
  description: string
  /** Operation ids for the three steps, when the tool has them. */
  create?: string
  update?: string
  finalize?: string
  /** The three steps' addresses, derived from the tool's own operations. */
  endpoints: PublishEndpoints
  /** True when the tool needs no credential to publish at all. */
  anonymous: boolean
  /** The one this app ships knowing about, and falls back to. */
  builtIn: boolean
  /** Recognised as a publisher by its own shape, rather than by being chosen. */
  looksLikePublisher?: boolean
}

/** here.now is the default because it publishes without an account at all. */
export const DEFAULT_SERVICE_ID = 'herenow'

/**
 * What the built-in service does when its tool does not say otherwise.
 *
 * This is the one place the shipped host's addresses live — configuration for
 * the default service, not logic. A tool whose operations carry their own
 * URLs overrides every entry here.
 */
export const DEFAULT_SERVICE_ENDPOINTS: PublishEndpoints = {
  create: { method: 'POST', url: 'https://here.now/api/v1/publish' },
  update: { method: 'PUT', url: 'https://here.now/api/v1/publish/{slug}' },
  finalize: {
    method: 'POST',
    url: 'https://here.now/api/v1/publish/{slug}/finalize',
  },
}

/** Fill an endpoint's `{slug}` placeholder for one concrete request. */
export function endpointUrl(endpoint: PublishEndpoint, slug?: string): string {
  return endpoint.url.replace(/\{slug\}/g, encodeURIComponent(slug ?? ''))
}

/** True when a URL uses http: or https: and can safely be opened in a browser. */
export function isSafeHttpUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  try {
    const parsed = new URL(rawUrl.trim())
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function isPrivateIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  if ([a, b, c, d].some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  if (a === 0) return true // 0.0.0.0/8 unspecified
  if (a === 10) return true // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true // 192.168.0.0/16 RFC1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // IETF / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast / reserved
  return false
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

/** True when the host is loopback (`localhost`, `127.0.0.1`, `::1`). */
export function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (v4 && Number(v4[1]) === 127) return true
  return false
}

/** True when the host targets loopback, private RFC1918, CGNAT, link-local, metadata, ULA, or internal domains. */
export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (!host) return true
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localdomain') ||
    host === 'ip6-localhost' ||
    host === 'ip6-loopback'
  ) {
    return true
  }

  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (v4) {
    return isPrivateIpv4Octets(Number(v4[1]), Number(v4[2]), Number(v4[3]), Number(v4[4]))
  }

  // IPv6 literal
  if (host.includes(':')) {
    if (host === '::' || host === '::1' || /^0+(?::0+)*$/.test(host) || /^0+(?::0+)*:0*1$/.test(host)) {
      return true
    }
    // IPv4-mapped IPv6 in dotted form ::ffff:a.b.c.d
    const mappedDotted = /^::ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/i.exec(host)
    if (mappedDotted) {
      return isPrivateIpv4Octets(
        Number(mappedDotted[1]),
        Number(mappedDotted[2]),
        Number(mappedDotted[3]),
        Number(mappedDotted[4]),
      )
    }
    // IPv4-mapped IPv6 in WHATWG URL hex form ::ffff:7f00:1
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host)
    if (mappedHex) {
      const hi = parseInt(mappedHex[1]!, 16)
      const lo = parseInt(mappedHex[2]!, 16)
      return isPrivateIpv4Octets((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff)
    }
    if (/^::ffff:/i.test(host)) return true
    // Unique local addresses fc00::/7 (fc.. / fd..)
    if (/^f[cd][0-9a-f]{0,2}:/i.test(host)) return true
    // Link-local fe80::/10 (fe80..febf)
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return true
    // Multicast ff00::/8
    if (/^ff[0-9a-f]{0,2}:/i.test(host)) return true
  }

  return false
}

/**
 * Validate a publishing endpoint URL: require https: on a public host and reject
 * embedded credentials. Loopback endpoints (http/https) are allowed ONLY when
 * explicitly opted in via `allowLocalHttp` / `allowLocalDev`.
 */
export function validatePublishUrl(
  rawUrl: string,
  options?: { allowLocalHttp?: boolean; allowLocalDev?: boolean },
): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid publish URL: ${rawUrl}`)
  }
  if (parsed.username || parsed.password) {
    throw new Error('Publish URL must not contain embedded credentials.')
  }
  const allowLocal = Boolean(options?.allowLocalDev || options?.allowLocalHttp)
  if (allowLocal && isLoopbackHost(parsed.hostname) && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) {
    return parsed
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Publish URL must use https: (got ${parsed.protocol})`)
  }
  if (isPrivateOrInternalHost(parsed.hostname)) {
    throw new Error(`Publish URL must not target a private or internal host (${parsed.hostname}).`)
  }
  return parsed
}

const FILES_KEYS = ['files', 'paths', 'entries']

interface RawOperation {
  id?: unknown
  name?: unknown
  enabled?: unknown
  method?: unknown
  urlTemplate?: unknown
  /** Relative to the tool's baseUrl, on tools that compose addresses. */
  path?: unknown
  inputSchema?: { properties?: Record<string, unknown> }
}

interface RawTool {
  id?: unknown
  name?: unknown
  description?: unknown
  enabled?: unknown
  archived?: unknown
  baseUrl?: unknown
  auth?: { type?: unknown }
  operations?: RawOperation[]
}

function declaresFiles(operation: RawOperation): boolean {
  const properties = operation.inputSchema?.properties ?? {}
  return FILES_KEYS.some(key => key in properties)
}

function operationLike(
  operations: RawOperation[],
  match: (operation: RawOperation) => boolean,
): RawOperation | undefined {
  return operations.find(
    operation => operation.enabled !== false && match(operation),
  )
}

function idOf(operation: RawOperation | undefined): string | undefined {
  return typeof operation?.id === 'string' ? operation.id : undefined
}

/**
 * Where one operation actually goes.
 *
 * A `path` composes with the tool's `baseUrl` — that pair is what lets a
 * self-hosted service be one field away — and an absolute `urlTemplate` is
 * used as it stands. An operation with neither has no address this app can
 * derive, which for the built-in service means the shipped default.
 */
function operationUrl(
  tool: RawTool,
  operation: RawOperation,
): string | undefined {
  const path = typeof operation.path === 'string' ? operation.path.trim() : ''
  const base = typeof tool.baseUrl === 'string' ? tool.baseUrl.trim() : ''
  const candidate =
    path && base
      ? `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
      : typeof operation.urlTemplate === 'string'
        ? operation.urlTemplate.trim()
        : ''
  if (!candidate) return undefined
  try {
    validatePublishUrl(candidate.replace(/\{slug\}/g, 'slug'), { allowLocalHttp: false })
    return candidate
  } catch {
    return undefined
  }
}

function endpointOf(
  tool: RawTool,
  operation: RawOperation | undefined,
  fallbackMethod: string,
): PublishEndpoint | undefined {
  if (!operation) return undefined
  const url = operationUrl(tool, operation)
  if (!url) return undefined
  return {
    method:
      typeof operation.method === 'string' && operation.method
        ? operation.method
        : fallbackMethod,
    url,
  }
}

/** One tool, read as a service — shared by the chooser list and the picker. */
function serviceFrom(tool: RawTool): PublishService {
  const operations = Array.isArray(tool.operations) ? tool.operations : []
  const create = operationLike(
    operations,
    operation => operation.method === 'POST' && declaresFiles(operation),
  )
  const update = operationLike(
    operations,
    operation => operation.method === 'PUT' && declaresFiles(operation),
  )
  const finalize = operationLike(
    operations,
    operation =>
      operation.method === 'POST' &&
      /finali[sz]e/i.test(
        `${String(operation.id ?? '')} ${String(operation.name ?? '')}`,
      ),
  )
  const builtIn =
    String(tool.id ?? '').replace(/[^a-z]/gi, '') === DEFAULT_SERVICE_ID
  const createEndpoint = endpointOf(tool, create, 'POST')
  const updateEndpoint = endpointOf(tool, update, 'PUT')
  const finalizeEndpoint = endpointOf(tool, finalize, 'POST')
  const derived: PublishEndpoints = {
    ...(createEndpoint ? { create: createEndpoint } : {}),
    ...(updateEndpoint ? { update: updateEndpoint } : {}),
    ...(finalizeEndpoint ? { finalize: finalizeEndpoint } : {}),
  }
  return {
    id: String(tool.id ?? ''),
    name: String(tool.name ?? tool.id ?? 'Unnamed tool'),
    description: String(tool.description ?? ''),
    create: idOf(create),
    update: idOf(update),
    finalize: idOf(finalize),
    // The built-in falls back to the addresses this app ships; anything the
    // tool says about itself wins over them.
    endpoints: builtIn ? { ...DEFAULT_SERVICE_ENDPOINTS, ...derived } : derived,
    anonymous: tool.auth?.type === 'none',
    builtIn,
    looksLikePublisher: false,
  }
}

/**
 * Which of the user's tools can publish a site.
 *
 * A tool qualifies when it has an enabled write operation that takes a list
 * of files. Everything else about it — auth, base URL, the rest of its
 * operations — is the tool's business, not this app's.
 */
/**
 * Every tool the user has, whether or not it looks like it can publish.
 *
 * The chooser needs the full list: shape-sniffing is a good default and a bad
 * gate — a tool that names its file list something unexpected is invisible,
 * and the person looking at it can see perfectly well that it publishes.
 */
export function allToolsFrom(tools: unknown): PublishService[] {
  if (!Array.isArray(tools)) return []
  return (tools as RawTool[])
    .filter(tool => tool.enabled && !tool.archived)
    .map(serviceFrom)
}

export function publishServicesFrom(tools: unknown): PublishService[] {
  return allToolsFrom(tools)
    .filter(service => service.create)
    .map(service => ({ ...service, looksLikePublisher: true }))
}

/**
 * The services on offer, best first.
 *
 * Only what is actually installed and enabled. here.now is sorted first when
 * present because it publishes without an account, but it is NOT invented
 * when it is absent: a picker that lists a service you do not have is a
 * button that fails at the end of a build, which is the worst moment to find
 * out. An empty list is honest, and the dialog says what to do about it.
 */
/**
 * What the picker offers, and what the chooser offers.
 *
 * `services` is what publishes: everything recognised by shape, plus anything
 * the person has explicitly chosen. `all` is every enabled tool, for the
 * chooser to list — because the person can see a tool publishes even when
 * this app's heuristic cannot.
 */
export async function loadPublishServices(
  chosen: string[] = [],
): Promise<{ services: PublishService[]; all: PublishService[] }> {
  let raw: unknown = []
  try {
    raw = await listMyTools()
  } catch {
    // No tools available: an empty list, said plainly, beats a guess.
  }
  const all = allToolsFrom(raw)
  const recognised = publishServicesFrom(raw)
  const recognisedIds = new Set(recognised.map(service => service.id))

  const services = [
    ...recognised,
    ...all.filter(
      service => chosen.includes(service.id) && !recognisedIds.has(service.id),
    ),
  ]
  const rank = (service: PublishService): number =>
    (service.builtIn ? 0 : 1) + (service.looksLikePublisher ? 0 : 2)
  return { services: services.sort((a, b) => rank(a) - rank(b)), all }
}
