import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVICE_ENDPOINTS,
  endpointUrl,
  publishServicesFrom,
} from './publishServices'

const herenow = {
  id: 'herenow',
  name: 'here.now',
  description: 'Publish a folder as a live website.',
  enabled: true,
  auth: { type: 'none' },
  operations: [
    {
      id: 'create_site',
      name: 'Create a site',
      enabled: true,
      method: 'POST',
      inputSchema: { properties: { files: {}, displayName: {} } },
    },
    {
      id: 'update_site',
      name: 'Update a site',
      enabled: true,
      method: 'PUT',
      inputSchema: { properties: { slug: {}, files: {} } },
    },
    {
      id: 'finalize',
      name: 'Make a version live',
      enabled: true,
      method: 'POST',
      inputSchema: { properties: { slug: {}, versionId: {} } },
    },
  ],
}

const gmail = {
  id: 'gmail',
  name: 'Gmail',
  enabled: true,
  auth: { type: 'bearer' },
  operations: [
    {
      id: 'send_message',
      enabled: true,
      method: 'POST',
      inputSchema: { properties: { raw: {}, threadId: {} } },
    },
  ],
}

describe('finding the services that can publish', () => {
  it('recognises one by shape, not by name', () => {
    const [service] = publishServicesFrom([herenow])
    expect(service.id).toBe('herenow')
    expect(service.create).toBe('create_site')
    expect(service.update).toBe('update_site')
    expect(service.finalize).toBe('finalize')
    expect(service.anonymous).toBe(true)
  })

  it('leaves out a tool that cannot take a list of files', () => {
    expect(publishServicesFrom([gmail, herenow]).map(s => s.id)).toEqual([
      'herenow',
    ])
  })

  it('picks up an unknown host that speaks the same shape', () => {
    const other = {
      ...herenow,
      id: 'somewhere-else',
      name: 'Somewhere Else',
      auth: { type: 'bearer' },
    }
    const [service] = publishServicesFrom([other])
    expect(service.name).toBe('Somewhere Else')
    expect(service.anonymous).toBe(false)
    expect(service.builtIn).toBe(false)
  })

  it('ignores tools that are off or archived', () => {
    expect(publishServicesFrom([{ ...herenow, enabled: false }])).toEqual([])
    expect(publishServicesFrom([{ ...herenow, archived: true }])).toEqual([])
  })

  it('ignores a publish operation that has been turned off', () => {
    const disabled = {
      ...herenow,
      operations: herenow.operations.map(operation =>
        operation.id === 'create_site'
          ? { ...operation, enabled: false }
          : operation,
      ),
    }
    expect(publishServicesFrom([disabled])).toEqual([])
  })

  it('survives a tools list that is not a list', () => {
    expect(publishServicesFrom(undefined)).toEqual([])
    expect(publishServicesFrom({ tools: [] })).toEqual([])
  })
})

describe('a tool the user added themselves', () => {
  // The exact shape a research-built here.now tool has on disk: a
  // POST publish_site carrying `files`, among a dozen other operations.
  const userBuilt = {
    id: 'here_now',
    name: 'here_now',
    enabled: true,
    auth: { type: 'bearer' },
    operations: [
      {
        id: 'publish_site',
        enabled: true,
        method: 'POST',
        inputSchema: { properties: { files: {}, displayName: {}, spaMode: {} } },
      },
      {
        id: 'finalize_publish',
        enabled: true,
        method: 'POST',
        inputSchema: { properties: { slug: {}, versionId: {} } },
      },
      { id: 'get_site', enabled: true, method: 'GET', inputSchema: { properties: { slug: {} } } },
      { id: 'delete_site', enabled: false, method: 'DELETE', inputSchema: { properties: { slug: {} } } },
    ],
  }

  it('is recognised by shape even with an unfamiliar id', () => {
    const [service] = publishServicesFrom([userBuilt])
    expect(service.id).toBe('here_now')
    expect(service.create).toBe('publish_site')
    expect(service.finalize).toBe('finalize_publish')
  })

  it('counts as the built-in even though its id has an underscore', () => {
    expect(publishServicesFrom([userBuilt])[0].builtIn).toBe(true)
  })
})

describe('where the three steps go', () => {
  it('falls back to the shipped defaults when the built-in tool has no URLs', () => {
    const [service] = publishServicesFrom([herenow])
    expect(service.endpoints).toEqual(DEFAULT_SERVICE_ENDPOINTS)
  })

  it('lets the built-in tool override the defaults it does declare', () => {
    const selfHosted = {
      ...herenow,
      operations: herenow.operations.map(operation =>
        operation.id === 'create_site'
          ? { ...operation, urlTemplate: 'https://my.box/api/v1/publish' }
          : operation,
      ),
    }
    const [service] = publishServicesFrom([selfHosted])
    expect(service.endpoints.create).toEqual({
      method: 'POST',
      url: 'https://my.box/api/v1/publish',
    })
    // What the tool did not say still comes from the defaults.
    expect(service.endpoints.finalize).toEqual(
      DEFAULT_SERVICE_ENDPOINTS.finalize,
    )
  })

  it('derives an unknown host entirely from its own operations', () => {
    const other = {
      ...herenow,
      id: 'somewhere-else',
      operations: [
        {
          ...herenow.operations[0],
          urlTemplate: 'https://somewhere.else/v2/sites',
        },
        {
          ...herenow.operations[1],
          urlTemplate: 'https://somewhere.else/v2/sites/{slug}',
        },
        {
          ...herenow.operations[2],
          urlTemplate: 'https://somewhere.else/v2/sites/{slug}/finalize',
        },
      ],
    }
    const [service] = publishServicesFrom([other])
    expect(service.endpoints).toEqual({
      create: { method: 'POST', url: 'https://somewhere.else/v2/sites' },
      update: { method: 'PUT', url: 'https://somewhere.else/v2/sites/{slug}' },
      finalize: {
        method: 'POST',
        url: 'https://somewhere.else/v2/sites/{slug}/finalize',
      },
    })
  })

  it('composes baseUrl and path without doubling the slash', () => {
    const composed = {
      ...herenow,
      id: 'composed-host',
      baseUrl: 'https://api.composed.host/',
      operations: [{ ...herenow.operations[0], path: '/publish' }],
    }
    const [service] = publishServicesFrom([composed])
    expect(service.endpoints.create?.url).toBe(
      'https://api.composed.host/publish',
    )
  })

  it('leaves an unknown host without URLs with no endpoints at all', () => {
    const [service] = publishServicesFrom([
      { ...herenow, id: 'somewhere-else' },
    ])
    expect(service.endpoints).toEqual({})
  })

  it('fills the slug placeholder, encoded', () => {
    expect(
      endpointUrl(
        { method: 'PUT', url: 'https://h.example/api/publish/{slug}' },
        'my site',
      ),
    ).toBe('https://h.example/api/publish/my%20site')
    expect(
      endpointUrl({ method: 'POST', url: 'https://h.example/api/publish' }),
    ).toBe('https://h.example/api/publish')
  })
})
