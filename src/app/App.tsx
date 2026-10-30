import { HashRouter, Route, Routes } from 'react-router'
import { UpdatePrompt } from './UpdatePrompt'
import { Placeholder } from '@/screens/Placeholder'
import { AudioSpike } from '@/spikes/AudioSpike'
import { TtsSpike } from '@/spikes/TtsSpike'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Placeholder title="今日" />} />
        <Route path="/spike/audio" element={<AudioSpike />} />
        <Route path="/spike/tts" element={<TtsSpike />} />
        <Route path="*" element={<Placeholder title="未找到" />} />
      </Routes>
      <UpdatePrompt />
    </HashRouter>
  )
}
