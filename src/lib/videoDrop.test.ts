// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { insertElement } from './pages'
import { imageTransferMarkup, readImageTransfer } from '@purescience/platform-ui/bridge/imageTransfer'
if ('happyDOM' in window)
  (window as any).happyDOM.settings.disableIframePageLoading = true
it('keeps dropped image bytes in the saved page and preserves its content', () => {
  const image = readImageTransfer(JSON.stringify({ version: 1, name: 'image.png', alt: 'ImageMaker', dataUrl: 'data:image/png;base64,YQ==' }))
  const html = insertElement('<html><body><main><h1>Existing</h1></main></body></html>', { markup: imageTransferMarkup(image) })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(doc.querySelector('main img')?.getAttribute('src')).toBe(image.dataUrl)
  expect(doc.querySelector('h1')?.textContent).toBe('Existing')
})
it('keeps the embed in page flow and preserves existing content', () => {
  const result = insertElement(
    '<html><body><main><h1>Existing</h1></main><footer>Footer</footer></body></html>',
    {
      markup:
        '<figure data-video-source="https://youtube.com/watch?v=M7lc1UVf-VE"><iframe src="https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"></iframe></figure>',
    },
  )
  const doc = new DOMParser().parseFromString(result, 'text/html')
  expect(doc.querySelector('main')?.lastElementChild?.tagName).toBe('FIGURE')
  expect(doc.querySelector('iframe')?.getAttribute('src')).toContain(
    '/embed/M7lc1UVf-VE',
  )
  expect(doc.querySelector('h1')?.textContent).toBe('Existing')
  expect(doc.querySelector('footer')?.textContent).toBe('Footer')
})
