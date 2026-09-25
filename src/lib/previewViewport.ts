import { VIEWPORTS, type ViewportId } from '../constants'
export interface PreviewViewport {
  id: ViewportId
  width: number
  height: number
}
export function previewViewport(
  id: ViewportId,
  available: { width: number; height: number },
) {
  const preset = VIEWPORTS.find(item => item.id === id) ?? VIEWPORTS[2]
  const room = Math.max(1, Math.floor(available.width || preset.width))
  const width = id === 'desktop' ? room : preset.width
  const scale = Math.min(1, room / width)
  const height = Math.max(
    1,
    Math.floor((available.height || preset.height) / scale),
  )
  return { id, width, height, scale }
}
