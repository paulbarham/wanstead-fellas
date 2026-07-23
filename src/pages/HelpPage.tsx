import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import CeefaxHeader from '../components/CeefaxHeader'
import { HELP_ARTICLES, HELP_CATEGORIES, findArticle, type HelpCategory } from '../help'

// Help centre: `/help` shows the categorised index + search box;
// `/help/:slug` renders a specific article. Content lives in src/help
// as markdown files, imported at build time so everything ships in the
// bundle (no runtime fetch, works offline through the service worker).

export default function HelpPage() {
  const { slug } = useParams()
  if (slug) return <HelpArticleView slug={slug} />
  return <HelpIndex />
}

// ─── Index ──────────────────────────────────────────────────────────────

function HelpIndex() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return HELP_ARTICLES
    return HELP_ARTICLES.filter(a =>
      a.title.toLowerCase().includes(q)
      || a.blurb.toLowerCase().includes(q)
      || a.content.toLowerCase().includes(q)
    )
  }, [q])

  // Group by category, preserving the CATEGORY ordering.
  const byCategory = useMemo(() => {
    const map = new Map<HelpCategory, typeof HELP_ARTICLES>()
    for (const cat of HELP_CATEGORIES) map.set(cat.id, [])
    for (const article of filtered) {
      map.get(article.category)?.push(article)
    }
    return HELP_CATEGORIES
      .map(cat => ({ ...cat, articles: map.get(cat.id) ?? [] }))
      .filter(g => g.articles.length > 0)
  }, [filtered])

  return (
    <div className="px-5 py-5">
      <CeefaxHeader pageId="P820 · HELP" title="HELP CENTRE" meta="HOW-TO GUIDES" />

      <div className="mt-4 mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search help articles…"
          className="w-full px-3 py-2.5 rounded-xl text-sm"
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-sm">No help articles match "{query}".</p>
        </div>
      ) : (
        <div className="space-y-6">
          {byCategory.map(cat => (
            <section key={cat.id}>
              <div className="flex items-baseline gap-2 mb-2">
                <span
                  className="text-[10px] tracking-wider"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--tt-cyan)' }}
                >
                  {cat.label.toUpperCase()}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {cat.blurb}
                </span>
              </div>

              <div className="space-y-2">
                {cat.articles.map(article => (
                  <button
                    key={article.slug}
                    onClick={() => navigate(`/help/${article.slug}`)}
                    className="w-full rounded-xl text-left flex items-center gap-3 px-4 py-3 transition-opacity active:opacity-70"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                    >
                      {article.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: 'var(--color-text)', fontWeight: 700 }}
                      >
                        {article.title}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {article.blurb}
                      </p>
                    </div>
                    <span style={{ color: 'var(--color-text-muted)' }} className="text-sm">›</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-[10px] text-center mt-8" style={{ color: 'var(--color-text-muted)' }}>
        Missing an article? Feedback tab · we'll add it.
      </p>
    </div>
  )
}

// ─── Article view ─────────────────────────────────────────────────────────

function HelpArticleView({ slug }: { slug: string }) {
  const navigate = useNavigate()
  const article = findArticle(slug)

  if (!article) {
    return (
      <div className="px-5 py-5">
        <button
          onClick={() => navigate('/help')}
          className="text-xs font-medium mb-3"
          style={{ color: 'var(--tt-cyan)' }}
        >
          ← Back to help
        </button>
        <div className="text-center py-10" style={{ color: 'var(--color-text-muted)' }}>
          <p className="text-3xl mb-2">🤷</p>
          <p className="text-sm">Article not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 py-5">
      <button
        onClick={() => navigate('/help')}
        className="text-xs font-medium mb-3"
        style={{ color: 'var(--tt-cyan)' }}
      >
        ← Help centre
      </button>

      <article className="help-article">
        <ReactMarkdown>{article.content}</ReactMarkdown>
      </article>

      <style>{`
        .help-article h1 {
          font-family: 'Arial Black', 'Helvetica', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: var(--color-text);
          letter-spacing: 0.01em;
          margin: 0 0 12px;
        }
        .help-article h2 {
          font-family: 'Arial Black', 'Helvetica', sans-serif;
          font-size: 16px;
          font-weight: 800;
          color: var(--tt-yellow);
          margin: 20px 0 6px;
          letter-spacing: 0.02em;
        }
        .help-article h2::before { content: "▶ "; color: var(--tt-cyan); }
        .help-article h3 {
          font-size: 13px;
          font-weight: 700;
          color: var(--color-text);
          margin: 14px 0 4px;
        }
        .help-article p {
          font-size: 15px;
          line-height: 1.6;
          color: var(--color-text);
          margin: 6px 0;
        }
        .help-article strong { color: var(--tt-yellow); font-weight: 700; }
        .help-article em { color: var(--tt-cyan); font-style: normal; }
        .help-article code {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          background: var(--color-surface-2);
          color: var(--tt-green);
          padding: 1px 5px;
          border-radius: 3px;
        }
        .help-article ul, .help-article ol {
          margin: 6px 0;
          padding-left: 22px;
        }
        .help-article li {
          font-size: 15px;
          line-height: 1.55;
          margin: 3px 0;
          color: var(--color-text);
        }
        .help-article li::marker { color: var(--tt-yellow); }
        .help-article table {
          width: 100%;
          border-collapse: collapse;
          margin: 8px 0;
          font-size: 13px;
        }
        .help-article th, .help-article td {
          border: 1px solid var(--color-border);
          padding: 6px 8px;
          text-align: left;
          vertical-align: top;
        }
        .help-article th {
          background: var(--color-surface-2);
          color: var(--tt-yellow);
          font-family: ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .help-article td {
          background: var(--color-surface);
          color: var(--color-text);
        }
        .help-article hr {
          border: 0;
          border-top: 1px dashed var(--color-border);
          margin: 16px 0;
        }
      `}</style>

      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-[11px] text-center" style={{ color: 'var(--color-text-muted)' }}>
          Anything missing or wrong on this page? Ping admin via the <em style={{ color: 'var(--tt-cyan)', fontStyle: 'normal' }}>Feedback</em> tab.
        </p>
      </div>
    </div>
  )
}
