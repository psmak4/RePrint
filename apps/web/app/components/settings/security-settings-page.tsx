import type { Me, SessionInfo } from '@reprint/shared'
import { ExportSection } from './export-section.js'
import { ChangeEmailForm, ChangePasswordForm, DeleteAccountForm } from './security-forms.js'
import { SessionsSection } from './sessions-section.js'

export function SecuritySettingsPage({ me, sessions }: { me: Me; sessions: SessionInfo[] }) {
  return (
    <div className="flex flex-col gap-12">
      <ChangeEmailForm me={me} />
      <ChangePasswordForm />
      <SessionsSection sessions={sessions} />
      <ExportSection />
      <DeleteAccountForm />
    </div>
  )
}
