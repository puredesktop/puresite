import { expect, it } from 'vitest'
import { previewViewport } from './previewViewport'
it('uses every available desktop pixel without scaling site content', () => {
  expect(previewViewport('desktop', { width: 1576, height: 1100 })).toEqual({
    id: 'desktop',
    width: 1576,
    height: 1100,
    scale: 1,
  })
  expect(previewViewport('desktop', { width: 600, height: 700 })).toEqual({
    id: 'desktop',
    width: 600,
    height: 700,
    scale: 1,
  })
})
it('keeps device width while filling the available height', () => {
  const phone = previewViewport('phone', { width: 1000, height: 800 })
  expect(phone).toEqual({ id: 'phone', width: 390, height: 800, scale: 1 })
  const tablet = previewViewport('tablet', { width: 384, height: 600 })
  expect(tablet.width).toBe(768)
  expect(tablet.scale).toBe(0.5)
  expect(tablet.height * tablet.scale).toBe(600)
})
it('provides a finite viewport before the stage becomes visible', () => {
  const initial = previewViewport('desktop', { width: 0, height: 0 })
  expect(initial.width).toBe(1280)
  expect(initial.height).toBe(900)
})
