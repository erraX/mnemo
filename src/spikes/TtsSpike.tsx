import { useEffect, useState } from 'react'

export function TtsSpike() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURI] = useState<string>('')
  const [text, setText] = useState('I have some concerns about the proposed timeline.')
  const [log, setLog] = useState<string[]>([])
  const append = (line: string) => setLog((l) => [line, ...l].slice(0, 20))

  useEffect(() => {
    const load = () => {
      const en = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
      setVoices(en)
      if (!voiceURI && en[0]) setVoiceURI(en[0].voiceURI)
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [voiceURI])

  function speak() {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = voices.find((x) => x.voiceURI === voiceURI)
    if (v) u.voice = v
    u.lang = v?.lang ?? 'en-US'
    u.onstart = () => append(`onstart ${v?.name ?? 'default'}`)
    u.onend = () => append('onend')
    u.onerror = (e) => append(`onerror ${e.error}`)
    speechSynthesis.speak(u)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold">Spike 2 · 系统 TTS</h1>
      <p className="text-sm text-muted">分别在铃声模式和静音拨片下点「朗读」，记录是否出声；也记一下可用的英文语音列表。</p>
      <select className="rounded-(--radius-field) border border-line bg-panel p-3 text-base" value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}{v.localService ? '' : ' · 在线'}</option>
        ))}
      </select>
      <textarea className="rounded-(--radius-field) border border-line bg-panel p-3 text-base" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="rounded-(--radius-card) bg-accent p-3 text-white" onClick={speak}>朗读</button>
      <p className="text-xs text-muted">英文语音数：{voices.length}</p>
      <pre className="whitespace-pre-wrap rounded-(--radius-card) bg-panel p-3 text-xs">{log.join('\n')}</pre>
    </div>
  )
}
