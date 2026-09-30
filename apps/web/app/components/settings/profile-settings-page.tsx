import type { Me } from '@reprint/shared'
import { AvatarForm } from './avatar-form.js'
import { ProfileForm } from './profile-form.js'

export function ProfileSettingsPage({ me }: { me: Me }) {
  return (
    <div className="flex flex-col gap-10">
      <AvatarForm avatarUrl={me.avatarUrl} displayName={me.displayName} />
      <ProfileForm me={me} />
    </div>
  )
}
