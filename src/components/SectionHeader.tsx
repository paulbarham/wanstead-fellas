export default function SectionHeader({ label, withDivider = false }: { label: string; withDivider?: boolean }) {
  return (
    <div
      className={'flex items-center gap-2' + (withDivider ? ' pb-3 mb-3' : '')}
      style={withDivider ? { borderBottom: '1px solid var(--color-border)' } : undefined}
    >
      <span className="h-3.5 w-1 rounded-full shrink-0" style={{ background: 'var(--color-accent)' }} />
      <h3
        className="text-xs font-bold uppercase leading-tight"
        style={{ color: 'var(--color-accent)', letterSpacing: '1px' }}
      >
        {label}
      </h3>
    </div>
  )
}
