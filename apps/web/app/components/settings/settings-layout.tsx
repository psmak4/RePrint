import { Outlet, useLocation } from 'react-router'
import { settingsCopy } from '../../copy/settings.js'
import { PageHero } from '../books/page-hero.js'
import { TabNav } from '../common/tab-nav.js'

const tabs = [
  { to: '/settings/profile', label: settingsCopy.profileTab },
  { to: '/settings/security', label: settingsCopy.securityTab },
]

/** Shared frame for the settings pages: the band with the title and section tabs (D-214). */
export function SettingsLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHero
        trail={[{ label: settingsCopy.title }]}
        title={settingsCopy.title}
        tabs={
          <TabNav
            label={settingsCopy.navLabel}
            tabs={tabs.map((tab) => ({ ...tab, current: pathname.startsWith(tab.to) }))}
          />
        }
      />
      <div className="mx-auto w-full max-w-3xl">
        <Outlet />
      </div>
    </div>
  )
}
