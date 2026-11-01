import type { Card, Note } from '@/domain/types'
import { primaryClozeExample } from '@/lib/cardTypes'
import { ClozeText } from '@/components/ClozeText'

function Label({ children }: { children: string }) {
  return <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{children}</div>
}

export function PlayButton({ onPlay, className = '' }: { onPlay: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="播放发音"
      // 正面整卡可点翻面，播放不能冒泡成翻面
      onClick={(e) => { e.stopPropagation(); onPlay() }}
      className={`grid h-11 w-11 place-items-center rounded-full bg-easy-bg text-sm text-easy-fg ${className}`}
    >▶</button>
  )
}

export function CardFront({ card, note, onPlay }: { card: Card; note: Note; onPlay: () => void }) {
  if (card.type === 'zh2en') {
    return (
      <div className="flex flex-col gap-3">
        <Label>说出英文</Label>
        <p className="whitespace-pre-line text-2xl font-semibold leading-snug">{note.meaning}</p>
      </div>
    )
  }
  if (card.type === 'cloze') {
    const ex = primaryClozeExample(note.examples)
    return (
      <div className="flex flex-col gap-3">
        <Label>填上这个词</Label>
        {ex ? (
          <>
            <ClozeText text={ex.text} blanks={ex.blanks} mode="blank" className="text-[19px] leading-relaxed" />
            {ex.source && <div className="text-xs text-muted">— {ex.source}</div>}
          </>
        ) : (
          <p className="text-sm text-muted">这条记录没有带挖空的例句</p>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Label>这个词什么意思</Label>
      <div className="text-[30px] font-bold tracking-tight">{note.headword}</div>
      <div className="flex items-center gap-2 text-[15px] text-muted">
        {note.phonetic && <span>{note.phonetic}</span>}
        <PlayButton onPlay={onPlay} />
      </div>
    </div>
  )
}
