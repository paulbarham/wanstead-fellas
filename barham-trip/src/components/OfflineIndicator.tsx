import { CloudOff } from 'lucide-react'
import { useOnline } from '../hooks/useOnline'

/** Slim banner shown only when offline — reassures rather than alarms. */
export default function OfflineIndicator() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-semibold text-white"
      style={{ background: 'var(--teal)' }}
    >
      <CloudOff size={14} />
      Offline — the whole plan still works. Ticks sync when you're back.
    </div>
  )
}
