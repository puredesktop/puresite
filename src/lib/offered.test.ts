import { describe, expect, it, vi } from 'vitest'
import { bridge } from '@purescience/platform-ui/bridge/client'
import { outputOffered } from './offered'

describe('outputOffered', () => {
  it('says yes until the host has answered', () => {
    vi.spyOn(bridge, 'getMethods').mockReturnValue([])
    expect(outputOffered()).toBe(true)
  })
  it('follows what the host offers: a guest has no renderer', () => {
    vi.spyOn(bridge, 'getMethods').mockReturnValue(['fs.read', 'render.printHtml'])
    expect(outputOffered()).toBe(true)
    vi.spyOn(bridge, 'getMethods').mockReturnValue(['fs.read'])
    expect(outputOffered()).toBe(false)
  })
})
