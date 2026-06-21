# Wanstead Fellas — Primers & Proposals

Shareable, Wanstead-Fellas-branded PDFs covering two things:

- **Primers** — post-launch comms ("here's what just shipped"), for distributing to the WhatsApp group.
- **Proposals** — pre-build pitches ("here's what we could do and why"), kept here so the design rationale is searchable later.

Stored in the repo so they don't get lost when a dev container is cleaned up, and so anyone can browse them on GitHub.

## Index

| # | PDF | Type | Topic | Date |
|---|---|---|---|---|
| 01 | [`pdf/01-user-guide.pdf`](pdf/01-user-guide.pdf) | Primer | New-fella getting-started guide (original) — *superseded by 05* | Jun 2026 |
| 02 | [`pdf/02-stats-refresh.pdf`](pdf/02-stats-refresh.pdf) | Primer | Stats page refresh — hero strip, podium previews, The Wall, sections, My Stats | Jun 2026 |
| 03 | [`pdf/03-next-game-refresh.pdf`](pdf/03-next-game-refresh.pdf) | Primer | Next Game tab refresh — search, tier dots, consolidated masthead, collapsible Not-In with filter chips | Jun 2026 |
| 04 | [`pdf/04-preferred-position.pdf`](pdf/04-preferred-position.pdf) | Proposal | Player-set preferred position (primary + secondary) — unlocks position-aware stats, card identity, and balancer constraints | Jun 2026 |
| 05 | [`pdf/05-user-guide-v2.pdf`](pdf/05-user-guide-v2.pdf) | Primer | **User guide v2** · supersedes 01 · 4 pages with visual aids · adds Stats redesign, Next Game refresh, position picker, auto WTP fees | Jun 2026 |

> ✏️ **Versioning note.** User guides (and any other primer that gets a refresh) are kept as siblings rather than overwritten so the audit trail of what we told the squad — and when — stays intact. When a primer is superseded, flag the older row with *"superseded by NN"* but don't delete the file.

## Layout

```
docs/primers/
├── README.md          (this file — keep the index in sync)
├── pdf/               (the rendered PDFs — what gets shared / saved)
└── src/               (the HTML sources — edit and re-render to update)
```

## Adding a new one

1. Pick the next number (`05-…`, `06-…`, etc.) — kept simple so the chronology is obvious.
2. Drop a new HTML file in `src/` using the same teletext masthead / dark forest green theme as the existing ones. Copy any of the existing `src/0X-*.html` files as a starting template.
3. Render to PDF with WeasyPrint:
   ```sh
   weasyprint docs/primers/src/05-your-topic.html docs/primers/pdf/05-your-topic.pdf
   ```
4. Add a row to the index table above — flag it as **Primer** (post-launch) or **Proposal** (pre-build).
5. Commit both files in the same commit so HTML source ↔ PDF stay in sync.

## Style guide

- **Masthead:** `WANSTEAD FELLAS` (yellow `#FFD400`) over a green gradient (`#0D6B52` → `#095440`), with a teletext page tag (`P5xx · UPDATE` for primers, `P7xx · PROPOSAL` for proposals) on the right.
- **Background:** dark forest green `#0F1710`.
- **Accent palette:** yellow `#FFD400`, cyan `#4AD9FF`, green `#4ADC7A`, magenta `#FF66CC`, red `#FF5555`.
- **Fonts:** Helvetica for body, Courier New for teletext bits (page IDs, section labels, monospace stats), Arial Black for headings.
- Keep it punchy. 2 pages max so it skims well on a phone.
