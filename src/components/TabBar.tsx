import { NavLink } from 'react-router'
import { TabIcon } from './ui/TabIcon'

const tabs = [
  { to: '/', label: '今日', icon: 'today' },
  { to: '/cards', label: '卡片', icon: 'cards' },
  { to: '/settings', label: '设置', icon: 'settings' },
] as const

export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 text-[11px] backdrop-blur"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `flex min-h-14 w-16 flex-col items-center justify-center gap-1 ${isActive ? 'text-accent-ink' : 'text-muted'}`}
          >
            {({ isActive }) => (
              <>
                <TabIcon name={t.icon} className={isActive ? 'text-accent-ink' : 'text-muted'} />
                <span className={isActive ? 'font-semibold' : ''}>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
