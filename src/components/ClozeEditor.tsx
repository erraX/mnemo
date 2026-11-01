import type { Blank } from '@/domain/types'
import { tokenize, toggleBlank } from '@/lib/cloze'

/**
 * 例句的"挖空"视图：整句唯一的渲染，每个词就是按钮。
 * 不加内边距——行高（leading-8）自己就是命中区；加内边距会让行距断开，读起来像坏掉的文字。
 */
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
            className={`rounded-sm underline underline-offset-4 ${
              isBlank(t.start, t.end)
                ? 'bg-cloze text-ink decoration-accent decoration-2'
                : 'decoration-muted/50 decoration-dotted hover:decoration-muted'
            }`}
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
