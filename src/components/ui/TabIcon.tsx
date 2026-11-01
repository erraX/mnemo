/**
 * 三个 tab 的字形。手绘 SVG，统一 24×24、1.6 描边、圆头圆角，颜色跟 currentColor。
 * 之前用纯色方块占位：未选中是 1.2:1 的灰块，去掉中文就认不出是哪一屏。
 */
type Props = { name: 'today' | 'cards' | 'settings'; className?: string }

export function TabIcon({ name, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {name === 'today' && (
        <>
          {/* 一张牌：正面朝你，右下角折起一点，暗示"今天这一张" */}
          <rect x="4" y="3.5" width="13" height="17" rx="3" />
          <path d="M18.5 7.5c1 .5 1.5 1.4 1.5 2.6v8.3a2.1 2.1 0 0 1-2.1 2.1H9.2" />
        </>
      )}
      {name === 'cards' && (
        <>
          {/* 一摞卡：三条，最上一条带词头 */}
          <rect x="3" y="4" width="18" height="5" rx="2" />
          <path d="M4 12.5h16M5.5 17h13" />
        </>
      )}
      {name === 'settings' && (
        <>
          {/* 两条滑杆：位置不同，像两个已调过的设置 */}
          <path d="M3 8.5h11M18 8.5h3M3 15.5h5M12 15.5h9" />
          <circle cx="16" cy="8.5" r="1.8" />
          <circle cx="10" cy="15.5" r="1.8" />
        </>
      )}
    </svg>
  )
}
