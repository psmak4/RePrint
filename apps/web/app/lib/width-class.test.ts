import { describe, expect, it } from 'vitest'
import { widthClass } from './width-class.js'

describe('widthClass', () => {
  it('rounds a fraction to the nearest 5%', () => {
    expect(widthClass(0)).toBe('w-0')
    expect(widthClass(0.86)).toBe('w-[85%]')
    expect(widthClass(0.5)).toBe('w-[50%]')
    expect(widthClass(1)).toBe('w-full')
  })

  it('clamps and tolerates bad input', () => {
    expect(widthClass(-3)).toBe('w-0')
    expect(widthClass(9)).toBe('w-full')
    expect(widthClass(Number.NaN)).toBe('w-0')
  })
})
