import { copy } from '../../copy/index.js'
import { avatarClass, initialsOf } from '../../lib/avatar.js'
import { RoundPhoto } from './round-photo.js'

/**
 * A Member's large avatar (profile header, settings): their photo, or their initials on the colour
 * their username picks, the same as the small initials beside their reviews (D-214).
 */
export function MemberAvatar({
  url,
  name,
  username,
  alt = copy.profile.avatarAlt(name),
  className = 'size-20 md:size-28',
}: {
  url: string | null
  name: string
  username: string
  alt?: string
  /** The frame's size; the profile header's by default. */
  className?: string
}) {
  return (
    <RoundPhoto
      url={url}
      alt={alt}
      className={`${className} ${avatarClass(username)}`}
      fallback={
        <span aria-hidden="true" className="font-serif text-3xl font-medium md:text-[40px]">
          {initialsOf(name)}
        </span>
      }
    />
  )
}
