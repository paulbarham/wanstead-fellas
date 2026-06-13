import { describe, it, expect } from 'vitest'
import type { Result } from '../types'
import { hasStructuredReport, hasReportContent } from './report'

function result(partial: Partial<Result>): Result {
  return partial as Result
}

describe('hasStructuredReport', () => {
  it('is false for null/undefined', () => {
    expect(hasStructuredReport(null)).toBe(false)
    expect(hasStructuredReport(undefined)).toBe(false)
  })

  it('is false for an empty result', () => {
    expect(hasStructuredReport(result({}))).toBe(false)
  })

  it('is true when a summary is present', () => {
    expect(hasStructuredReport(result({ summary: 'Great game' }))).toBe(true)
  })

  it('is true when there are key highlights', () => {
    expect(hasStructuredReport(result({ key_highlights: [{ note: 'screamer' }] }))).toBe(true)
  })

  it('ignores empty highlight arrays', () => {
    expect(hasStructuredReport(result({ key_highlights: [] }))).toBe(false)
  })

  it('ignores legacy report_text alone', () => {
    expect(hasStructuredReport(result({ report_text: 'old text' }))).toBe(false)
  })
})

describe('hasReportContent', () => {
  it('is true for legacy report_text', () => {
    expect(hasReportContent(result({ report_text: 'old text' }))).toBe(true)
  })

  it('is true for structured content', () => {
    expect(hasReportContent(result({ summary: 'Great game' }))).toBe(true)
  })

  it('is false when there is neither', () => {
    expect(hasReportContent(result({}))).toBe(false)
    expect(hasReportContent(null)).toBe(false)
  })
})
