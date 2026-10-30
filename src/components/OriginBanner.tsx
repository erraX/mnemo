import { isProductionOrigin, PRODUCTION_ORIGIN } from '@/lib/env'

export function OriginBanner({
  current = typeof location === 'undefined' ? '' : location.origin,
  production = PRODUCTION_ORIGIN,
}: { current?: string; production?: string }) {
  if (isProductionOrigin(current, production)) return null
  return (
    <div className="rounded-(--radius-field) border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-fg">
      这不是正式地址，这里的数据不会保留。
    </div>
  )
}
