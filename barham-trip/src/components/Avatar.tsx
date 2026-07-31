import { initials, type Member } from '../lib/family'

interface Props {
  member: Pick<Member, 'display_name' | 'avatar_url' | 'color'>
  size?: number
  ring?: boolean
}

/** Circular member avatar — photo if set, otherwise a coloured initials dot. */
export default function Avatar({ member, size = 40, ring = false }: Props) {
  const dim = { width: size, height: size, minWidth: size }
  const fontSize = Math.round(size * 0.4)

  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={member.display_name}
        style={{ ...dim, borderRadius: '50%' }}
        className={`object-cover ${ring ? 'ring-2 ring-white' : ''}`}
      />
    )
  }

  return (
    <div
      style={{
        ...dim,
        borderRadius: '50%',
        background: member.color,
        fontSize,
      }}
      className={`grid place-items-center font-semibold text-white ${
        ring ? 'ring-2 ring-white' : ''
      }`}
      aria-label={member.display_name}
    >
      {initials(member.display_name)}
    </div>
  )
}
