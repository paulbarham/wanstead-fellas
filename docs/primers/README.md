# Wanstead Fellas — Primers

Shareable, Wanstead-Fellas-branded PDFs for distributing to the WhatsApp group when something material ships in the app. Stored in the repo so they don't get lost when a dev container is cleaned up, and so anyone can browse them on GitHub.

## Index

| # | PDF | Topic | First sent |
|---|---|---|---|
| 01 | [`pdf/01-user-guide.pdf`](pdf/01-user-guide.pdf) | New-fella getting-started guide (sign-up, tabs, week-by-week, World Cup, house rules) | Jun 2026 |
| 02 | [`pdf/02-stats-refresh.pdf`](pdf/02-stats-refresh.pdf) | Stats page refresh — hero strip, podium previews, The Wall, sections, My Stats | Jun 2026 |
| 03 | [`pdf/03-next-game-refresh.pdf`](pdf/03-next-game-refresh.pdf) | Next Game tab refresh — search, tier dots, consolidated masthead, collapsible Not-In with filter chips | Jun 2026 |

## Layout

```
docs/primers/
├── README.md          (this file — keep the index in sync)
├── pdf/               (the rendered PDFs — what gets shared on WhatsApp)
└── src/               (the HTML sources — edit and re-render to update)
```

## Adding a new primer

1. Pick the next number (`03-…`, `04-…`, etc.) — kept simple so the chronology is obvious.
2. Drop a new HTML file in `src/` using the same teletext masthead / dark forest green theme as the existing ones. Copy `src/02-stats-refresh.html` as a starting template.
3. Render to PDF with WeasyPrint:
   ```sh
   weasyprint docs/primers/src/03-your-topic.html docs/primers/pdf/03-your-topic.pdf
   ```
4. Add a row to the index table above.
5. Commit both files in the same commit so HTML source ↔ PDF stay in sync.

## Style guide

- **Masthead:** `WANSTEAD FELLAS` (yellow `#FFD400`) over a green gradient (`#0D6B52` → `#095440`), with a teletext page tag (`P5xx · TOPIC`) on the right.
- **Background:** dark forest green `#0F1710`.
- **Accent palette:** yellow `#FFD400`, cyan `#4AD9FF`, green `#4ADC7A`, magenta `#FF66CC`, red `#FF5555`.
- **Fonts:** Helvetica for body, Courier New for teletext bits (page IDs, section labels, monospace stats), Arial Black for headings.
- Keep it punchy. 2 pages max so it skims well on a phone.
