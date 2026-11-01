import type { Rating } from '@/domain/types'

const BUTTONS: Array<{ rating: Rating; label: string; cls: string }> = [
  { rating: 1, label: '忘了', cls: 'bg-again-bg text-again-fg' },
  { rating: 2, label: '困难', cls: 'bg-hard-bg text-hard-fg' },
  { rating: 3, label: '记得', cls: 'bg-good-bg text-good-fg' },
  { rating: 4, label: '简单', cls: 'bg-easy-bg text-easy-fg' },
]

export function GradeBar({ labels, onGrade, disabled = false }: { labels: Record<Rating, string>; onGrade: (r: Rating) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BUTTONS.map((b) => (
        <button
          key={b.rating}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(b.rating)}
          className={`flex h-[52px] flex-col items-center justify-center rounded-xl text-sm font-semibold disabled:opacity-40 ${b.cls}`}
        >
          <span>{b.label}</span>
          <span className="text-[10px] font-normal">{labels[b.rating]}</span>
        </button>
      ))}
    </div>
  )
}
