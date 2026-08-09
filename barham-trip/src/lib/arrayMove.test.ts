import { describe, it, expect } from 'vitest'
import { arrayMove } from './arrayMove'

describe('arrayMove', () => {
  it('moves an element down', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an element up', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when from === to', () => {
    expect(arrayMove(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input', () => {
    const src = ['a', 'b', 'c']
    arrayMove(src, 0, 2)
    expect(src).toEqual(['a', 'b', 'c'])
  })
})
