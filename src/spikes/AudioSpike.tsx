import { useRef, useState } from 'react'
import { youdaoUrl } from '@/lib/audio'
import type { Accent } from '@/domain/types'

export function AudioSpike() {
  const [text, setText] = useState('concern')
  const [accent, setAccent] = useState<Accent>('us')
  const [log, setLog] = useState<string[]>([])
  const audioRef = useRef<HTMLAudioElement>(null)
  const url = youdaoUrl(text, accent)

  const append = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 30))

  async function prefetch() {
    try {
      const res = await fetch(url, { mode: 'no-cors' })
      append(`prefetch 完成 type=${res.type} status=${res.status}`)
    } catch (e) {
      append(`prefetch 失败 ${(e as Error).message}`)
    }
  }

  async function checkCache() {
    const cache = await caches.open('mnemo-audio')
    const hit = await cache.match(url)
    append(hit ? `缓存命中 type=${hit.type}` : '缓存未命中')
  }

  function play() {
    const el = audioRef.current
    if (!el) return
    el.src = url
    el.play().then(() => append('play() resolved'), (e: Error) => append(`play() 失败 ${e.name}: ${e.message}`))
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold">Spike 1 · 有道音频离线缓存</h1>
      <ol className="list-decimal pl-5 text-sm text-muted">
        <li>从主屏图标打开本页（不是 Safari 标签）</li>
        <li>联网状态下点「预热缓存」，再点「检查缓存」应命中</li>
        <li>开飞行模式，杀掉应用重开本页，点「播放」</li>
        <li>把日志抄到 docs/superpowers/spikes 的结果文件</li>
      </ol>
      <input className="rounded-(--radius-field) border border-line bg-panel p-3 text-base" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        {(['us', 'uk'] as const).map((a) => (
          <button key={a} onClick={() => setAccent(a)} className={`rounded-full border px-3 py-1 ${accent === a ? 'bg-ink text-bg' : 'border-line'}`}>
            {a === 'us' ? '美音' : '英音'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={() => void prefetch()}>预热缓存</button>
        <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={() => void checkCache()}>检查缓存</button>
        <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={play}>播放</button>
      </div>
      <audio ref={audioRef} preload="none" />
      <p className="text-xs text-muted">在线：{String(navigator.onLine)} · SW：{String('serviceWorker' in navigator && !!navigator.serviceWorker.controller)}</p>
      <pre className="whitespace-pre-wrap rounded-(--radius-card) bg-panel p-3 text-xs">{log.join('\n')}</pre>
    </div>
  )
}
