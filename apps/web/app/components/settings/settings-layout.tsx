import { NavLink, Outlet } from 'react-router'
import { copy } from '../../copy/index.js'

const tabs = [
  { to: '/settings/profile', label: copy.settings.profileTab },
  { to: '/settings/security', label: copy.settings.securityTab },
]

/** Shared frame for the settings pages: a heading and a section nav beside the page. */
export function SettingsLayout() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-3xl font-semibold">{copy.settings.title}</h1>
      <nav aria-label={copy.settings.navLabel} className="mt-6 flex gap-4 border-b border-border">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm aria-[current=page]:border-primary aria-[current=page]:font-semibold"
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  )
}
