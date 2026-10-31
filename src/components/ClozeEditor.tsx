import type { Blank } from '@/domain/types'
import { tokenize, toggleBlank } from '@/lib/cloze'

export function ClozeEditor({ text, blanks, onChange }: { text: string; blanks: Blank[]; onChange: (blanks: Blank[]) => void }) {
  const isBlank = (start: number, end: number) => blanks.some((b) => b.start === start && b.end === end)
  return (
    <p className="text-base leading-8">
      {tokenize(text).map((t, i) =>
        t.isWord ? (
          <button
            key={i}
            type="button"
            aria-pressed={isBlank(t.start, t.end)}
            onClick={() => onChange(toggleBlank(blanks, t))}
            className={`rounded-sm px-0.5 ${isBlank(t.start, t.end) ? 'bg-cloze text-ink underline decoration-2 underline-offset-4' : ''}`}
          >
            {t.text}
          </button>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </p>
  )
}
