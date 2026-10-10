import { NavLink, Outlet } from 'react-router'
import { copy } from '../../copy/index.js'
import { PageHero } from '../books/page-hero.js'

const tabs = [
  { to: '/settings/profile', label: copy.settings.profileTab },
  { to: '/settings/security', label: copy.settings.securityTab },
]

/** Shared frame for the settings pages: the hero band with the title and section tabs. */
export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHero title={copy.settings.title}>
        <nav aria-label={copy.settings.navLabel} className="-mb-9 flex gap-7 md:-mb-14">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="inline-flex h-[52px] items-center border-b-2 border-transparent text-base font-medium text-[#334155] hover:text-foreground aria-[current=page]:border-accent aria-[current=page]:text-foreground"
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </PageHero>
      <div className="mx-auto w-full max-w-3xl">
        <Outlet />
      </div>
    </div>
  )
}
