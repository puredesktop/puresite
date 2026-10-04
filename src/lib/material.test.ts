import { expect, it } from 'vitest'
import { mergeMaterial, notesFrom } from './material'

it('keeps an alias-only asset note through saving and reopening', () => {
  const files = [{ name: 'photo-123.png', bytes: 42 }]
  const renamed = { ...mergeMaterial(files)[0], alias: 'hero' }
  const saved = notesFrom([renamed])
  expect(saved).toEqual([{ name: 'photo-123.png', description: '', alias: 'hero' }])
  expect(mergeMaterial(files, saved)[0].alias).toBe('hero')
})

it('preserves an alias beside a description and role without changing the real path', () => {
  const notes = [{ name: 'mark.svg', description: 'Our mark', alias: 'logo', role: 'logo' as const, described: true }]
  const material = mergeMaterial([{ name: 'mark.svg' }], notes)
  expect(material[0].reference).toBe('assets/mark.svg')
  expect(notesFrom(material)).toEqual(notes)
})
