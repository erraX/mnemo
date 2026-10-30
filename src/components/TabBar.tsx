import { NavLink } from 'react-router'

const tabs = [
  { to: '/', label: '今日' },
  { to: '/cards', label: '卡片' },
  { to: '/settings', label: '设置' },
]

export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 flex justify-around border-t border-line bg-panel/95 pt-2 text-[10px] backdrop-blur"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) => `flex w-16 flex-col items-center gap-1 ${isActive ? 'text-accent' : 'text-muted'}`}
        >
          {({ isActive }) => (
            <>
              <span className={`block h-6 w-6 rounded-md ${isActive ? 'bg-accent' : 'bg-line'}`} />
              {t.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
