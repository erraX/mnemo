import type { Blank } from '@/domain/types'
import { segments } from '@/lib/cloze'

export function ClozeText({
  text, blanks, mode, className = '',
}: { text: string; blanks: Blank[]; mode: 'blank' | 'highlight'; className?: string }) {
  return (
    <span className={className}>
      {segments(text, blanks).map((seg, i) =>
        !seg.blank ? (
          <span key={i}>{seg.text}</span>
        ) : mode === 'highlight' ? (
          <mark key={i} className="rounded-full bg-cloze px-1 text-ink">{seg.text}</mark>
        ) : (
          <span
            key={i}
            data-blank
            role="img"
            aria-label="空格"
            className="mx-0.5 inline-block border-b-2 border-accent align-baseline"
            style={{ minWidth: `${Math.max(3, seg.text.length * 0.6)}em` }}
          >
            &nbsp;
          </span>
        ),
      )}
    </span>
  )
}
