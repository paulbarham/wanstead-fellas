import type { Profile } from '../types'

interface Props {
  profile: Pick<Profile, 'id' | 'name' | 'surname' | 'photo_url'>
  size?: number
}

export default function PlayerAvatar({ profile, size = 40 }: Props) {
  const initials = `${profile.name?.[0] ?? ''}${profile.surname?.[0] ?? ''}`.toUpperCase()

  if (profile.photo_url) {
    return (
      <img
        src={profile.photo_url}
        alt={initials}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-semibold"
      style={{
        width: size,
        height: size,
        background: '#0D6B52',
        color: 'white',
        fontSize: size * 0.35,
      }}
    >
      {initials}
    </div>
  )
}
