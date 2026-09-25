import { describe, expect, it } from 'vitest'
import { fileForName, namedFiles, nameOf, repointAsset, suggestedName, usedOn } from './assetNames'
import type { MaterialItem } from './material'

function file(name: string, alias?: string): MaterialItem {
  return { name, description: '', kind: 'image', reference: `assets/${name}`, ...(alias ? { alias } : {}) } as MaterialItem
}

describe('suggestedName', () => {
  it('drops the extension and the suffix an export tacked on', () => {
    expect(suggestedName('logo-CK55h_T1.png')).toBe('logo')
    expect(suggestedName('Hero Crowd.JPG')).toBe('hero-crowd')
  })

  it('always answers with something usable', () => {
    expect(suggestedName('.png')).toBe('file')
  })
})

describe('naming files', () => {
  const material = [file('logo-CK55h_T1.png', 'logo'), file('hero-crowd.jpg'), file('logo.svg')]

  it('uses the name a person gave, and derives the rest', () => {
    expect(nameOf(material[0]!)).toBe('logo')
    expect(nameOf(material[1]!)).toBe('hero-crowd')
  })

  it('never lets two files answer to the same name', () => {
    expect(namedFiles(material).map(entry => entry.called)).toEqual([
      'logo',
      'hero-crowd',
      'logo-2',
    ])
  })

  it('finds a file by its name or by its file name', () => {
    expect(fileForName(material, 'logo')).toBe('logo-CK55h_T1.png')
    expect(fileForName(material, 'hero-crowd.jpg')).toBe('hero-crowd.jpg')
    expect(fileForName(material, 'nothing')).toBeNull()
  })
})

describe('repointAsset', () => {
  const pages = {
    'index.html': '<img src="assets/logo-CK55h_T1.png"><img src="assets/other.png">',
    'about/index.html': '<img src="../assets/logo-CK55h_T1.png">',
  }

  it('moves every reference, keeping the climb each page needs', () => {
    const next = repointAsset(pages, 'logo-CK55h_T1.png', 'logo.svg')
    expect(next['index.html']).toContain('src="assets/logo.svg"')
    expect(next['about/index.html']).toContain('src="../assets/logo.svg"')
    expect(next['index.html']).toContain('assets/other.png')
  })

  it('says which pages use a file', () => {
    expect(usedOn(pages, 'logo-CK55h_T1.png')).toEqual(['index.html', 'about/index.html'])
    expect(usedOn(pages, 'unused.png')).toEqual([])
  })
})
