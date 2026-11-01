import type { ReactNode } from 'react'
import type { Blank } from '@/domain/types'
import { segments } from '@/lib/cloze'

/** 把目标词在普通文本里标成荧光笔块；没有挖空区间时背面也要能指出答案在哪 */
function withTarget(text: string, target: string | undefined): ReactNode {
  const word = target?.trim()
  if (!word) return text
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`\\b(${escaped})\\b`, 'gi'))
  if (parts.length === 1) return text
  const needle = word.toLowerCase()
  return parts.map((part, i) =>
    part.toLowerCase() === needle ? <mark key={i} className="rounded-full bg-cloze px-1 text-ink">{part}</mark> : <span key={i}>{part}</span>,
  )
}

export function ClozeText({
  text, blanks, mode, target, className = '',
}: { text: string; blanks: Blank[]; mode: 'blank' | 'highlight'; target?: string; className?: string }) {
  return (
    <span className={className}>
      {segments(text, blanks).map((seg, i) =>
        !seg.blank ? (
          <span key={i}>{mode === 'highlight' ? withTarget(seg.text, target) : seg.text}</span>
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
