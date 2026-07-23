// Text-size preference toggle — lives on the Profile page under the
// notifications card. Three-way pick: Compact (today's default),
// Regular (+10%), Large (+20%). Applies live via setTextSize().

import { useState } from 'react'
import { getTextSize, setTextSize, type TextSize } from '../lib/textSize'

interface Option {
  value: TextSize
  label: string
  hint: string
  sample: number  // preview font size in px
}

const OPTIONS: Option[] = [
  { value: 'compact', label: 'Compact', hint: 'Default',  sample: 12 },
  { value: 'regular', label: 'Regular', hint: '+10%',     sample: 14 },
  { value: 'large',   label: 'Large',   hint: '+20%',     sample: 16 },
]

export default function TextSizeToggle() {
  const [size, setSize] = useState<TextSize>(getTextSize())

  function pick(v: TextSize) {
    setSize(v)
    setTextSize(v)
  }

  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            📖 Text size
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Bigger text throughout the app — takes effect instantly. Set
            back to Compact any time to restore the default look.
          </p>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        {OPTIONS.map(o => {
          const active = size === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className="flex-1 py-2.5 rounded-xl transition-colors"
              style={{
                background: active ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: active ? '#FFFFFF' : 'var(--color-text)',
                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
              }}
            >
              <span className="block font-semibold" style={{ fontSize: o.sample, lineHeight: 1 }}>
                {o.label}
              </span>
              <span className="block text-[10px] mt-1"
                style={{ color: active ? 'rgba(255,255,255,0.75)' : 'var(--color-text-muted)' }}>
                {o.hint}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
