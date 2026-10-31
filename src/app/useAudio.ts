import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db/db'
import { getSettings } from '@/db/repo'
import { DEFAULT_SETTINGS } from '@/domain/types'
import { createPlayer, prefetchAudio, systemSpeak, unlockSpeech, type PlayOutcome } from '@/lib/audio'

let shared: ReturnType<typeof createPlayer> | undefined
function player() {
  shared ??= createPlayer({ createElement: () => new Audio(), speak: systemSpeak })
  return shared
}

export function useAudio(): { play(text: string): Promise<PlayOutcome>; prefetch(text: string): Promise<void>; accent: 'us' | 'uk' } {
  const settings = useLiveQuery(() => getSettings(db), [], DEFAULT_SETTINGS)
  const accent = settings.accent
  return useMemo(
    () => ({
      accent,
      // play 总是在点击 / 翻面手势内调用，趁机解锁系统 TTS，超时后的降级才能出声
      play: (text: string) => { unlockSpeech(); return player().play(text, accent) },
      prefetch: (text: string) => prefetchAudio(text, accent),
    }),
    [accent],
  )
}
