import type { Result } from '../types'

export function hasStructuredReport(r: Result | null | undefined): boolean {
  return Boolean(
    r && (
      r.summary ||
      (r.predictions && r.predictions.rows?.length) ||
      r.key_highlights?.length ||
      r.fines_admin ||
      r.banter?.length ||
      r.app_watch?.length ||
      r.conclusion ||
      r.closer
    )
  )
}

export function hasReportContent(r: Result | null | undefined): boolean {
  return Boolean(r && (hasStructuredReport(r) || r.report_text))
}
