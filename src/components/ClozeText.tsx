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
  let ordinal = 0
  return (
    <span className={className}>
      {segments(text, blanks).map((seg, i) => {
        if (!seg.blank) {
          return <span key={i}>{mode === 'highlight' ? withTarget(seg.text, target) : seg.text}</span>
        }
        if (mode === 'highlight') {
          return <mark key={i} className="rounded-full bg-cloze px-1 text-ink">{seg.text}</mark>
        }
        ordinal += 1
        // 读屏不能只听到「空格」：要说第几个、总共几个、几个字母，才算把题目读出来了
        const letters = seg.text.replace(/[^A-Za-z\u00C0-\u024F]/g, '').length
        const position = blanks.length > 1 ? `第 ${ordinal} 个空，共 ${blanks.length} 个` : '一个空'
        return (
          <span
            key={i}
            data-blank
            role="img"
            aria-label={`${position}，${letters} 个字母`}
            className="mx-0.5 inline-block border-b-2 border-accent align-baseline"
            style={{ minWidth: `${Math.max(3, seg.text.length * 0.6)}em` }}
          >
            &nbsp;
          </span>
        )
      })}
    </span>
  )
}
