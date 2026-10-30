import { useEffect, useState } from 'react'
import { db } from '@/db/db'
import { DICT_VERSION } from '@/generated/dict-version'
import { dictUrl } from '@/lib/dict'
import { ensureDictLoaded } from '@/lib/dictLoader'

export interface DictLoadState {
  state: 'idle' | 'loading' | 'ready' | 'error'
  done: number
  total: number
  ms?: number
  entries?: number
  error?: string
}

export function useDictLoader(): DictLoadState {
  const [s, setS] = useState<DictLoadState>({ state: 'idle', done: 0, total: 0 })
  useEffect(() => {
    let cancelled = false
    setS({ state: 'loading', done: 0, total: 0 })
    ensureDictLoaded(db, {
      version: DICT_VERSION,
      url: dictUrl(),
      onProgress: (done, total) => { if (!cancelled) setS({ state: 'loading', done, total }) },
    })
      .then((r) => { if (!cancelled) setS({ state: 'ready', done: r.entries, total: r.entries, ms: r.ms, entries: r.entries }) })
      .catch((e: Error) => { if (!cancelled) setS({ state: 'error', done: 0, total: 0, error: e.message }) })
    return () => { cancelled = true }
  }, [])
  return s
}
