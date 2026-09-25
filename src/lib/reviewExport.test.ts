// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { reviewHtml, reviewFilename } from './reviewExport'

describe('review export snapshot', () => {
  it('resolves nested page assets against the site package, including spaces and URL characters', () => {
    const html = '<html><head><link href="../styles/site.css"></head><body><img src="../assets/team.png"><p>Review me</p></body></html>'
    const result = reviewHtml(html, '/tmp/My site #1.site', 'team/index.html')
    const doc = new DOMParser().parseFromString(result, 'text/html')
    const base = doc.querySelector('base')!.href
    expect(new URL('../assets/team.png', base).href).toBe('file:///tmp/My%20site%20%231.site/assets/team.png')
    expect(new URL('../styles/site.css', base).href).toBe('file:///tmp/My%20site%20%231.site/styles/site.css')
    expect(doc.body.textContent).toBe('Review me')
    expect(html).not.toContain('<base')
  })
  it('keeps an authored base URL and handles HTML fragments', () => {
    expect(reviewHtml('<head><base href="https://example.com/"></head>', '/tmp/site', 'index.html').match(/<base /g)).toHaveLength(1)
    expect(reviewHtml('<h1>Draft</h1>', '/tmp/site', 'index.html')).toContain('file:///tmp/site/')
  })
  it('provides safe, page-specific filenames', () => {
    expect(reviewFilename('Our: site', 'team/index.html', 'png')).toBe('Our- site-team-index.png')
    expect(reviewFilename('Our site', 'index.html', 'pdf')).toBe('Our site-index.pdf')
  })
})
