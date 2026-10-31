import type { Note } from '@/domain/types'
import { ClozeText } from '@/components/ClozeText'
import { PlayButton } from './CardFront'

export function CardBack({ note, onPlay }: { note: Note; onPlay: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[30px] font-bold tracking-tight">{note.headword}</div>
      <div className="flex items-center gap-2 text-[15px] text-muted">
        {note.phonetic && <span>{note.phonetic}</span>}
        <PlayButton onPlay={onPlay} />
      </div>
      <p className="whitespace-pre-line text-base leading-relaxed">{note.meaning}</p>
      {note.examples.map((ex, i) => (
        <div key={i} className="mt-1">
          <ClozeText text={ex.text} blanks={ex.blanks} mode="highlight" className="text-base leading-relaxed" />
          {ex.source && <div className="mt-0.5 text-xs text-muted">— {ex.source}</div>}
        </div>
      ))}
      {note.tags.length > 0 && <div className="text-xs text-muted">{note.tags.map((t) => `#${t}`).join(' ')}</div>}
    </div>
  )
}
