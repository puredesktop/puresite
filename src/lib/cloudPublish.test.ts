import { describe, expect, it } from 'vitest'
import { siteFor, type CloudSite } from './cloudPublish'

const site = (id: string, sourcePath: string | null): CloudSite => ({ id, title: id, address: `https://cloud.example/p/org/${id}/`, sourcePath, live: null })

describe('siteFor', () => {
  it('picks the site this package was published to before', () => {
    expect(siteFor([site('a', '/Workspace/Drafts/A.site'), site('b', '/Workspace/Drafts/B.site')], '/Workspace/Drafts/B.site/')?.id).toBe('b')
  })
  it('picks the only site there is', () => {
    expect(siteFor([site('a', null)], '/Workspace/Drafts/New.site')?.id).toBe('a')
  })
  it('leaves the choice to the person when there are several', () => {
    expect(siteFor([site('a', null), site('b', null)], '/Workspace/Drafts/New.site')).toBeNull()
  })
})
